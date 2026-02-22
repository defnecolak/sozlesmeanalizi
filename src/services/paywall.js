const crypto = require("crypto");

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a || ""), "utf8").digest();
  const hb = crypto.createHash("sha256").update(String(b || ""), "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requirePremiumIfEnabled(accessKey) {
  const mode = String(process.env.PAYWALL_MODE || "off").toLowerCase();
  if (mode !== "on") return null;

  const key = String(process.env.PREMIUM_KEY || "").trim();
  if (!key) return "Premium anahtarı yapılandırılmamış (PREMIUM_KEY).";

  const provided = String(accessKey || "").trim();
  if (!provided) return "PDF rapor premium. Geçerli anahtar girin.";
  if (provided.length > 128) return "Premium anahtar formatı geçersiz.";

  if (!safeEqual(provided, key)) return "PDF rapor premium. Geçerli anahtar girin.";
  return null;
}

module.exports = { requirePremiumIfEnabled };
