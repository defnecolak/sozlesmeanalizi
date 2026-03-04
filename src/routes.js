const express = require("express");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const pkg = require("../package.json");

const { readStore, writeStore } = require("./services/store");
const { ROLE_OPTIONS, PACK_OPTIONS, SENSITIVITY_OPTIONS, ROLE_HELPERS, PACK_HELPERS, PACK_EXAMPLES, PACK_LABELS, SENSITIVITY_HELPERS, SENSITIVITY_LABELS, normalizeRoleId, normalizePackId, normalizeSensitivityId } = require("./services/contractMeta");

const { analyzeContract } = require("./services/analyzer");
const { buildPdfReport } = require("./services/pdf");
const { extractTextFromUpload } = require("./services/extract");
const { maybeScanUpload } = require("./services/antivirus");
const { clampText } = require("./services/text");
const { cleanDisplayName } = require("./services/encoding");
const { requirePremiumIfEnabled } = require("./services/paywall");
const { getOrCreateDeviceId } = require("./services/device");
const { getStatus, canAnalyze, consumeAnalysis, redeemCode, billingMode, freeTrialLimit, applyOrderCreated, applyOrderRefunded, createRestoreToken, restoreFromToken } = require("./services/billing");
const { verifyWebhookSignature, getCheckoutPacks, buildCheckoutUrl, getVariantCreditsMap } = require("./services/lemonsqueezy");
const { createClient: createIyzicoClient, getIyzicoPacks, makeConversationId, buildCheckoutRequest, createCheckoutForm, retrieveCheckoutForm, formatPrice } = require("./services/iyzico");
const { rateLimitHandler, strikeIp } = require("./services/abuse");
const { validateUploadedFile } = require("./services/uploadGuard");
const { logError } = require("./services/logger");

const router = express.Router();

function requireSameOrigin(req, res, next) {
  // CSRF / cross-site POST koruması (cookie tabanlı kredi tüketimi için önemli).
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();

  // Ödeme sağlayıcı callback/webhook'ları cross-origin gelebilir.
  const full = String(req.originalUrl || "");
  if (full.startsWith("/api/webhook/") || full.startsWith("/api/iyzico/callback")) return next();

  const sfs = String(req.get("sec-fetch-site") || "").toLowerCase();
  if (sfs && !["same-origin", "same-site", "none"].includes(sfs)) {
    try { strikeIp(String(req.ip || ""), "cross_site"); } catch {}
    return res.status(403).json({ ok: false, error: "Cross-site istek engellendi" });
  }

  const origin = req.get("origin");
  if (!origin) return next();
  try {
    const u = new URL(origin);
    const host = req.get("host");
    if (u.host !== host) {
      try { strikeIp(String(req.ip || ""), "cross_origin_host"); } catch {}
      return res.status(403).json({ ok: false, error: "Cross-site istek engellendi" });
    }
  } catch {
    // origin parse edilemiyorsa engelleme yerine devam ediyoruz
  }
  return next();
}

// API uçları için same-origin koruması
router.use("/api", requireSameOrigin);

// Daha agresif IP bazlı rate-limit (özellikle ağır endpoint'ler)
const analyzeFileLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ANALYZE_FILE_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_ANALYZE_FILE_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Çok fazla dosya analizi isteği. Lütfen biraz bekleyip tekrar deneyin." },
  handler: rateLimitHandler("analyze-file")
});

const iyzicoInitLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_IYZICO_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_IYZICO_MAX || 12),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Çok fazla ödeme başlatma isteği. Lütfen biraz bekleyin." },
  handler: rateLimitHandler("iyzico-init")
});

// --------------------
// Anti-abuse hardening
// --------------------

// Basit in-memory "slowdown" (DoS/brute-force maliyetini artırır, botları yavaşlatır).
// Yeni dependency eklemeden, küçük bir gecikme uygular.
function makeSlowdown({ windowMs, delayAfter, delayMs, maxDelayMs }) {
  const hits = new Map();

  function cleanup(now) {
    for (const [k, v] of hits.entries()) {
      if (v.resetAt <= now) hits.delete(k);
    }
  }

  // Periyodik temizlik (event-loop'u gereksiz tutmasın)
  try {
    const t = setInterval(() => cleanup(Date.now()), Math.max(10_000, Math.min(windowMs, 60_000)));
    if (t && typeof t.unref === "function") t.unref();
  } catch {}

  return (req, res, next) => {
    const now = Date.now();
    const key = String(req.ip || "ip_unknown");

    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
    }
    rec.count += 1;
    hits.set(key, rec);

    if (rec.count > delayAfter) {
      const over = rec.count - delayAfter;
      const delay = Math.min(over * delayMs, maxDelayMs);
      res.setHeader("X-Slowdown", String(delay));
      return setTimeout(next, delay);
    }
    return next();
  };
}

