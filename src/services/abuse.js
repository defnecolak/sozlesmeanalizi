/**
 * Basit anti-abuse katmanı (in-memory)
 *
 * Bu katman şunları yapar:
 * - Rate-limit'e giren veya şüpheli istek atan IP'lere “strike” yazar.
 * - Strike birikince IP'yi geçici olarak banlar.
 *
 * Amaç “kırılmaz kale” değil; maliyeti artırmak:
 * - Bot/scan'leri yavaşlatmak
 * - Upload/analiz endpoint'lerini DoS'a karşı daha dayanıklı kılmak
 *
 * Not: In-memory olduğu için restart sonrası temizlenir.
 */

function envBool(name, defVal) {
  const v = process.env[name];
  if (v === undefined) return defVal;
  return String(v).toLowerCase() === "true" || String(v) === "1" || String(v).toLowerCase() === "yes";
}

function envInt(name, defVal) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : defVal;
}

const ENABLED = envBool("ABUSE_SHIELD", true);

// Varsayılanlar (makul + launch için güvenli)
const STRIKE_THRESHOLD = envInt("ABUSE_STRIKE_THRESHOLD", 6); // 6 strike -> ban
const STRIKE_WINDOW_MS = envInt("ABUSE_STRIKE_WINDOW_MS", 15 * 60 * 1000); // 15 dk içinde biriken strike'lar
const BAN_BASE_MS = envInt("ABUSE_BAN_BASE_MS", 10 * 60 * 1000); // 10 dk
const BAN_MAX_MS = envInt("ABUSE_BAN_MAX_MS", 24 * 60 * 60 * 1000); // 24 saat

// ip -> { count, firstAt, lastAt }
const strikes = new Map();
// ip -> { until, reason, at }
const bans = new Map();

function nowMs() {
  return Date.now();
}

function _cleanup() {
  const t = nowMs();

  // expired bans
  for (const [ip, b] of bans.entries()) {
    if (!b || !b.until || b.until <= t) bans.delete(ip);
  }

  // old strike buckets
  for (const [ip, s] of strikes.entries()) {
    if (!s || !s.lastAt) {
      strikes.delete(ip);
      continue;
    }
    if (t - s.lastAt > STRIKE_WINDOW_MS * 2) strikes.delete(ip);
  }
}

// Background cleanup (unref so it doesn't keep the process alive)
try {
  const it = setInterval(_cleanup, 60 * 1000);
  if (typeof it.unref === "function") it.unref();
} catch {}

function isBanned(ip) {
  if (!ENABLED) return false;
  const b = bans.get(ip);
  if (!b) return false;
  if (b.until <= nowMs()) {
    bans.delete(ip);
    return false;
  }
  return true;
}

function banInfo(ip) {
  const b = bans.get(ip);
  if (!b) return null;
  return {
    until: b.until,
    retryAfterSec: Math.max(1, Math.ceil((b.until - nowMs()) / 1000)),
    reason: b.reason || "abuse"
  };
}

function strikeIp(ip, reason = "abuse") {
  if (!ENABLED) return { banned: false, strikes: 0 };
  const t = nowMs();
  const s0 = strikes.get(ip);

  let s;
  if (!s0 || !s0.firstAt || (t - s0.firstAt) > STRIKE_WINDOW_MS) {
    s = { count: 1, firstAt: t, lastAt: t };
  } else {
    s = { ...s0, count: (s0.count || 0) + 1, lastAt: t };
  }
  strikes.set(ip, s);

  if (s.count >= STRIKE_THRESHOLD) {
    const over = Math.max(0, s.count - STRIKE_THRESHOLD);
    // exponential backoff ban
    const dur = Math.min(BAN_MAX_MS, BAN_BASE_MS * Math.pow(2, over));
    bans.set(ip, { until: t + dur, reason, at: t });
    return { banned: true, strikes: s.count, banMs: dur };
  }
  return { banned: false, strikes: s.count };
}

function abuseMiddleware(req, res, next) {
  if (!ENABLED) return next();
  const ip = String(req.ip || "");
  if (!ip) return next();

  if (isBanned(ip)) {
    const info = banInfo(ip);
    if (info) res.setHeader("Retry-After", String(info.retryAfterSec));
    const payload = { ok: false, error: "Çok fazla istek algılandı. Lütfen biraz bekleyin." };
    if (String(req.path || "").startsWith("/api/")) {
      return res.status(429).json(payload);
    }
    return res.status(429).send(payload.error);
  }
  return next();
}

function rateLimitHandler(reason) {
  return (req, res, _next, options) => {
    try { strikeIp(String(req.ip || ""), String(reason || "rate_limit")); } catch {}
    const msg = options?.message || { ok: false, error: "Çok fazla istek." };
    // options.message object olabilir
    return res.status(options?.statusCode || 429).json(msg);
  };
}

module.exports = {
  abuseMiddleware,
  strikeIp,
  rateLimitHandler,
  isBanned,
  banInfo,
};
