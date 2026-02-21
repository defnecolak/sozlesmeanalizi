const { readStore, writeStore } = require("./store");

function billingMode() {
  return String(process.env.BILLING_MODE || "off").toLowerCase();
}

function parseCreditCodes() {
  const raw = String(process.env.CREDIT_CODES || "").trim();
  if (!raw) return [];
  // Try JSON
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) {
      return j
        .filter(x => x && x.code && Number.isFinite(Number(x.credits)))
        .map(x => ({ code: String(x.code).trim(), credits: Number(x.credits) }));
    }
  } catch {}
  // Try CSV: CODE:10,CODE2:25
  const arr = raw.split(",").map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const item of arr) {
    const [code, credits] = item.split(":");
    if (!code || !credits) continue;
    const n = Number(credits);
    if (!Number.isFinite(n)) continue;
    out.push({ code: code.trim(), credits: n });
  }
  return out;
}

function freeTrialLimit() {
  const n = Number(process.env.FREE_TRIAL_ANALYSES || 1);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n) ) : 1;
}

function nowIso() {
  return new Date().toISOString();
}

async function getDeviceRecord(deviceId) {
  const store = await readStore();
  if (!store.devices) store.devices = {};
  if (!store.wallets) store.wallets = {};

  let dev = store.devices[deviceId];
  if (!dev || typeof dev !== "object") {
    dev = { walletId: deviceId, createdAt: nowIso(), updatedAt: nowIso() };
    store.devices[deviceId] = dev;
  }

  const walletId = dev.walletId || deviceId;
  dev.walletId = walletId;
  dev.updatedAt = nowIso();
  store.devices[deviceId] = dev;

  let wallet = store.wallets[walletId];
  if (!wallet || typeof wallet !== "object") {
    wallet = { usedFree: 0, credits: 0, unlimited: false, createdAt: nowIso(), updatedAt: nowIso() };
    store.wallets[walletId] = wallet;
  }
  wallet.updatedAt = nowIso();
  store.wallets[walletId] = wallet;

  return { store, dev, wallet, walletId };
}

async function getStatus(deviceId) {
  const { store, wallet } = await getDeviceRecord(deviceId);
  await writeStore(store);
  const freeLeft = Math.max(0, freeTrialLimit() - (wallet.usedFree || 0));
  return {
    billingMode: billingMode(),
    freeLeft,
    usedFree: wallet.usedFree || 0,
    credits: wallet.credits || 0,
    unlimited: !!wallet.unlimited
  };
}

async function canAnalyze(deviceId) {
  const mode = billingMode();
  if (mode !== "credits") return { ok: true, reason: null };

  const { store, wallet } = await getDeviceRecord(deviceId);
  const freeLeft = Math.max(0, freeTrialLimit() - (wallet.usedFree || 0));

  if (wallet.unlimited) {
    await writeStore(store);
    return { ok: true, reason: null, status: { freeLeft, credits: wallet.credits || 0, unlimited: true } };
  }

  if (freeLeft > 0) {
    await writeStore(store);
    return { ok: true, reason: null, status: { freeLeft, credits: wallet.credits || 0, unlimited: false } };
  }

  if ((wallet.credits || 0) > 0) {
    await writeStore(store);
    return { ok: true, reason: null, status: { freeLeft, credits: wallet.credits || 0, unlimited: false } };
  }

  await writeStore(store);
  return {
    ok: false,
    reason: "Ücretsiz deneme hakkınız bitti. Devam etmek için kredi satın alın veya kod girin.",
    status: { freeLeft, credits: wallet.credits || 0, unlimited: false }
  };
}