// /api/analyze-file için (rate-limit'e ek) yavaşlatma
const analyzeFileSlowdown = makeSlowdown({
  windowMs: Number(process.env.SLOWDOWN_ANALYZE_FILE_WINDOW_MS || (10 * 60 * 1000)),
  delayAfter: Number(process.env.SLOWDOWN_ANALYZE_FILE_AFTER || 6),
  delayMs: Number(process.env.SLOWDOWN_ANALYZE_FILE_DELAY_MS || 400),
  maxDelayMs: Number(process.env.SLOWDOWN_ANALYZE_FILE_MAX_MS || 5000)
});

// CPU yoğun işlerde concurrency limiti (basit semafor + kuyruk)
function createSemaphore(max, opts = {}) {
  const limit = Math.max(1, Number(max) || 1);
  const queueMax = Math.max(1, Number(opts.queueMax ?? 40) || 40);
  const waitMs = Math.max(1000, Number(opts.waitMs ?? 20000) || 20000);

  let active = 0;
  const queue = [];

  function releaseNext() {
    while (queue.length) {
      const item = queue.shift();
      if (!item || item.cancelled) continue;
      clearTimeout(item.timer);
      item.released = true;
      item.resolve();
      return;
    }
  }

  return async function run(fn) {
    if (active >= limit) {
      if (queue.length >= queueMax) {
        const e = new Error("Sunucu şu an yoğun. Lütfen biraz sonra tekrar deneyin.");
        e.code = "SERVER_BUSY";
        throw e;
      }

      await new Promise((resolve, reject) => {
        const item = {
          resolve,
          reject,
          released: false,
          cancelled: false,
          timer: null
        };

        item.timer = setTimeout(() => {
          if (item.released) return;
          item.cancelled = true;
          const idx = queue.indexOf(item);
          if (idx >= 0) queue.splice(idx, 1);

          const e = new Error("Sunucu yoğunluğu nedeniyle istek zaman aşımına uğradı. Lütfen tekrar deneyin.");
          e.code = "SERVER_BUSY_TIMEOUT";
          reject(e);
        }, waitMs);

        queue.push(item);
      });
    }

    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      releaseNext();
    }
  };
}

// Ağır işlerde ortak semafor (upload analiz + PDF rapor gibi)
const runHeavyTask = createSemaphore(Number(process.env.HEAVY_TASK_CONCURRENCY || 2), {
  queueMax: Number(process.env.HEAVY_TASK_QUEUE_MAX || 40),
  waitMs: Number(process.env.HEAVY_TASK_QUEUE_WAIT_MS || 20000)
});

// Brute-force / abuse: redeem + restore + report limiter
const redeemLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_REDEEM_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_REDEEM_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Çok fazla kod denemesi. Lütfen biraz bekleyin." },
  handler: rateLimitHandler("redeem")
});

const restoreLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_RESTORE_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_RESTORE_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Çok fazla restore denemesi. Lütfen biraz bekleyin." },
  handler: rateLimitHandler("restore")
});

const reportLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_REPORT_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_REPORT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Çok fazla PDF rapor isteği. Lütfen biraz bekleyin." },
  handler: rateLimitHandler("report")
});

const iyzicoCallbackLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_IYZICO_CALLBACK_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_IYZICO_CALLBACK_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler("iyzico-callback")
});

const MAX_FILE_MB = Number(process.env.UPLOAD_MAX_MB || process.env.MAX_FILE_MB || 10);
const uploadDir = path.join(process.cwd(), "tmp_uploads");

const ALLOWED_EXT = new Set(["pdf", "docx", "txt"]);
const ALLOWED_MIME = {
  pdf: new Set(["application/pdf", "application/octet-stream"]),
  docx: new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/octet-stream"
  ]),
  txt: new Set(["text/plain", "application/octet-stream"])
};

function _extOf(name) {
  return String(path.extname(name || "")).toLowerCase().replace(".", "");
}

