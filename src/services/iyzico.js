const Iyzipay = require("iyzipay");
const crypto = require("crypto");

function parseJsonEnv(raw, fallback) {
  const s = String(raw || "").trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function getIyzicoEnv() {
  const env = String(process.env.IYZICO_ENV || "sandbox").toLowerCase();
  const isLive = env === "live" || env === "production" || env === "prod";

  const apiKey = String(process.env.IYZICO_API_KEY || "").trim();
  const secretKey = String(process.env.IYZICO_SECRET_KEY || "").trim();

  // You can override the base URI manually.
  const uri = String(
    process.env.IYZICO_URI || (isLive ? "https://api.iyzipay.com" : "https://sandbox-api.iyzipay.com")
  ).trim();

  return {
    env: isLive ? "live" : "sandbox",
    apiKey,
    secretKey,
    uri,
    enabled: !!(apiKey && secretKey)
  };
}

function createClient() {
  const cfg = getIyzicoEnv();
  if (!cfg.enabled) return null;
  return new Iyzipay({ apiKey: cfg.apiKey, secretKey: cfg.secretKey, uri: cfg.uri });
}

function formatPrice(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return (Math.round(x * 100) / 100).toFixed(2);
}

function getIyzicoPacks() {
  // JSON array
  // [ {"credits":1,"price":49,"currency":"TRY","label":"1 Kredi"}, ... ]
  const raw = parseJsonEnv(process.env.IYZICO_PACKS, null);
  let packs = Array.isArray(raw) && raw.length ? raw : null;

  if (!packs) {
    // Defaults (you should edit for your pricing)
    packs = [
      { credits: 1, price: 49, currency: "TRY", label: "1 Kredi" },
      { credits: 5, price: 149, currency: "TRY", label: "5 Kredi" },
      { credits: 10, price: 249, currency: "TRY", label: "10 Kredi" },
      { credits: 20, price: 399, currency: "TRY", label: "20 Kredi" }
    ];
  }

  return packs
    .map((p) => {
      const credits = Number(p.credits || 0);
      const price = Number(p.price || 0);
      const currency = String(p.currency || "TRY").toUpperCase();
      const label = String(p.label || `${credits} Kredi`).trim();
      return {
        credits: Number.isFinite(credits) ? Math.floor(credits) : 0,
        price: Number.isFinite(price) ? price : 0,
        currency,
        label
      };
    })
    .filter((p) => p.credits > 0 && p.price > 0);
}

function makeConversationId() {
  // short-ish unique id
  const rnd = crypto.randomBytes(4).toString("hex");
  return `AVK-${Date.now()}-${rnd}`;
}

function normalizeIp(ipRaw) {
  const ip = String(ipRaw || "").trim();
  if (!ip) return "127.0.0.1";
  if (ip === "::1") return "127.0.0.1";
  if (ip.startsWith("::ffff:")) return ip.replace("::ffff:", "");
  // strip IPv6 zone id
  return ip.split("%")[0];
}

function splitFullName(fullName) {
  const s = String(fullName || "").trim();
  if (!s) return { name: "Kullanıcı", surname: "-" };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { name: parts[0], surname: "-" };
  return {
    name: parts.slice(0, -1).join(" "),
    surname: parts.slice(-1).join(" ")
  };
}

function currencyConst(currency) {
  const cur = String(currency || "TRY").toUpperCase();
  if (cur === "EUR") return Iyzipay.CURRENCY.EUR;
  if (cur === "USD") return Iyzipay.CURRENCY.USD;
  return Iyzipay.CURRENCY.TRY;
}

function buildCheckoutRequest({
  conversationId,
  price,
  currency,
  callbackUrl,
  buyer = {},
  ip
}) {
  const conv = String(conversationId || makeConversationId());
  const safePrice = formatPrice(price);
  const buyerName = splitFullName(buyer.fullName);
  const email = String(buyer.email || "").trim() || "user@example.com";
  const gsmNumber = String(buyer.phone || "").trim() || "+905555555555";

  // İyzico bazı alanları zorunlu ister; minimal dolduruyoruz.
  const buyerObj = {
    id: String(buyer.id || buyer.deviceId || "anon").slice(0, 24),
    name: buyerName.name,
    surname: buyerName.surname,
    gsmNumber,
    email,
    identityNumber: String(buyer.identityNumber || process.env.IYZICO_IDENTITY_NUMBER || "11111111111"),
    lastLoginDate: nowIso(),
    registrationDate: nowIso(),
    registrationAddress: "-",
    ip: normalizeIp(ip),
    city: "Istanbul",
    country: "Turkey",
    zipCode: "34000"
  };

  const contactName = (buyerName.surname && buyerName.surname !== "-")
    ? `${buyerName.name} ${buyerName.surname}`
    : buyerName.name;

  const addr = {
    contactName,
    city: "Istanbul",
    country: "Turkey",
    address: "-",
    zipCode: "34000"
  };

  return {
    locale: Iyzipay.LOCALE.TR,
    conversationId: conv,
    price: safePrice,
    paidPrice: safePrice,
    currency: currencyConst(currency),
    basketId: conv,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl: String(callbackUrl || "").trim(),
    buyer: buyerObj,
    shippingAddress: addr,
    billingAddress: addr,
    basketItems: [
      {
        id: conv,
        name: "Kredi Paketi",
        category1: "Dijital",
        itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        price: safePrice
      }
    ]
  };
}

async function createCheckoutForm(iyzipay, request) {
  if (!iyzipay) return { status: "failure", errorMessage: "iyzico_not_configured" };
  const result = await new Promise((resolve) => {
    iyzipay.checkoutFormInitialize.create(request, (err, res) => {
      if (err) return resolve({ __err: err });
      return resolve(res);
    });
  });
  if (result?.__err) {
    return {
      status: "failure",
      errorMessage: String(result.__err?.message || result.__err)
    };
  }
  return result;
}

async function retrieveCheckoutForm(iyzipay, request) {
  if (!iyzipay) return { status: "failure", errorMessage: "iyzico_not_configured" };
  const result = await new Promise((resolve) => {
    iyzipay.checkoutForm.retrieve(request, (err, res) => {
      if (err) return resolve({ __err: err });
      return resolve(res);
    });
  });
  if (result?.__err) {
    return {
      status: "failure",
      errorMessage: String(result.__err?.message || result.__err)
    };
  }
  return result;
}

module.exports = {
  // low-level
  getIyzicoEnv,
  createClient,
  getIyzicoPacks,
  makeConversationId,
  buildCheckoutRequest,
  createCheckoutForm,
  retrieveCheckoutForm,
  formatPrice
};
