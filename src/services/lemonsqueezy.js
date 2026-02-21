const crypto = require("crypto");

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret) return { ok: false, error: "Webhook secret missing" };
  const sig = Buffer.from(String(signatureHeader || ""), "utf8");
  const hmac = crypto.createHmac("sha256", secret);
  const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
  try {
    if (sig.length !== digest.length) return { ok: false, error: "Signature length mismatch" };
    if (!crypto.timingSafeEqual(digest, sig)) return { ok: false, error: "Invalid signature" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Signature check failed" };
  }
}

function parseJsonEnv(raw, fallback) {
  const s = String(raw || "").trim();
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

function getCheckoutPacks() {
  const packs = parseJsonEnv(process.env.LS_CHECKOUT_PACKS, []);
  if (!Array.isArray(packs)) return [];
  return packs
    .map(p => ({
      label: String(p.label || `${p.credits} Kredi`),
      credits: Number(p.credits || 0),
      url: String(p.url || "")
    }))
    .filter(p => p.credits > 0 && p.url.startsWith("http"));
}

function getVariantCreditsMap() {
  const m = parseJsonEnv(process.env.LS_VARIANT_CREDITS, {});
  if (!m || typeof m !== "object") return {};
  return m;
}

function buildCheckoutUrl(baseUrl, customData) {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(customData || {})) {
    u.searchParams.set(`checkout[custom][${k}]`, String(v));
  }
  return u.toString();
}

module.exports = { verifyWebhookSignature, getCheckoutPacks, buildCheckoutUrl, getVariantCreditsMap };