function _isAllowedUpload(file) {
  const ext = _extOf(file?.originalname);
  if (!ALLOWED_EXT.has(ext)) return false;
  const allowed = ALLOWED_MIME[ext];
  if (!allowed) return false;
  const mt = String(file?.mimetype || "").toLowerCase();
  return allowed.has(mt);
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (_isAllowedUpload(file)) return cb(null, true);
    const err = new Error("Desteklenmeyen dosya türü. Sadece PDF/DOCX/TXT yükleyebilirsin.");
    err.code = "UNSUPPORTED_FILE";
    return cb(err);
  }
});

const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      // Kasıtlı dosya fuzzing (örn. exe/jpg) denemeleri için hafif strike
      try {
        if (err.code === "UNSUPPORTED_FILE") strikeIp(String(req.ip || ""), "upload_unsupported");
        else strikeIp(String(req.ip || ""), "upload_error");
      } catch {}
      return res.status(400).json({ ok: false, error: err.message });
    }
    return next();
  });
};

const ROLES = ROLE_OPTIONS;

function sanitizeRole(v) {
  return normalizeRoleId(v);
}

function sanitizePack(v) {
  return normalizePackId(v);
}

function sanitizeSensitivity(v) {
  return normalizeSensitivityId(v);
}

function appBaseUrl(req) {
  const base = String(process.env.APP_BASE_URL || "").trim();
  if (base) return base.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

router.get("/", (req, res) => {
  // Üretimde ana domainin "under construction" yerine direkt uygulamaya gitmesi daha iyi.
  res.redirect(302, "/uygulama");
});


router.get("/fiyatlandirma", (req, res) => {
  const prov = String(process.env.PAYMENTS_PROVIDER || "off").toLowerCase();
  const packs = (function(){
    if (prov === "lemonsqueezy") return getCheckoutPacks().map(p => ({ label: p.label, credits: p.credits }));
    if (prov === "iyzico") return getIyzicoPacks().map(p => ({ label: p.label, credits: p.credits, price: p.price, currency: p.currency }));
    return [];
  })();

  res.render("pricing", {
    appName: process.env.APP_NAME || "Sözleşmem",
    supportEmail: process.env.SUPPORT_EMAIL || "",
    billingMode: billingMode(),
    freeTrial: freeTrialLimit(),
    provider: prov,
    packs,
    baseUrl: appBaseUrl(req)
  });
});

router.get("/sss", (req, res) => {
  res.render("faq", {
    appName: process.env.APP_NAME || "Sözleşmem",
    supportEmail: process.env.SUPPORT_EMAIL || "",
    baseUrl: appBaseUrl(req)
  });
});

router.get("/iletisim", (req, res) => {
  res.render("contact", {
    appName: process.env.APP_NAME || "Sözleşmem",
    supportEmail: process.env.SUPPORT_EMAIL || "",
    baseUrl: appBaseUrl(req)
  });
});

router.get("/uygulama", async (req, res) => {
  try { await fs.mkdir(uploadDir, { recursive: true }); } catch {}
  // Analiz sayfası kullanıcı metni içerdiği için cache'lenmesin
  res.setHeader("Cache-Control", "no-store");
  res.render("app", {
    version: pkg.version,
    appName: process.env.APP_NAME || "Sözleşmem",
    supportEmail: process.env.SUPPORT_EMAIL || "",
    maxFileMb: MAX_FILE_MB,
    roles: ROLES,
    packOptions: PACK_OPTIONS,
    sensitivityOptions: SENSITIVITY_OPTIONS,
    appMeta: {
      roleHelpers: ROLE_HELPERS,
      packHelpers: PACK_HELPERS,
      packExamples: PACK_EXAMPLES,
      packLabels: PACK_LABELS,
      sensitivityHelpers: SENSITIVITY_HELPERS,
      sensitivityLabels: SENSITIVITY_LABELS,
    },
    paywallMode: String(process.env.PAYWALL_MODE || "off").toLowerCase(),
    billingMode: billingMode(),
    freeTrial: freeTrialLimit(),
    checkoutUrl: process.env.CHECKOUT_URL || "",
    paymentsProvider: String(process.env.PAYMENTS_PROVIDER || "off").toLowerCase(),
    baseUrl: appBaseUrl(req),
    checkoutPacks: (function(){
      const prov = String(process.env.PAYMENTS_PROVIDER || "off").toLowerCase();
      if (prov === "lemonsqueezy") return getCheckoutPacks().map(p => ({ label: p.label, credits: p.credits }));
      if (prov === "iyzico") return getIyzicoPacks().map(p => ({ label: p.label, credits: p.credits, price: p.price, currency: p.currency }));
      return [];
    })()
  });
});

// Ayrı ödeme sayfası (izolasyon): iyzico scriptleri uygulama sayfasından ayrılır
router.get("/odeme", (req, res) => {
  const provider = String(process.env.PAYMENTS_PROVIDER || "off").toLowerCase();
  if (provider !== "iyzico") {
    return res.status(404).render("404", {
      appName: process.env.APP_NAME || "Sözleşmem",
      supportEmail: process.env.SUPPORT_EMAIL || "",
      baseUrl: appBaseUrl(req)
    });
  }

  const credits = Number(req.query?.credits || 0);
  const packs = getIyzicoPacks().map(p => ({
    label: p.label,
    credits: p.credits,
    price: p.price,
    currency: p.currency
  }));

  // Cache'lenmesin (ödeme/checkout hassas)
  res.setHeader("Cache-Control", "no-store");
  return res.render("payments", {
    appName: process.env.APP_NAME || "Sözleşmem",
    supportEmail: process.env.SUPPORT_EMAIL || "",
    baseUrl: appBaseUrl(req),
    packs,
    preselectCredits: Number.isFinite(credits) ? credits : 0
  });
});

router.get("/gizlilik", (req, res) => res.render("privacy", {
  appName: process.env.APP_NAME || "Sözleşmem",
  supportEmail: process.env.SUPPORT_EMAIL || "",
  baseUrl: appBaseUrl(req),
  lastUpdated: process.env.POLICY_LAST_UPDATED || new Date().toISOString().slice(0, 10),
  tmpUploadTtlMin: Number(process.env.TMP_UPLOAD_TTL_MIN || 30)
}));
router.get("/kvkk", (req, res) => res.render("kvkk", {
  appName: process.env.APP_NAME || "Sözleşmem",
  supportEmail: process.env.SUPPORT_EMAIL || "",
  baseUrl: appBaseUrl(req),
  legalName: process.env.LEGAL_ENTITY_NAME || (process.env.APP_NAME || "Sözleşmem"),
  legalAddress: process.env.LEGAL_ENTITY_ADDRESS || "",
  lastUpdated: process.env.POLICY_LAST_UPDATED || new Date().toISOString().slice(0, 10),
  tmpUploadTtlMin: Number(process.env.TMP_UPLOAD_TTL_MIN || 30)
}));
router.get("/sorumluluk", (req, res) => res.render("disclaimer", { appName: process.env.APP_NAME || "Sözleşmem", supportEmail: process.env.SUPPORT_EMAIL || "", baseUrl: appBaseUrl(req) }));
router.get("/kullanim-sartlari", (req, res) => res.render("terms", { appName: process.env.APP_NAME || "Sözleşmem", supportEmail: process.env.SUPPORT_EMAIL || "", baseUrl: appBaseUrl(req) }));
router.get("/iade", (req, res) => res.render("refund", { appName: process.env.APP_NAME || "Sözleşmem", supportEmail: process.env.SUPPORT_EMAIL || "", baseUrl: appBaseUrl(req) }));
router.get("/health", (req, res) => res.json({ ok: true, name: process.env.APP_NAME || "Sözleşmem" }));
router.get("/healthz", (req, res) => res.json({ ok: true, name: process.env.APP_NAME || "Sözleşmem" }));

// Favicon / PWA
router.get("/favicon.ico", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "assets", "icon.png"));
});
router.get("/manifest.webmanifest", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "manifest.webmanifest"));
});
router.get("/robots.txt", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "robots.txt"));
});
router.get("/sitemap.xml", (req, res) => {
  const base = appBaseUrl(req);
  const urls = [
    "/",
    "/uygulama",
    "/fiyatlandirma",
    "/sss",
    "/iletisim",
    "/sorumluluk",
    "/gizlilik",
    "/kvkk",
    "/kullanim-sartlari",
    "/iade"
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${base}${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  res.type("application/xml").send(xml);
});

router.get("/api/status", async (req, res) => {
  const deviceId = getOrCreateDeviceId(req, res);
  const status = await getStatus(deviceId);
  return res.json({ ok: true, status });
});

router.get("/api/checkout-packs", (req, res) => {
  const provider = String(process.env.PAYMENTS_PROVIDER || "off").toLowerCase();

  if (provider === "lemonsqueezy") {
    const packs = getCheckoutPacks().map(p => ({ label: p.label, credits: p.credits }));
    return res.json({ ok: true, provider, packs });
  }

  if (provider === "iyzico") {
    const packs = getIyzicoPacks().map(p => ({ label: p.label, credits: p.credits, price: p.price, currency: p.currency }));
    return res.json({ ok: true, provider, packs });
  }

  return res.json({ ok: true, provider, packs: [] });
});

router.get("/api/checkout-url", async (req, res) => {
  const provider = String(process.env.PAYMENTS_PROVIDER || "off").toLowerCase();
  if (provider !== "lemonsqueezy") return res.status(400).json({ ok: false, error: "Ödeme sağlayıcı aktif değil." });

  const deviceId = getOrCreateDeviceId(req, res);
  const credits = Number(req.query?.credits || 0);
  if (!Number.isFinite(credits) || credits <= 0) return res.status(400).json({ ok: false, error: "Geçersiz kredi paketi." });

  const pack = getCheckoutPacks().find(p => Number(p.credits) === Number(credits));
  if (!pack) return res.status(404).json({ ok: false, error: "Paket bulunamadı." });

  // Create a user-visible recovery token so credits can be restored if cookies are cleared.
  const rt = await createRestoreToken(deviceId, Math.floor(credits));
  if (!rt.ok) return res.status(500).json({ ok: false, error: "Kurtarma kodu üretilemedi." });

  const url = buildCheckoutUrl(pack.url, {
    device_id: deviceId,
    credits: Math.floor(credits),
    restore_token: rt.token
  });
  return res.json({ ok: true, url, restoreToken: rt.token });
});

// Iyzico Checkout (embedded form)
router.post("/api/iyzico/initiate", iyzicoInitLimiter, express.json({ limit: "40kb" }), async (req, res) => {
  try {
    const provider = String(process.env.PAYMENTS_PROVIDER || "off").toLowerCase();
    if (provider !== "iyzico") return res.status(400).json({ ok: false, error: "Ödeme sağlayıcı aktif değil." });

    const deviceId = getOrCreateDeviceId(req, res);
    const credits = Number(req.body?.credits || 0);
    if (!Number.isFinite(credits) || credits <= 0) return res.status(400).json({ ok: false, error: "Geçersiz kredi paketi." });

    const pack = getIyzicoPacks().find(p => Number(p.credits) === Number(credits));
    if (!pack) return res.status(404).json({ ok: false, error: "Paket bulunamadı." });

    // User-visible recovery token so credits can be restored if cookies are cleared.
    const rt = await createRestoreToken(deviceId, Math.floor(credits));
    if (!rt.ok) return res.status(500).json({ ok: false, error: "Kurtarma kodu üretilemedi." });

    const conversationId = makeConversationId();

    // Persist a pending order (so callback can map it back to device+credits).
    const store = await readStore();
    if (!store.iyzicoOrders) store.iyzicoOrders = {};
    store.iyzicoOrders[conversationId] = {
      deviceId,
      credits: Math.floor(credits),
      restoreToken: rt.token,
      price: Number(pack.price || 0),
      currency: String(pack.currency || "TRY"),
      status: "pending",
      createdAt: new Date().toISOString()
    };
    await writeStore(store);

    const base = String(process.env.APP_BASE_URL || "").trim() || `${req.protocol}://${req.get("host")}`;
    const cleanBase = base.replace(/\/$/, "");
    const callbackUrl = `${cleanBase}/api/iyzico/callback?cid=${encodeURIComponent(conversationId)}`;

    const iyzipay = createIyzicoClient();
    if (!iyzipay) return res.status(500).json({ ok: false, error: "IYZICO_API_KEY / IYZICO_SECRET_KEY eksik." });

    const request = buildCheckoutRequest({
      conversationId,
      price: Number(pack.price || 0),
      currency: pack.currency || "TRY",
      callbackUrl,
      buyer: {
        fullName: req.body?.fullName || "",
        email: req.body?.email || "",
        phone: req.body?.phone || "",
        identityNumber: req.body?.identityNumber || ""
      },
      ip: req.ip
    });

    const result = await createCheckoutForm(iyzipay, request);
    const ok = String(result?.status || "").toLowerCase() === "success";
    if (!ok) {
      return res.status(400).json({ ok: false, error: result?.errorMessage || "Ödeme formu oluşturulamadı." });
    }

    // Store token for debugging (optional)
    try {
      const store2 = await readStore();
      if (store2.iyzicoOrders && store2.iyzicoOrders[conversationId]) {
        store2.iyzicoOrders[conversationId].token = result.token;
        store2.iyzicoOrders[conversationId].checkoutCreatedAt = new Date().toISOString();
        await writeStore(store2);
      }
    } catch {}

    return res.json({
      ok: true,
      conversationId,
      restoreToken: rt.token,
      pack: { credits: Math.floor(credits), price: Number(pack.price || 0), currency: String(pack.currency || "TRY"), label: pack.label },
      checkoutFormContent: result.checkoutFormContent || "",
      token: result.token || ""
    });
  } catch (err) {
    logError("routes_error", err, { rid: res.locals.requestId });
    return res.status(500).json({ ok: false, error: "Iyzico isteği sırasında hata oluştu." });
  }
});

// Iyzico callback: iyzico sends POST token back to callbackUrl
router.post("/api/iyzico/callback", iyzicoCallbackLimiter, express.urlencoded({ extended: false }), express.json({ limit: "40kb" }), async (req, res) => {
  try {
    const provider = String(process.env.PAYMENTS_PROVIDER || "off").toLowerCase();
    if (provider !== "iyzico") return res.status(400).send("disabled");

    const cid = String(req.query?.cid || req.body?.conversationId || "").trim();
    const token = String(req.body?.token || req.query?.token || "").trim();
    if (!cid || !token) return res.status(200).send("missing");

    const store = await readStore();
    const rec = store?.iyzicoOrders?.[cid];
    if (!rec) return res.status(200).send("unknown_order");

    const iyzipay = createIyzicoClient();
    if (!iyzipay) return res.status(500).send("config_missing");

    const result = await retrieveCheckoutForm(iyzipay, {
      locale: "tr",
      conversationId: cid,
      token
    });

    const apiOk = String(result?.status || "").toLowerCase() === "success";
    const payStatus = String(result?.paymentStatus || "").toUpperCase();
    const paymentId = String(result?.paymentId || "").trim();

    // Save raw info for debugging
    store.iyzicoOrders[cid] = {
      ...rec,
      token,
      lastResultAt: new Date().toISOString(),
      lastStatus: result?.status || null,
      paymentStatus: result?.paymentStatus || null,
      paymentId: paymentId || null
    };

    if (apiOk && (payStatus === "SUCCESS" || payStatus === "PAID")) {
      // Grant credits (idempotent by paymentId if present)
      const orderId = paymentId || cid;
      await applyOrderCreated({
        deviceId: String(rec.deviceId || ""),
        orderId,
        credits: Number(rec.credits || 0),
        provider: "iyzico",
        restoreToken: String(rec.restoreToken || "")
      });

      store.iyzicoOrders[cid].status = "paid";
      store.iyzicoOrders[cid].paidAt = new Date().toISOString();
    }

    await writeStore(store);
    return res.status(200).send("ok");
  } catch (err) {
    logError("routes_error", err, { rid: res.locals.requestId });
    return res.status(200).send("error");
  }
});

router.post("/api/redeem", redeemLimiter, express.json({ limit: "20kb" }), async (req, res) => {
  const deviceId = getOrCreateDeviceId(req, res);
  const code = req.body?.code;
  const r = await redeemCode(deviceId, code);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error || "Kod aktifleştirilemedi." });
  return res.json({ ok: true, added: r.added, status: r.status });
});

