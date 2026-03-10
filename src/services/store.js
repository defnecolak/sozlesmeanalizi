const fs = require("fs/promises");
const path = require("path");

// Public launch notu:
// - Local'de varsayılan olarak proje içindeki ./data klasörünü kullanır.
// - Prod ortamında (Render/Fly/VM) kredilerin kaybolmaması için bir "persistent disk"
//   mount edip DATA_DIR ile o yolu gösterebilirsin.
//   Örn: DATA_DIR=/var/data
const dataDir = path.resolve(String(process.env.DATA_DIR || path.join(process.cwd(), "data")));
const storePath = path.join(dataDir, "store.json");

/**
 * Store v1 (legacy)
 * -----------------
 * {
 *   devices: { [deviceId]: { usedFree, credits, unlimited, updatedAt } },
 *   redeemed: { [code]: {...} },
 *   orders: { [orderId]: {...} }
 * }
 *
 * Store v2 (current)
 * ------------------
 * {
 *   devices: { [deviceId]: { walletId, createdAt, updatedAt } },
 *   wallets: { [walletId]: { usedFree, credits, unlimited, createdAt, updatedAt } },
 *   redeemed: { [code]: {...} },
 *   orders: { [orderId]: { walletId, deviceId, credits, status, ... } },
 *   restoreTokens: { [token]: { walletId, status, orderId?, createdAt, paidAt? } }
 * }
 */

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    const init = {
      devices: {},
      wallets: {},
      redeemed: {},
      orders: {},
      restoreTokens: {},
      iyzicoOrders: {}
    };
    await fs.writeFile(storePath, JSON.stringify(init, null, 2), { encoding: "utf8", mode: 0o600 });
    try { await fs.chmod(storePath, 0o600); } catch {}
  }
}

function isLegacyDeviceRecord(v) {
  if (!v || typeof v !== "object") return false;
  // legacy devices have direct counters on the device object
  return (
    Object.prototype.hasOwnProperty.call(v, "usedFree") ||
    Object.prototype.hasOwnProperty.call(v, "credits") ||
    Object.prototype.hasOwnProperty.call(v, "unlimited")
  );
}

function nowIso() {
  return new Date().toISOString();
}

function parseIso(v) {
  if (!v) return 0;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}

function days(n) {
  return n * 24 * 60 * 60 * 1000;
}

/**
 * Veri minimizasyonu: çok eski/pending kayıtları otomatik temizle.
 * Bu, store.json sızıntısı gibi "en kötü günde" eline geçen veri miktarını azaltır.
 * TTL değerleri env ile ayarlanabilir.
 */
function purgeOldRecords(store) {
  const now = Date.now();

  const restorePendingTtlDays = Number(process.env.RESTORE_TOKEN_TTL_DAYS || 30);
  const iyzicoTtlDays = Number(process.env.IYZICO_ORDER_TTL_DAYS || 30);
  const iyzicoPaidTtlDays = Number(process.env.IYZICO_ORDER_PAID_TTL_DAYS || 180);
  const orderTtlDays = Number(process.env.ORDER_TTL_DAYS || 365);
  const orderPaidTtlDays = Number(process.env.ORDER_PAID_TTL_DAYS || 730);

  // restoreTokens: pending çok uzun süre tutulmasın
  for (const [token, rec] of Object.entries(store.restoreTokens || {})) {
    const created = parseIso(rec?.createdAt);
    const status = String(rec?.status || "");
    if (status === "pending" && created && created < (now - days(restorePendingTtlDays))) {
      delete store.restoreTokens[token];
    }
  }

  // iyzicoOrders: callback/checkout izleri sonsuza kadar kalmasın
  for (const [convId, rec] of Object.entries(store.iyzicoOrders || {})) {
    const created = parseIso(rec?.createdAt);
    const status = String(rec?.status || "");
    if (!created) continue;
    const ttl = (status === "paid") ? iyzicoPaidTtlDays : iyzicoTtlDays;
    if (created < (now - days(ttl))) delete store.iyzicoOrders[convId];
  }

  // orders: çok eski kayıtları buda (özellikle failed/pending)
  for (const [orderId, rec] of Object.entries(store.orders || {})) {
    const created = parseIso(rec?.createdAt);
    const status = String(rec?.status || "");
    if (!created) continue;
    const ttl = (status === "paid") ? orderPaidTtlDays : orderTtlDays;
    if (created < (now - days(ttl))) delete store.orders[orderId];
  }

  return store;
}


