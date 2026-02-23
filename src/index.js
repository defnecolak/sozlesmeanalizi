"use strict";

/**
 * Sözleşmem - Public launch ready server
 * - Render uyumlu PORT/0.0.0.0 bind
 * - Tek app.listen (çok önemli!)
 * - /healthz endpoint (Render Health Check)
 * - Security headers (Helmet) + CSP nonce
 * - Rate limit + upload guard + anti-abuse
 * - CSRF (yalnızca state-changing istekler)
 */

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const routes = require("./routes");

const { createLogger } = require("./services/logger");
const { requestIdMiddleware } = require("./services/requestId");
const {
  ipRateLimitGlobal,
  ipRateLimitAnalyzeFile,
  ipRateLimitPayments,
} = require("./services/ratelimit");
const { uploadGuard } = require("./services/uploadGuard");
const { requireCsrf, ensureCsrfCookie } = require("./services/csrf");
const { sanitizeRequest } = require("./services/sanitize");
const { hardenHeaders } = require("./services/hardenHeaders");
const { allowlistHosts } = require("./services/allowlistHosts");
const { protectPaymentsPage } = require("./services/paymentsIsolation");
const { blockBadAgents } = require("./services/badAgents");

const app = express();
const log = createLogger({ service: "sozlesmem" });

// Render/Prod config
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

const APP_NAME = process.env.APP_NAME || "Sözleşmem";

// Render: PORT env’den gelir, host 0.0.0.0 olmalı
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

// View engine
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Trust proxy (Render/Cloudflare vb. reverse proxy için)
app.set("trust proxy", 1);

// ----- Global middlewares -----

app.use(requestIdMiddleware());
app.use((req, res, next) => {
  // EJS tarafında kullanılabilir olsun
  res.locals.appName = APP_NAME;
  next();
});

// Basit body limit (DoS azaltır)
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: false, limit: "512kb" }));
app.use(cookieParser());

// Sıkıştırma
app.use(compression());

// Host allowlist (isteğe bağlı)
app.use(allowlistHosts());

// Basit request sanitization
app.use(sanitizeRequest());

// Bot/agent blocklist
app.use(blockBadAgents());

// Global rate limit
app.use(ipRateLimitGlobal);

// Güvenlik header’ları (helmet + custom hardening)
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // PDF/iframe gibi şeyler için bazen gerekebilir
  })
);

// CSP nonce üret (CSP inline script gerekiyorsa)
app.use((req, res, next) => {
  // Her response için nonce
  const nonce = crypto.randomBytes(16).toString("base64");
  res.locals.cspNonce = nonce;

  // Helmet CSP ile nonce
  // Not: dynamic nonce için helmet.contentSecurityPolicy’i request bazlı set ediyoruz
  const csp = helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      scriptSrc: [
        "'self'",
        // nonce
        `'nonce-${nonce}'`,
        // iyzico gibi 3rd party script olacaksa domain eklenir (payments sayfasında)
      ],
      connectSrc: ["'self'", "https:"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: IS_PROD ? [] : null,
    },
  });

  csp(req, res, () => next());
});

// Ek hardening (Referrer-Policy vb.)
app.use(hardenHeaders());

// Static
app.use("/public", express.static(path.join(__dirname, "public"), { maxAge: IS_PROD ? "7d" : 0 }));

// CSRF cookie üret (GET’lerde cookie set edebilir)
app.use(ensureCsrfCookie);

// ----- Health checks (Render uses /healthz) -----
app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

// Eski /health endpoint’i de bırakmak istersen:
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// ----- Payments isolation (iyzico scriptleri daha “saf” alanda) -----
app.use("/payments", protectPaymentsPage);

// ----- API özel rate limitler -----
app.use("/api/payments", ipRateLimitPayments);
app.use("/api/analyze-file", ipRateLimitAnalyzeFile);

// Upload guard (dosya tipi/boyut/virüs opsiyonu vb)
app.use("/api/analyze-file", uploadGuard);

// CSRF doğrulaması (yalnızca state-changing API istekleri)
app.use("/api", requireCsrf);

// Routes
app.use("/", routes);

// 404
app.use((req, res) => {
  res.status(404);
  // API ise JSON, değilse EJS
  if (req.path.startsWith("/api")) {
    return res.json({ ok: false, error: "Not Found" });
  }
  return res.render("404", { title: "Sayfa bulunamadı" });
});

// Son savunma hattı: beklenmeyen hatalar
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Loglarda hassas veri sızmasın: body/metin vb. basma
  log.error("unhandled_error", {
    rid: res.locals.requestId,
    path: req.path,
    method: req.method,
    msg: err?.message || "error",
    // stack prod’da basma (istersen env ile aç)
    stack: IS_PROD ? undefined : err?.stack,
  });

  if (res.headersSent) return;
  res.status(500);

  if (req.path.startsWith("/api")) {
    return res.json({ ok: false, error: "Sunucu hatası" });
  }
  return res.render("500", { title: "Sunucu hatası" });
});

// ----- TEK listen: Render için şart -----
const server = app.listen(PORT, HOST, () => {
  const shownHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`✅ ${APP_NAME} çalışıyor: http://${shownHost}:${PORT}`);
});

// Sunucu timeout ayarları (basit DoS dayanımı)
try {
  server.requestTimeout = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 60_000);
  server.headersTimeout = Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 65_000);
  server.keepAliveTimeout = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 60_000);
} catch (_) {
  // ignore
}

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});