router.post("/api/restore", restoreLimiter, express.json({ limit: "20kb" }), async (req, res) => {
  const deviceId = getOrCreateDeviceId(req, res);
  const token = req.body?.token;
  const r = await restoreFromToken(deviceId, token);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error || "Kredi kurtarılamadı." });
  return res.json({ ok: true, status: r.status });
});

// Lemon Squeezy Webhook (raw body required for signature check)
router.post("/api/webhook/lemonsqueezy", express.raw({ type: "application/json" }), async (req, res) => {
  const secret = String(process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "");
  const signature = req.get("X-Signature");
  const rawBody = req.body; // Buffer

  const ver = verifyWebhookSignature(rawBody, signature, secret);
  if (!ver.ok) return res.status(401).send("Invalid signature");

  let payload = null;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  const eventName = payload?.meta?.event_name;
  const custom = payload?.meta?.custom_data || {};
  const data = payload?.data || {};
  const orderId = String(data?.id || "");
  const attrs = data?.attributes || {};

  // We only grant on paid orders
  if (eventName === "order_created") {
    const status = String(attrs?.status || "").toLowerCase();
    if (status && status !== "paid") return res.status(200).send("ignored");

    const deviceId = String(custom?.device_id || "").trim();
    let credits = Number(custom?.credits || 0);
    const restoreToken = String(custom?.restore_token || "").trim();

    if (!credits || credits <= 0) {
      // fallback: map by variant_id (if configured)
      const variantId = String(attrs?.first_order_item?.variant_id || "");
      const map = getVariantCreditsMap();
      const mapped = map?.[variantId];
      credits = Number(mapped || 0);
    }

    if (!deviceId || !orderId || !credits || credits <= 0) {
      // Accept to avoid retries, but do nothing
      return res.status(200).send("missing_custom_data");
    }

    await applyOrderCreated({ deviceId, orderId, credits, provider: "lemonsqueezy", restoreToken });
    return res.status(200).send("ok");
  }

  if (eventName === "order_refunded") {
    if (!orderId) return res.status(200).send("ok");
    await applyOrderRefunded({ orderId, provider: "lemonsqueezy" });
    return res.status(200).send("ok");
  }

  return res.status(200).send("ok");
});

