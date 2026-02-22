const crypto = require("crypto");

function maskEmail(v) {
  const s = String(v || "");
  const parts = s.split("@");
  if (parts.length !== 2) return s;
  const user = parts[0] || "";
  const domain = parts[1] || "";
  const u = user.length <= 2 ? (user[0] ? user[0] + "*" : "*") : (user.slice(0, 2) + "***");
  return `${u}@${domain}`;
}

function maskIban(v) {
  const s = String(v || "").replace(/\s+/g, "");
  if (!/^TR\d{24}$/i.test(s)) return v;
  return s.slice(0, 6) + "…" + s.slice(-4);
}

function maskTcKimlik(v) {
  const s = String(v || "");
  if (!/^\d{11}$/.test(s)) return v;
  return s.slice(0, 3) + "*****" + s.slice(-3);
}

/**
 * Metin redaksiyonu (best-effort)
 * Amaç: loglara “kazara” hassas veri düşerse etkisini azaltmak.
 * Not: %100 garanti değildir; asıl güvenlik prensibi “metni loglama”dır.
 */
function redact(str) {
  let s = String(str || "");

  // IBAN (TR)
  s = s.replace(/\bTR\d{2}\s?\d{4}(\s?\d{4}){5}\b/gi, (m) => maskIban(m));

  // E-posta
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (m) => maskEmail(m));

  // 11 haneli sayı (TC kimlik gibi) — false positive olabilir; logda yine de maskeleyelim
  s = s.replace(/\b(\d{11})\b/g, (m) => maskTcKimlik(m));

  // Çok uzun logları kırp
  if (s.length > 1200) s = s.slice(0, 1200) + "…";
  return s;
}

function safeErr(err) {
  const e = err || {};
  const name = redact(e.name || "Error");
  const message = redact(e.message || String(e));
  const code = redact(e.code || "");
  // Prod'da stack'i yazmıyoruz (sızıntı riskini azalt)
  const includeStack = String(process.env.LOG_STACK || "").toLowerCase() === "true";
  const stack = includeStack ? redact((e.stack || "").split("\n").slice(0, 4).join("\n")) : undefined;
  return { name, message, code, stack };
}

function log(level, tag, payload) {
  try {
    const obj = {
      ts: new Date().toISOString(),
      level,
      tag,
      ...payload
    };
    // JSON line logs (Render / Docker friendly)
    const line = JSON.stringify(obj);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } catch (e) {
    // fallback
    console.error("LOG_FAIL", e && e.message ? e.message : e);
  }
}

function logInfo(tag, payload = {}) {
  log("info", tag, payload);
}

function logWarn(tag, payload = {}) {
  log("warn", tag, payload);
}

function logError(tag, err, payload = {}) {
  log("error", tag, { err: safeErr(err), ...payload });
}

function sha256(v) {
  return crypto.createHash("sha256").update(String(v || "")).digest("hex");
}

module.exports = { redact, safeErr, logInfo, logWarn, logError, sha256 };
