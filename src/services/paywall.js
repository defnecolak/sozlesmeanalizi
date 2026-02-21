function requirePremiumIfEnabled(accessKey) {
  const mode = String(process.env.PAYWALL_MODE || "off").toLowerCase();
  if (mode !== "on") return null;

  const key = String(process.env.PREMIUM_KEY || "").trim();
  if (!key) return "Premium anahtarı yapılandırılmamış (PREMIUM_KEY).";
  if (String(accessKey || "").trim() !== key) return "PDF rapor premium. Geçerli anahtar girin.";
  return null;
}

module.exports = { requirePremiumIfEnabled };