router.get("/ornek-rapor", (req, res) => {
  const demo = getDemoText();
  const analysis = analyzeContract(demo, { role: "genel", pack: "genel" });

    res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=\"ornek-sozlesme-risk-raporu.pdf\"");

  const doc = buildPdfReport({
    analysis,
    text: demo,
    appName: process.env.APP_NAME || "Sözleşmem",
    extracted: { fileName: "demo.txt" },
    options: { includeAppendix: false }
  });
  doc.pipe(res);
  doc.end();
});

router.post("/api/analyze-demo", express.json({ limit: "120kb" }), (req, res) => {
  const role = sanitizeRole(req.body?.role);
  const pack = sanitizePack(req.body?.pack);
  const sensitivity = sanitizeSensitivity(req.body?.sensitivity);
  const demo = getDemoText();
  const analysis = analyzeContract(demo, { role, pack, sensitivity });

  return res.json({ ok: true, extracted: { fileName: "demo.txt" }, analysis, text: demo });
});

router.post("/api/analyze-file", analyzeFileLimiter, analyzeFileSlowdown, uploadSingleFile, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "Dosya seçilmedi." });

    const role = sanitizeRole(req.body?.role);
    const pack = sanitizePack(req.body?.pack);
    const sensitivity = sanitizeSensitivity(req.body?.sensitivity);

    const deviceId = getOrCreateDeviceId(req, res);
    const gate = await canAnalyze(deviceId);
    if (!gate.ok) {
      return res.status(402).json({ ok: false, error: gate.reason, status: gate.status });
    }

    // CPU yoğun akışı concurrency limitiyle çalıştır (DoS dayanımı)
    return await runHeavyTask(async () => {
		const originalname = cleanDisplayName(req.file.originalname || "sozlesme");
		const { mimetype, path: filePath } = req.file;

		// 0) Upload guard: MIME/uzantı + magic + DOCX zip-bomb/macros gibi kontroller
		try {
			await validateUploadedFile({ filePath, originalname, mimetype });
		} catch (e) {
			try { strikeIp(String(req.ip || ""), "bad_upload"); } catch {}
			return res.status(400).json({ ok: false, error: e?.message || "Dosya doğrulanamadı." });
		}

		// 1) (Opsiyonel) antivirüs taraması — upload DoS / kötü amaçlı dosya riskini azaltır
		const scan = await maybeScanUpload(filePath);
		if (!scan.ok) {
			try { strikeIp(String(req.ip || ""), "av_scan_fail"); } catch {}
			const status = Number(scan.status || 400);
			return res.status(status).json({ ok: false, error: scan.userMessage || "Dosya güvenlik kontrolünden geçmedi." });
		}

		const extracted = await extractTextFromUpload({ filePath, originalname, mimetype });

    const maxChars = Number(process.env.MAX_TEXT_CHARS || 140000);
    const text = clampText(extracted.text || "", maxChars);

    if (!text || text.trim().length < 220) {
      return res.status(400).json({ ok: false, error: "Metin çıkarılamadı veya çok kısa. (Taranmış PDF olabilir.)" });
    }

    const analysis = analyzeContract(text, { role, pack, sensitivity, quality: extracted.quality });

    // Client'a dönerken aşırı büyük payload'ları sınırlayalım
    const safeText = text;
    const safeAnalysis = (analysis && typeof analysis === "object") ? analysis : null;
    if (safeAnalysis && Array.isArray(safeAnalysis.issues) && safeAnalysis.issues.length > 250) {
      safeAnalysis.issues = safeAnalysis.issues.slice(0, 250);
    }

    // Consume 1 quota (free or credit) only after successful analysis
    const status = await consumeAnalysis(deviceId);

    return res.json({
      ok: true,
      extracted: { fileName: extracted.fileName, quality: extracted.quality },
      analysis: safeAnalysis,
      text: safeText,
      status
    });
    });

  } catch (err) {
    logError("routes_error", err, { rid: res.locals.requestId });
    return res.status(500).json({ ok: false, error: err?.message || "Analiz sırasında hata oluştu." });
  } finally {
    try { if (req.file?.path) await fs.unlink(req.file.path); } catch {}
  }
});

