const crypto = require("crypto");
const { parseCookies, setCookie, isSecureRequest } = require("./device");

/**
 * CSRF koruması (Double-submit cookie)
 * -----------------------------------
 * - Sunucu, "csrf_token" adlı bir cookie üretir (httpOnly=false).
 * - İstemci, her POST/PUT/PATCH/DELETE isteğinde aynı değeri X-CSRF-Token header'ı ile gönderir.
 * - Sunucu, cookie ve header değerini sabit-süreli karşılaştırır.
 *
 * Not: XSS varsa CSRF zaten anlamını kaybeder. Bu mekanizma klasik "başka siteden form POST"
 * gibi CSRF senaryolarını ciddi ölçüde azaltır.
 */

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a || ""), "utf8").digest();
  const hb = crypto.createHash("sha256").update(String(b || ""), "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeToken() {
  return crypto.randomBytes(32).toString("base64url"); // 256-bit
}

function getOrCreateCsrfToken(req, res) {
  const cookies = parseCookies(req);
  let t = String(cookies.csrf_token || "").trim();

  if (!t || t.length < 24 || t.length > 128) {
    t = makeToken();
    const secure = isSecureRequest(req) || String(process.env.COOKIE_SECURE || "").toLowerCase() === "true";
    setCookie(res, "csrf_token", t, {
      httpOnly: false,  // JS okuyabilsin (header'a koymak için)
      secure,
      sameSite: "Lax",
      maxAge: 60 * 60 * 24 * 365, // 1 yıl
      path: "/",
      priority: "Medium"
    });
  }
  return t;
}

function ensureCsrfCookie(req, res, next) {
  try { getOrCreateCsrfToken(req, res); } catch {}
  return next();
}

function requestPathForMatch(req) {
  // Mounted middleware'lerde req.path mount prefix'i içermeyebilir.
  // Örn: app.use("/api", requireCsrf) altında /api/iyzico/callback isteği,
  // burada "/iyzico/callback" olarak görünebilir. Callback/webhook muafiyetini
  // yanlışlıkla kırmamak için önce originalUrl'e bakıyoruz.
  const original = String(req.originalUrl || "").split("?")[0].trim();
  if (original) return original;

  const base = String(req.baseUrl || "");
  const path = String(req.path || req.url || "").split("?")[0].trim();
  return `${base}${path}` || path;
}

function isExemptPath(req) {
HEAD
  const p = requestPathForMatch(req);

2e5f6be (Fix iyzico CSRF exemption, payment CSRF header, and fraudStatus handling)
  // Ödeme sağlayıcı callback'leri / webhook'lar (cross-site gelebilir)
  //
  // ÖNEMLİ: Bu middleware `app.use("/api", requireCsrf)` altında çalıştığı için
  // `req.path` değerinde "/api" prefix'i olmaz. Bu da "/api/..." ile yapılan
  // eşleşmeleri yanlış yapar.
  //
  // Bu yüzden `originalUrl` (veya baseUrl+path) üstünden tam yolu kontrol ediyoruz.
  const raw = String(req.originalUrl || "");
  const full = (raw ? raw.split("?")[0] : String((req.baseUrl || "") + (req.path || "")));

  if (full.startsWith("/api/iyzico/callback")) return true;
  if (full.startsWith("/api/webhook/")) return true;
  return false;
}

function requireCsrf(req, res, next) {
  const m = String(req.method || "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return next();
  if (isExemptPath(req)) return next();

  const cookies = parseCookies(req);
  const cookieToken = String(cookies.csrf_token || "").trim();
  const headerToken = String(req.get("X-CSRF-Token") || req.get("X-CSRF") || "").trim();

  if (!cookieToken || !headerToken || headerToken.length > 256) {
    return res.status(403).json({ ok: false, error: "CSRF doğrulaması başarısız." });
  }

  try {
    if (!safeEqual(cookieToken, headerToken)) {
      return res.status(403).json({ ok: false, error: "CSRF doğrulaması başarısız." });
    }
  } catch {
    return res.status(403).json({ ok: false, error: "CSRF doğrulaması başarısız." });
  }

  return next();
}

module.exports = {
  getOrCreateCsrfToken,
  ensureCsrfCookie,
  requireCsrf
};