async function consumeAnalysis(deviceId) {
  const mode = billingMode();
  if (mode !== "credits") return await getStatus(deviceId);

  const { store, wallet, walletId } = await getDeviceRecord(deviceId);
  const limit = freeTrialLimit();
  const used = wallet.usedFree || 0;

  if (wallet.unlimited) {
    wallet.updatedAt = nowIso();
    store.wallets[walletId] = wallet;
    await writeStore(store);
    return await getStatus(deviceId);
  }

  if (used < limit) {
    wallet.usedFree = used + 1;
  } else {
    wallet.credits = Math.max(0, (wallet.credits || 0) - 1);
  }
  wallet.updatedAt = nowIso();
  store.wallets[walletId] = wallet;
  await writeStore(store);
  return await getStatus(deviceId);
}

async function redeemCode(deviceId, codeRaw) {
  const mode = billingMode();
  if (mode !== "credits") return { ok: false, error: "Kredi sistemi kapalı." };

  const code = String(codeRaw || "").trim();
  if (!code) return { ok: false, error: "Kod boş olamaz." };

  const unlimitedKey = String(process.env.UNLIMITED_KEY || "").trim();
  const codes = parseCreditCodes();

  const { store, wallet, walletId } = await getDeviceRecord(deviceId);

  if (store.redeemed[code]) {
    return { ok: false, error: "Bu kod daha önce kullanılmış." };
  }

  if (unlimitedKey && code === unlimitedKey) {
    wallet.unlimited = true;
    wallet.updatedAt = nowIso();
    store.wallets[walletId] = wallet;
    store.redeemed[code] = { walletId, deviceId, at: nowIso(), credits: "unlimited" };
    await writeStore(store);
    return { ok: true, added: "unlimited", status: await getStatus(deviceId) };
  }

  const item = codes.find(x => x.code === code);
  if (!item) return { ok: false, error: "Kod geçersiz." };

  wallet.credits = (wallet.credits || 0) + Number(item.credits || 0);
  wallet.updatedAt = nowIso();
  store.wallets[walletId] = wallet;
  store.redeemed[code] = { walletId, deviceId, at: nowIso(), credits: Number(item.credits || 0) };
  await writeStore(store);

  return { ok: true, added: Number(item.credits || 0), status: await getStatus(deviceId) };
}


async function grantCredits(deviceId, credits, source = "payment") {
  const n = Number(credits || 0);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "credits_invalid" };

  const { store, wallet, walletId } = await getDeviceRecord(deviceId);

  wallet.credits = (wallet.credits || 0) + Math.floor(n);
  wallet.updatedAt = nowIso();
  store.wallets[walletId] = wallet;

  await writeStore(store);
  return { ok: true, status: await getStatus(deviceId) };
}

async function revokeCredits(deviceId, credits, source = "refund") {
  const n = Number(credits || 0);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "credits_invalid" };

  const { store, wallet, walletId } = await getDeviceRecord(deviceId);

  // Don't touch unlimited with refunds; flagging would be more complex.
  if (!wallet.unlimited) {
    wallet.credits = Math.max(0, (wallet.credits || 0) - Math.floor(n));
  }
  wallet.updatedAt = nowIso();
  store.wallets[walletId] = wallet;

  await writeStore(store);
  return { ok: true, status: await getStatus(deviceId) };
}

async function applyOrderCreated({ deviceId, orderId, credits, provider = "lemonsqueezy", restoreToken = null, raw = null }) {
  if (!deviceId || !orderId) return { ok: false, error: "missing_fields" };
  const n = Number(credits || 0);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "credits_invalid" };

  const { store, wallet, walletId } = await getDeviceRecord(deviceId);
  if (!store.orders) store.orders = {};
  if (!store.restoreTokens) store.restoreTokens = {};

  if (store.orders[orderId]?.status === "paid") {
    return { ok: true, already: true, status: await getStatus(deviceId) };
  }

  store.orders[orderId] = {
    walletId,
    deviceId,
    credits: Math.floor(n),
    provider,
    status: "paid",
    restoreToken: restoreToken || null,
    at: nowIso()
  };

  // mark restore token as paid (if present)
  if (restoreToken) {
    const t = store.restoreTokens[restoreToken] || { walletId, createdAt: nowIso() };
    t.walletId = walletId;
    t.status = "paid";
    t.orderId = orderId;
    t.paidAt = nowIso();
    store.restoreTokens[restoreToken] = t;
  }

  // grant credits to wallet
  if (!wallet.unlimited) wallet.credits = (wallet.credits || 0) + Math.floor(n);
  wallet.updatedAt = nowIso();
  store.wallets[walletId] = wallet;

  await writeStore(store);
  return { ok: true, already: false, status: await getStatus(deviceId) };
}