function migrateStore(obj) {
  const out = (obj && typeof obj === "object") ? obj : {};

  if (!out.devices) out.devices = {};
  if (!out.wallets) out.wallets = {};
  if (!out.redeemed) out.redeemed = {};
  if (!out.orders) out.orders = {};
  if (!out.restoreTokens) out.restoreTokens = {};
  if (!out.iyzicoOrders) out.iyzicoOrders = {};

  const deviceEntries = Object.entries(out.devices);

  // Detect legacy store: devices map contains counters.
  const legacy = deviceEntries.some(([, v]) => isLegacyDeviceRecord(v));
  if (legacy) {
    const newDevices = {};
    const newWallets = { ...out.wallets };

    for (const [deviceId, rec] of deviceEntries) {
      const walletId = deviceId;
      // Preserve wallet data
      if (!newWallets[walletId]) {
        newWallets[walletId] = {
          usedFree: Number(rec?.usedFree || 0),
          credits: Number(rec?.credits || 0),
          unlimited: !!rec?.unlimited,
          createdAt: rec?.createdAt || nowIso(),
          updatedAt: rec?.updatedAt || nowIso()
        };
      }
      newDevices[deviceId] = {
        walletId,
        createdAt: rec?.createdAt || nowIso(),
        updatedAt: rec?.updatedAt || nowIso()
      };
    }

    out.devices = newDevices;
    out.wallets = newWallets;

    // Patch legacy orders that referenced deviceId
    for (const [orderId, o] of Object.entries(out.orders || {})) {
      if (!o || typeof o !== "object") continue;
      if (!o.walletId && o.deviceId) {
        o.walletId = o.deviceId;
        out.orders[orderId] = o;
      }
    }
  }

  // Ensure every device points to an existing wallet
  for (const [deviceId, dev] of Object.entries(out.devices)) {
    const walletId = dev?.walletId || deviceId;
    dev.walletId = walletId;
    dev.createdAt = dev.createdAt || nowIso();
    dev.updatedAt = dev.updatedAt || nowIso();
    out.devices[deviceId] = dev;

    if (!out.wallets[walletId]) {
      out.wallets[walletId] = {
        usedFree: 0,
        credits: 0,
        unlimited: false,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
    }
  }

  return out;
}

/**
 * JSON.parse sonrası __proto__ / constructor / prototype gibi
 * tehlikeli anahtarları recursive olarak temizler (proto pollution koruması).
 */
function sanitizeParsed(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) obj[i] = sanitizeParsed(obj[i]);
    return obj;
  }
  const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);
  for (const key of Object.keys(obj)) {
    if (DANGEROUS.has(key)) {
      delete obj[key];
    } else {
      obj[key] = sanitizeParsed(obj[key]);
    }
  }
  return obj;
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(storePath, "utf8");
  try {
    const obj = sanitizeParsed(JSON.parse(raw));
    return purgeOldRecords(migrateStore(obj));
  } catch {
    return purgeOldRecords(migrateStore({}));
  }
}

async function writeStore(obj) {
  await ensureStore();
  const out = migrateStore(obj);

  // atomic-ish write
  const tmp = storePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(out, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, storePath);

  // Lightweight safety backup (keeps last successful write)
  try {
    await fs.copyFile(storePath, storePath + ".bak");
    try { await fs.chmod(storePath + ".bak", 0o600); } catch {}
  } catch {
    // ignore
  }
}

module.exports = { ensureStore, readStore, writeStore, storePath, migrateStore };
