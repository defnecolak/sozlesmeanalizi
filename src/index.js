// Lokal geliştirmede .env dosyasını yükle.
// Render gibi ortamlarda env değişkenleri zaten panelden gelir.
if (process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line global-require
  require("dotenv").config();
}

const express = require("express");
const helmet = require("helmet");
const path = require("path");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const crypto = require("crypto");
const fs = require("fs/promises");

const { abuseMiddleware, rateLimitHandler } = require("./services/abuse");
const { ensureCsrfCookie, requireCsrf } = require("./services/csrf");
const { logError } = require("./services/logger");
const routes = require("./routes");

// View'larda sürüm göstermek için
let APP_VERSION = "";
try {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const pkg = require("../package.json");
  APP_VERSION = String(pkg?.version || "");
} catch {}

const app = express();

// EJS tarafında “cspNonce is not defined” edge-case’lerine karşı
app.locals.cspNonce = "";

// Fingerprinting azalt
app.disable("x-powered-by");

// Render / reverse-proxy için gerekli (req.ip, req.secure vs.)
app.set("trust proxy", 1);

// Anti-abuse (in-memory ban / bad actor throttling)
app.use(abuseMiddleware);

// --- Host allowlist (opsiyonel)
// .env: ALLOWED_HOSTS=sozlesmeanalizi.com,www.sozlesmeanalizi.com,sozlesmeanalizi.onrender.com
const _rawAllowedHosts = String(process.env.ALLOWED_HOSTS || "").trim();
const _allowedHosts = new Set(
  _rawAllowedHosts
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

app.use((req, res, next) => {
  if (_allowedHosts.size === 0) return next();

  const hostHeader = String(req.headers.host || "").toLowerCase();
  const hostOnly = hostHeader.split(":")[0];

  const ok = _allowedHosts.has(hostOnly) || _allowedHosts.has(hostHeader);
  if (!ok) return res.status(400).send("Bad Request");
  return next();
});

// HTTP method allowlist (TRACE/CONNECT kapalı)
const ALLOWED_METHODS = new Set(["GET", "POST", "HEAD", "OPTIONS"]);
app.use((req, res, next) => {
  if (!ALLOWED_METHODS.has(req.method)) return res.status(405).send("Method Not Allowed");
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
// Render’da HOST vermesen de olur; 0.0.0.0 güvenli default
const HOST = process.env.HOST || "0.0.0.0";
const APP_NAME = process.env.APP_NAME || "Sözleşmem";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Tüm EJS view’lara ortak değişkenler
app.use((req, res, next) => {
  res.locals.appName = APP_NAME;
  res.locals.appVersion = APP_VERSION;
  next();
});

// CSRF token cookie (double-submit)
app.use(ensureCsrfCookie);

function isSecureReq(req) {
  if (req.secure) return true;
  const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return xfProto === "https";
}

// --- Startup: temp klasörlerini hazırla + periyodik temizle
(async () => {
  try {
    const uploadDir = path.join(process.cwd(), "tmp_uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.mkdir(path.join(process.cwd(), "tmp_ocr"), { recursive: true });

    const ttlMin = Number(process.env.TMP_UPLOAD_TTL_MIN || 30);
    const ttlMs = (Number.isFinite(ttlMin) && ttlMin > 0 ? ttlMin : 30) * 60 * 1000;

    const sweepIntervalMin = Number(process.env.TMP_UPLOAD_SWEEP_MIN || 10);
    const sweepMs =
      (Number.isFinite(sweepIntervalMin) && sweepIntervalMin > 0 ? sweepIntervalMin : 10) *
      60 *
      1000;

    async function sweepTmpUploads() {
      try {
        const now = Date.now();
        const entries = await fs.readdir(uploadDir, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isFile()) continue;
          const fp = path.join(uploadDir, ent.name);
          let st;
          try {
            st = await fs.stat(fp);
          } catch {
            continue;
          }
          const age = now - Number(st.mtimeMs || st.ctimeMs || 0);
          if (age > ttlMs) {
            try {
              await fs.unlink(fp);
            } catch {}
          }
        }
      } catch (e) {
        logError("tmp_uploads_sweep_failed", e);
      }
    }

    await sweepTmpUploads();
    const t = setInterval(sweepTmpUploads, sweepMs);
    t.unref?.();
  } catch (e) {
    console.warn("⚠️ temp klasörleri oluşturulamadı:", e?.message || e);
  }
})();

// --- Request-scoped nonce + request id
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  res.locals.requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", res.locals.requestId);
  next();
});

// --- FORCE_HTTPS (custom domain HTTPS hazır olunca aç)
app.use((req, res, next) => {
  const force = String(process.env.FORCE_HTTPS || "").toLowerCase() === "true";
  if (!force) return next();

  // Health endpointleri deploy sırasında HTTP’den de çalışabilsin
  if (req.path === "/health" || req.path === "/healthz") return next();

  if (isSecureReq(req)) return next();
  const host = req.get("host");
  return res.redirect(301, `https://${host}${req.originalUrl}`);
});

// --- HSTS (yalnız HTTPS üzerinde aç)
app.use((req, res, next) => {
  const enable = String(process.env.HSTS || "").toLowerCase() === "true";
  if (!enable) return next();
  if (!isSecureReq(req)) return next();

  const preload = String(process.env.HSTS_PRELOAD || "").toLowerCase() === "true";
  const maxAge = Number(process.env.HSTS_MAX_AGE || 31536000);
  const parts = [
    `max-age=${Number.isFinite(maxAge) ? Math.max(0, Math.floor(maxAge)) : 31536000}`,
    "includeSubDomains",
  ];
  if (preload) parts.push("preload");
  res.setHeader("Strict-Transport-Security", parts.join("; "));
  return next();
});

// --- Helmet (CSP’yi aşağıda nonce ile kendimiz kuruyoruz)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
  })
);