async function applyOrderRefunded({ orderId, provider = "lemonsqueezy" }) {
  if (!orderId) return { ok: false, error: "missing_order" };

  const store = await readStore();
  if (!store.orders) store.orders = {};
  const o = store.orders[orderId];
  if (!o) {
    // Unknown order: accept idempotently
    store.orders[orderId] = { deviceId: null, credits: 0, provider, status: "refunded", at: new Date().toISOString() };
    await writeStore(store);
    return { ok: true, already: false, status: null };
  }

  if (o.status === "refunded") return { ok: true, already: true, status: o.deviceId ? await getStatus(o.deviceId) : null };

  o.status = "refunded";
  o.refundedAt = new Date().toISOString();
  store.orders[orderId] = o;

  if (o.walletId) {
    if (!store.wallets) store.wallets = {};
    const wallet = store.wallets[o.walletId] || { usedFree: 0, credits: 0, unlimited: false, createdAt: nowIso(), updatedAt: nowIso() };
    if (!wallet.unlimited) {
      wallet.credits = Math.max(0, (wallet.credits || 0) - Math.floor(o.credits || 0));
    }
    wallet.updatedAt = nowIso();
    store.wallets[o.walletId] = wallet;
  }

  await writeStore(store);
  return { ok: true, already: false, status: o.deviceId ? await getStatus(o.deviceId) : null };
}

function makeRestoreToken() {
  // short, typeable token (not too long, but still high entropy)
  // Example: A8F3-6K2M-P9QD
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0,O,1,I
  const pick = (n) => {
    let s = "";
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  };
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}

async function createRestoreToken(deviceId, expectedCredits = null) {
  const { store, walletId } = await getDeviceRecord(deviceId);
  if (!store.restoreTokens) store.restoreTokens = {};

  // avoid collisions
  let token = makeRestoreToken();
  for (let i = 0; i < 8 && store.restoreTokens[token]; i++) token = makeRestoreToken();

  store.restoreTokens[token] = {
    walletId,
    status: "pending",
    expectedCredits: (expectedCredits != null ? Number(expectedCredits) : null),
    createdAt: nowIso()
  };
  await writeStore(store);
  return { ok: true, token, walletId };
}

async function restoreFromToken(deviceId, tokenRaw) {
  const token = String(tokenRaw || "").trim().toUpperCase();
  if (!token) return { ok: false, error: "Kurtarma kodu boş olamaz." };

  const store = await readStore();
  if (!store.restoreTokens || !store.restoreTokens[token]) {
    return { ok: false, error: "Kurtarma kodu bulunamadı." };
  }
  const rec = store.restoreTokens[token];
  if (rec.status !== "paid") {
    return { ok: false, error: "Bu kurtarma kodu henüz ödeme ile doğrulanmadı." };
  }

  // Attach this device to the wallet
  if (!store.devices) store.devices = {};
  const dev = store.devices[deviceId] || { walletId: deviceId, createdAt: nowIso(), updatedAt: nowIso() };
  dev.walletId = rec.walletId;
  dev.updatedAt = nowIso();
  store.devices[deviceId] = dev;

  await writeStore(store);
  return { ok: true, status: await getStatus(deviceId) };
}

module.exports = {
  billingMode,
  freeTrialLimit,
  getStatus,
  canAnalyze,
  consumeAnalysis,
  redeemCode,
  parseCreditCodes,
  grantCredits,
  revokeCredits,
  applyOrderCreated,
  applyOrderRefunded,
  createRestoreToken,
  restoreFromToken
};