router.post("/api/report", reportLimiter, express.json({ limit: "5mb" }), async (req, res) => {
  try {
    const { analysis, text, extracted, accessKey } = req.body || {};
    const maxChars = Number(process.env.MAX_TEXT_CHARS || 140000);
    const safeText = clampText(String(text || ""), maxChars);
    // PDF raporu da hassas olabilir; cache'lenmesin
    res.setHeader("Cache-Control", "no-store");

    // Aşırı büyük rapor üretimini (DoS) azaltmak için makul sınırlar
    const safeAnalysis = (analysis && typeof analysis === "object") ? analysis : null;
    if (safeAnalysis && Array.isArray(safeAnalysis.issues) && safeAnalysis.issues.length > 250) {
      safeAnalysis.issues = safeAnalysis.issues.slice(0, 250);
    }

    if (!analysis || !text) return res.status(400).json({ ok: false, error: "Eksik veri." });

    const premiumErr = requirePremiumIfEnabled(accessKey);
    if (premiumErr) return res.status(402).json({ ok: false, error: premiumErr });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"sozlesme-risk-raporu.pdf\"");

    await runHeavyTask(async () => {
    const doc = buildPdfReport({
      analysis: safeAnalysis,
      text: safeText,
      appName: process.env.APP_NAME || "Sözleşmem",
      extracted: extracted || null,
      options: { includeAppendix: true }
    });
    doc.pipe(res);
    doc.end();
    });
  } catch (err) {
    logError("routes_error", err, { rid: res.locals.requestId });
    return res.status(500).json({ ok: false, error: "PDF üretilemedi." });
  }
});