// Extra hardened headers
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(), payment=(), interest-cohort=()"
  );
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Origin-Agent-Cluster", "?1");
  return next();
});

// --- Nonce-based CSP
app.use((req, res, next) => {
  const nonce =
    res.locals.cspNonce ||
    (res.locals.cspNonce = crypto.randomBytes(16).toString("base64"));

  const isPaymentPage = req.path && String(req.path).startsWith("/odeme");
  const iyzicoHosts = isPaymentPage
    ? ["https://*.iyzipay.com", "https://*.iyzico.com"]
    : [];

  const parts = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `form-action 'self' ${iyzicoHosts.join(" ")}`.trim(),
    `img-src 'self' data: ${iyzicoHosts.join(" ")}`.trim(),
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' ${iyzicoHosts.join(" ")}`.trim(),
    `connect-src 'self' ${iyzicoHosts.join(" ")}`.trim(),
    `frame-src 'self' ${iyzicoHosts.join(" ")}`.trim(),
  ];

  const upgrade = String(
    process.env.CSP_UPGRADE_INSECURE ?? (isSecureReq(req) ? "true" : "false")
  ).toLowerCase() === "true";
  if (upgrade) parts.push("upgrade-insecure-requests");

  res.setHeader("Content-Security-Policy", parts.join("; "));
  next();
});

// --- Performance
app.use(compression());
app.use(
  "/public",
  express.static(path.join(__dirname, "public"), {
    maxAge: "7d",
    immutable: true,
  })
);

// --- Rate limiting (API)
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const max = Number(process.env.RATE_LIMIT_MAX || 80);

app.use(
  "/api/",
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Çok fazla istek. Lütfen biraz bekleyin." },
    handler: rateLimitHandler("api"),
  })
);

// CSRF doğrulaması (yalnızca /api state-changing istekleri)
app.use("/api", requireCsrf);

app.use("/", routes);

// Son savunma hattı: beklenmeyen hatalar
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logError("unhandled_error", err, { rid: res.locals.requestId });
  if (res.headersSent) return;
  res.status(500).send("Sunucu hatası");
});

const server = app.listen(PORT, HOST, () => {
  console.log(`✅ ${APP_NAME} dinlemede: ${HOST}:${PORT}`);
});

// Sunucu timeout ayarları (basit DoS dayanımı)
try {
  server.requestTimeout = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 60_000);
  server.headersTimeout = Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 65_000);
  server.keepAliveTimeout = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 5_000);
} catch {}