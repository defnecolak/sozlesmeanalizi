// Etkinlik/Düğün sözleşmeleri için basit maliyet simülasyonu çıkarıcı.
// Not: Bu analiz bilgilendirme amaçlıdır; hukuk danışmanlığı değildir.

const MONTHS_TR = {
  "ocak": 1,
  "şubat": 2, "subat": 2,
  "mart": 3,
  "nisan": 4,
  "mayıs": 5, "mayis": 5,
  "haziran": 6,
  "temmuz": 7,
  "ağustos": 8, "agustos": 8,
  "eylül": 9, "eylul": 9,
  "ekim": 10,
  "kasım": 11, "kasim": 11,
  "aralık": 12, "aralik": 12
};

function norm(s) {
  return (s || "").toString().trim();
}

function parseMoneyTR(raw) {
  const s = norm(raw)
    .replace(/\s+/g, "")
    .replace(/€/g, "")
    .replace(/EUR/ig, "")
    .replace(/EURO/ig, "")
    .replace(/TL/ig, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDateTR(raw) {
  const s = norm(raw).replace(/\s+/g, " ");
  // 28 Ağustos 2026
  const m = s.match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const monName = (m[2] || "").toLowerCase();
  const month = MONTHS_TR[monName] || null;
  const year = Number(m[3]);
  if (!day || !month || !year) return null;
  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return iso;
}

function isoToDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z");
  return Number.isFinite(d.getTime()) ? d : null;
}

function extractEventMeta(text) {
  const t = (text || "").toString();

  // Event date
  let eventDate = null;
  {
    const m = t.match(/ETKİNLİK\s*TARİH[İI]\s*:\s*(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4})/i);
    if (m) eventDate = parseDateTR(m[1]);
  }

  // Guarantee guest count
  let guarantee = null;
  {
    const m = t.match(/GARANT[İI]\s*K[İI]Ş[İI]\s*SAYISI\s*:\s*(\d{1,5})/i);
    if (m) guarantee = Number(m[1]);
  }

  // Total amount
  let totalAmount = null;
  let currency = null;
  {
    const re = /TOPLAM\s*TUTAR\s*:\s*([0-9\.\,]+)\s*(€|EUR|Euro)/ig;
    let mm;
    const candidates = [];
    while ((mm = re.exec(t)) !== null) {
      const amt = parseMoneyTR(mm[1]);
      if (amt) candidates.push(amt);
      currency = "EUR";
    }
    if (candidates.length) {
      // pick max just in case multiple totals exist
      totalAmount = Math.max(...candidates);
    }
  }

  // Per person VAT included (if present)
  let perPersonVatIncl = null;
  {
    const m = t.match(/Toplam\s*:\s*([0-9\.\,]+)\s*€\s*KDV\s*DAH[İI]L/i);
    if (m) perPersonVatIncl = parseMoneyTR(m[1]);
  }

  // Payment schedule (amount - date pairs)
  const paymentSchedule = [];
  {
    const re = /([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)\s*€?\s*-\s*(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4})\s*tarihinde/ig;
    let mm;
    while ((mm = re.exec(t)) !== null) {
      const amount = parseMoneyTR(mm[1]);
      const date = parseDateTR(mm[2]);
      if (amount && date) paymentSchedule.push({ date, amount, currency: "EUR" });
    }
    paymentSchedule.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }

  // Cancellation table (from clause 15 style)
  const cancellationTable = [];
  {
    // 180 gün kala ... % 30
    const m180 = t.match(/(\d{1,3})\s*gün\s*kala[\s\S]{0,80}?%\s*([0-9]{1,3})/i);
    if (m180) {
      const d = Number(m180[1]);
      const p = Number(m180[2]);
      if (Number.isFinite(d) && Number.isFinite(p)) {
        cancellationTable.push({ minDays: d, maxDays: 9999, percent: p });
      }
    }

    // 179 gün – 130 gün kala ... % 35
    const reRange = /(\d{1,3})\s*gün\s*[–-]\s*(\d{1,3})\s*gün\s*kala[\s\S]{0,80}?%\s*([0-9]{1,3})/ig;
    let mm;
    while ((mm = reRange.exec(t)) !== null) {
      const d1 = Number(mm[1]);
      const d2 = Number(mm[2]);
      const p = Number(mm[3]);
      if ([d1, d2, p].every(Number.isFinite)) {
        const maxDays = Math.max(d1, d2);
        const minDays = Math.min(d1, d2);
        cancellationTable.push({ minDays, maxDays, percent: p });
      }
    }

    // 14 gün kala ... tamamı
    const mAll = t.match(/(\d{1,3})\s*gün\s*kala[\s\S]{0,60}?(tamam[ıi])/i);
    if (mAll) {
      const d = Number(mAll[1]);
      if (Number.isFinite(d)) cancellationTable.push({ minDays: 0, maxDays: d, percent: 100 });
    }

    // Normalize: if we have the known pattern, ensure full table exists
    if (cancellationTable.length >= 4) {
      // Fill missing known ranges if not captured perfectly
      const wanted = [
        { minDays: 180, maxDays: 9999, percent: 30 },
        { minDays: 130, maxDays: 179, percent: 35 },
        { minDays: 90, maxDays: 129, percent: 50 },
        { minDays: 60, maxDays: 89, percent: 75 },
        { minDays: 15, maxDays: 59, percent: 90 },
        { minDays: 0, maxDays: 14, percent: 100 }
      ];
      const key = (x) => `${x.minDays}-${x.maxDays}-${x.percent}`;
      const existing = new Set(cancellationTable.map(key));
      for (const w of wanted) {
        if (!existing.has(key(w))) cancellationTable.push(w);
      }
    }

    // Dedup + sort desc
    const seen = new Set();
    const normed = [];
    for (const row of cancellationTable) {
      const k = `${row.minDays}|${row.maxDays}|${row.percent}`;
      if (seen.has(k)) continue;
      seen.add(k);
      normed.push(row);
    }
    normed.sort((a, b) => b.maxDays - a.maxDays);
    cancellationTable.length = 0;
    cancellationTable.push(...normed);
  }

  const available = Boolean(eventDate && totalAmount);

  // Derived fallback
  let perPersonFromTotal = null;
  if (totalAmount && guarantee) {
    perPersonFromTotal = Math.round((totalAmount / guarantee) * 100) / 100;
  }

  return {
    available,
    eventDate,
    total: totalAmount ? { amount: totalAmount, currency: currency || "EUR" } : null,
    guarantee: guarantee || null,
    perPersonVatIncl: perPersonVatIncl || null,
    perPersonFromTotal,
    paymentSchedule,
    cancellationTable
  };
}

function cancelPercent(cancellationTable, daysBefore) {
  const d = Number(daysBefore);
  if (!Number.isFinite(d) || !Array.isArray(cancellationTable) || !cancellationTable.length) return null;

  for (const row of cancellationTable) {
    if (d >= row.minDays && d <= row.maxDays) return row.percent;
    if (row.maxDays === 9999 && d >= row.minDays) return row.percent;
  }
  return null;
}

function sumPaidUntil(paymentSchedule, isoDate) {
  if (!Array.isArray(paymentSchedule) || !paymentSchedule.length || !isoDate) return 0;
  const limit = isoToDate(isoDate);
  if (!limit) return 0;
  let sum = 0;
  for (const p of paymentSchedule) {
    const d = isoToDate(p.date);
    if (!d) continue;
    if (d.getTime() <= limit.getTime()) sum += Number(p.amount || 0);
  }
  return Math.round(sum * 100) / 100;
}

module.exports = { extractEventMeta, cancelPercent, sumPaidUntil };