function getDemoText() {
  return `SÖZLEŞME ÖRNEĞİ (DEMO)
MADDE 1 - KAPSAM
1.1 Hizmet veren, müşteri tarafından talep edilen tasarım işlerini gerçekleştirecektir.

MADDE 2 - ÜCRET VE ÖDEME
2.1 Hizmet bedeli iade edilmez. Ücret iadesi yapılmaz.
2.2 Ödeme teslim sonrası yapılacaktır.

MADDE 3 - FESİH
3.1 Taraflardan biri herhangi bir gerekçe göstermeksizin sözleşmeyi derhal feshedebilir.

MADDE 4 - REVİZYON
4.1 Sınırsız revizyon talep edilebilir.

MADDE 5 - FİKRİ MÜLKİYET
5.1 Üretilen işlere ilişkin tüm fikri mülkiyet hakları münhasıran karşı tarafa devredilir.
5.2 Hizmet veren portföyünde paylaşamaz.

MADDE 6 - VERİ PAYLAŞIMI
6.1 Kişisel veriler üçüncü kişilerle paylaşılabilir.
`;
}

// 404 (sonda kalsın)
router.use((req, res) => {
  res.status(404).render("404", {
    appName: process.env.APP_NAME || "Sözleşmem",
    supportEmail: process.env.SUPPORT_EMAIL || "",
    baseUrl: appBaseUrl(req)
  });
});

module.exports = router;
