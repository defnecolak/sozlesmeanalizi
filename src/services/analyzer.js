const crypto = require("crypto");
const { RULES, SEVERITY_WEIGHT, SEVERITY_RANK } = require("./rules");
const { extractEventMeta } = require("./eventSimulator");

const PACK_ALIASES = {
  is: ["hizmet"],
  egitim: ["satis"],
  kredi: ["satis"],
  gizlilik: ["saas", "hizmet"],

  // Yeni türler: mevcut kuralların üzerine inşa eder
  abonelik: ["saas"],
  arac: ["kira", "hizmet"],
  seyahat: ["hizmet", "satis"],
  sigorta: ["kredi", "hizmet"],

  // Influencer anlaşmaları genelde "hizmet" + "fikri mülkiyet" + "gizlilik" karışımı
  influencer: ["hizmet", "satis", "gizlilik"]
};

function filterRulesByPack(packId) {
  const pack = (packId || "genel").toString();
  const aliases = PACK_ALIASES[pack] || [];
  return RULES.filter(r => {
    const packs = r.packs || ["genel"];
    if (packs.includes("all")) return true;
    if (pack === "genel") return packs.includes("genel");

    if (packs.includes("genel") || packs.includes(pack)) return true;
    return aliases.some(a => packs.includes(a));
  });
}

const { segmentText, findSegmentLabel } = require("./segmenter");

function sha(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function getLevelFromScore(riskScore) {
  if (riskScore >= 75) return { level: "ÇOK YÜKSEK", color: "critical" };
  if (riskScore >= 55) return { level: "YÜKSEK", color: "high" };
  if (riskScore >= 30) return { level: "ORTA", color: "medium" };
  return { level: "DÜŞÜK", color: "low" };
}

function roleMultiplier(rule, role) {
  if (!role || role === "genel") return 1.0;
  const affects = rule.affects || ["all"];
  if (affects.includes("all")) return 1.0;
  if (affects.includes(role)) return 1.15;
  return 0.9;
}

function packFactor(pack) {
  const p = (pack || "genel").toString();
  // Bazı sözleşme türlerinde (ör. etkinlik/mekan) standart şartlar daha fazla olduğu için skoru biraz yumuşatıyoruz.
  if (p === "etkinlik") return 2.10;
  if (p === "kira") return 1.20;
  if (p === "saas") return 1.15;
  if (p === "hizmet") return 1.10;
  if (p === "is") return 1.10;
  if (p === "egitim") return 1.05;
  if (p === "kredi") return 1.10;
  if (p === "gizlilik") return 1.00;
  if (p === "satis") return 1.10;
  if (p === "abonelik") return 1.15;
  if (p === "arac") return 1.18;
  if (p === "seyahat") return 1.18;
  if (p === "sigorta") return 1.22;
  if (p === "influencer") return 1.12;
  return 1.0;
}

function scoreFromPoints(points, pack) {
  const k = 95 * packFactor(pack);
  const p = Math.max(0, Number(points || 0));
  return Math.round(Math.min(100, Math.max(0, 100 * (1 - Math.exp(-p / k)))));
}

function occurrenceMultiplier(cnt, pack) {
  const n = Math.max(1, Number(cnt || 1));
  if (n <= 1) return 1.0;
  const p = (pack || "genel").toString();

  // Tablo/ek maddelerde aynı kelimeler tekrar tekrar geçtiği için
  // (özellikle etkinlik/düğün sözleşmelerinde) tekrar bonusunu ciddi yumuşatıyoruz.
  if (p === "etkinlik") {
    return Math.min(1.28, 1 + (Math.log2(n) * 0.12));
  }

  // Diğer paketlerde tekrar, riski bir miktar artırabilir ama hızla doyguna ulaşmalı.
  return Math.min(1.55, 1 + (Math.log2(n) * 0.22));
}


function makeSnippet(text, index, length = 220) {
  const start = Math.max(0, index - Math.floor(length / 2));
  const end = Math.min(text.length, start + length);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}

// Kullanıcı "Metinden alıntı" bölümünde mümkün olduğunca *tam madde/paragraf*
// görmek ister. Metin çıkarımı (PDF/text) her zaman temiz paragraf sınırları
// vermediği için best-effort yapıyoruz:
// - Yakın çevrede çift newline / newline
// - Varsa "MADDE <no>" başlığını yakala
// - Çok uzunsa makul bir üst sınırla kes
function makeClause(text, index, maxLen = 1600) {
  const t = String(text || "");
  if (!t) return "";
  const i = Math.max(0, Math.min(Number(index) || 0, t.length));

  const lookBack = 1800;
  const winStart = Math.max(0, i - lookBack);
  const before = t.slice(winStart, i);

  // Paragraf başlangıcı: önce \n\n, yoksa \n
  let paraStart = before.lastIndexOf("\n\n");
  if (paraStart >= 0) paraStart = winStart + paraStart + 2;
  else {
    const oneNl = before.lastIndexOf("\n");
    paraStart = oneNl >= 0 ? winStart + oneNl + 1 : winStart;
  }

  // "MADDE 1" gibi başlık varsa daha geriden başlat (yakın çevrede)
  const maddeRe = /(^|\n)\s*(MADDE|Madde)\s*\d+[^\n]{0,60}/g;
  let maddeStart = -1;
  let m;
  while ((m = maddeRe.exec(before)) !== null) {
    maddeStart = winStart + m.index + (m[1] ? m[1].length : 0);
  }

  const start = maddeStart >= 0 ? Math.min(paraStart, maddeStart) : paraStart;

  const lookFwd = 2400;
  const winEnd = Math.min(t.length, i + lookFwd);
  const after = t.slice(i, winEnd);

  // Paragraf bitişi
  let paraEndRel = after.indexOf("\n\n");
  if (paraEndRel < 0) paraEndRel = after.indexOf("\n");
  let end = paraEndRel >= 0 ? i + paraEndRel : winEnd;

  // Bir sonraki MADDE başlığı varsa orada kes
  const nextMadde = after.match(/\n\s*(MADDE|Madde)\s*\d+/);
  if (nextMadde && typeof nextMadde.index === "number") {
    end = Math.min(end, i + nextMadde.index);
  }

  if (end - start > maxLen) {
    end = Math.min(t.length, start + maxLen);
  }

  let out = t.slice(start, end).trim();
  out = out.replace(/\t+/g, " ").replace(/[ \u00a0]+/g, " ");
  return out;
}


function formatMoney(amount, currency = "EUR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const sym = currency === "EUR" ? "€" : (currency || "");
  const s = n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s} ${sym}`.trim();
}

function getCancellationRange(ev) {
  const table = ev?.cancellationTable || [];
  if (!table.length) return null;
  const percents = table.map(r => Number(r.percent)).filter(p => Number.isFinite(p) && p >= 10 && p <= 100);
  if (!percents.length) return null;
  return { min: Math.min(...percents), max: Math.max(...percents) };
}

function extractMonthlyLateInterestRate(text) {
  const t = (text || "").toString();
  // ör: "aylık net % 2,5 oranında temerrüt faizi"
  const m = t.match(/aylık\s+net\s*%\s*([0-9]+(?:[\.,][0-9]+)?)/i);
  if (!m) return null;
  const val = Number(String(m[1]).replace(",", "."));
  return Number.isFinite(val) ? val : null;
}

function computeMoneyImpact(issue, ctx) {
  const id = issue?.id;
  const pack = ctx?.pack || "genel";
  const ev = ctx?.event || null;
  const currency = ev?.total?.currency || "EUR";
  const total = Number(ev?.total?.amount || 0);

  // Default for etkinlik: show something (even if not computable)
  const defaultEvent = "Değişken (net hesaplanamadı)";

  if (pack === "etkinlik") {
    const range = getCancellationRange(ev);
    const deposit = (ev?.paymentSchedule && ev.paymentSchedule.length) ? Number(ev.paymentSchedule[0]?.amount || 0) : (total ? total * 0.30 : 0);

    if (id === "penalty_clause" || id === "cancel_deadline" || id === "terminate_without_cause") {
      if (range && total) {
        const minAmt = total * (range.min / 100);
        const maxAmt = total * (range.max / 100);
        return `İptal/cezai şart (%${range.min}–%${range.max}): ${formatMoney(minAmt, currency)} – ${formatMoney(maxAmt, currency)} (Toplam: ${formatMoney(total, currency)})`;
      }
      return defaultEvent;
    }

    if (id === "no_refund") {
      if (deposit) return `Cayma/kapora iadesiz olabilir: ≈ ${formatMoney(deposit, currency)}`;
      if (total) return `Cayma/kapora iadesiz olabilir: ≈ ${formatMoney(total * 0.30, currency)}`;
      return defaultEvent;
    }

    if (id === "late_interest_and_costs") {
      const rate = extractMonthlyLateInterestRate(ctx?.text || "");
      if (rate != null) {
        const sampleBase = 10000;
        const interest = sampleBase * (rate / 100);
        return `Temerrüt faizi (aylık %${String(rate).replace(".", ",")}): ${formatMoney(sampleBase, currency)} gecikmede ≈ ${formatMoney(interest, currency)}/ay (örnek)`;
      }
      return defaultEvent;
    }

    if (id === "force_majeure_broad") {
      const range = getCancellationRange(ev);
      if (range) return `Mücbir sebep/erteleme kabul edilmezse iptal tablosu devreye girebilir: %${range.min}–%${range.max}`;
      return defaultEvent;
    }

    if (id === "unlimited_liability") {
      if (total) return `Sorumluluk sınırı yoksa, toplam bedeli (${formatMoney(total, currency)}) aşan tazminat riski olabilir`;
      return defaultEvent;
    }

    if (id === "unilateral_price_increase") {
      return "Kur/KDV/ekstra ücret nedeniyle toplam artabilir (net değil)";
    }

    // Other event-pack hits
    return defaultEvent;
  }

  // Non-event packs: we only attach if we have a clear numeric impact
  return null;
}


function analyzeContract(rawText, opts = {}) {
  const text = (rawText || "").toString();
  const role = (opts.role || "genel").toString();
  const pack = (opts.pack || "genel").toString();

  const segments = segmentText(text);

  const issues = [];
  const foundRuleIds = new Set();

  const filteredRules = filterRulesByPack(pack);

  for (const rule of filteredRules) {
    let matchCount = 0;
    for (const p of rule.patterns) {
      const re = new RegExp(p, "ig");
      let m;
      while ((m = re.exec(text)) !== null) {
        matchCount += 1;
        if (matchCount > 6) break;

        const clauseLabel = findSegmentLabel(segments, m.index);

        issues.push({
          id: rule.id,
          title: rule.title,
          severity: rule.severity,
          category: rule.category,
          match: m[0],
          index: m.index,
          clause: clauseLabel,
          snippet: makeSnippet(text, m.index),
          quote: makeClause(text, m.index),
          why: rule.why,
          redLine: rule.redLine || null,
          templates: rule.templates || []
        });
      }
      if (matchCount > 6) break;
    }
    if (matchCount > 0) foundRuleIds.add(rule.id);
  }

  // Deduplicate similar matches
  const dedup = [];
  const seen = new Set();
  for (const it of issues) {
    const key = `${it.id}:${Math.floor(it.index / 50)}:${it.match.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(it);
  }

  // Group by rule id to avoid spamming the UI/PDF with the same risk repeated many times.
  // We keep up to a few examples for context.
  const groupedMap = {};
  for (const it of dedup) {
    const key = it.id;
    if (!groupedMap[key]) {
      groupedMap[key] = {
        id: it.id,
        title: it.title,
        severity: it.severity,
        category: it.category,
        clause: it.clause,
        match: it.match,
        snippet: it.snippet,
        // UI'da "Metinden alıntı" alanında daha uzun/komple madde göstermek için
        quote: it.quote || "",
        why: it.why,
        redLine: it.redLine || null,
        templates: it.templates || [],
        occurrences: 0,
        examples: [],
        minIndex: it.index
      };
    }

    const g = groupedMap[key];
    g.occurrences += 1;
    g.minIndex = Math.min(g.minIndex, it.index);
    if (g.examples.length < 3) {
      g.examples.push({ clause: it.clause, match: it.match, snippet: it.snippet, quote: it.quote || "" });
    }
  }

  const groupedIssues = Object.values(groupedMap);

  // Score with role multiplier
  const perRuleCounts = {};
  for (const it of groupedIssues) perRuleCounts[it.id] = Math.max(1, Number(it.occurrences || 1));

  let riskPoints = 0;
  const rulePointsById = {};
  for (const [rid, cnt] of Object.entries(perRuleCounts)) {
    const sample = groupedIssues.find(x => x.id === rid);
    const w = SEVERITY_WEIGHT[sample?.severity || "LOW"] || 5;
    const mult = occurrenceMultiplier(cnt, pack);
    const rule = RULES.find(r => r.id === rid) || {};
    const rm = roleMultiplier(rule, role);
    const packAdj = (rule.packAdjust && typeof rule.packAdjust === "object" && rule.packAdjust[pack]) ? Number(rule.packAdjust[pack]) : 1.0;
    const pts = (w * mult * rm * (Number.isFinite(packAdj) ? packAdj : 1.0));
    rulePointsById[rid] = pts;
    riskPoints += pts;
  }

  // Soft warnings (missing key things)
  const softWarnings = [];
  const hasPaymentWords = /\b(ücret|bedel|ödeme|fiyat|tutar|fee|payment)\b/i.test(text);
  const hasDueDate = /(son\s+ödeme\s+tarihi|vade|\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})/i.test(text);
  if (hasPaymentWords && !hasDueDate) {
    softWarnings.push({
      title: "Ödeme tarihi net değil",
      severity: "MEDIUM",
      category: "Belirsizlik",
      why: "Ödeme tarihi belli değilse, sonradan tartışma çıkabilir.",
      templates: ["Ödeme tarihini/takvimini açık yazdır."]
    });
    riskPoints += 8;
  }

  const hasScopeWords = /(kapsam|teslimat|deliverable|işin\s+tanımı|hizmet\s+tanımı)/i.test(text);
  if (!hasScopeWords) {
    softWarnings.push({
      title: "Kapsam net olmayabilir",
      severity: "MEDIUM",
      category: "Belirsizlik",
      why: "Kapsam net değilse, sonradan ek iş ve revizyon tartışması çıkabilir.",
      templates: ["Teslimat listesi, süre ve revizyon sayısını yazdır."]
    });
    riskPoints += 8;
  }

// Missing clause signals (premium-style soft warnings)
const hasDisputeWords = /(yetkili\s+mahkeme|uygulanacak\s+hukuk|tahkim|arabuluculuk|uyuşmazlık)/i.test(text);
if (!hasDisputeWords) {
  softWarnings.push({
    title: "Yetkili mahkeme/uyuşmazlık maddesi yok gibi",
    severity: "MEDIUM",
    category: "Belirsizlik",
    why: "Uyuşmazlık olursa nerede/nasıl çözüleceği yazmıyorsa süreç uzayabilir.",
    templates: ["Yetkili mahkeme/uygulanacak hukuk maddesini net ve dengeli yazdır."]
  });
  riskPoints += 7;
}

const hasLiabilityWords = /(sorumluluk|tazmin|indemnif|zarar)/i.test(text);
const hasCapWords = /(azami\s+sorumluluk|üst\s+sınır|sorumluluk\s+limiti|cap\b|maximum\s+liability|toplam\s+sorumluluk)/i.test(text);
if (hasLiabilityWords && !hasCapWords) {
  softWarnings.push({
    title: "Sorumluluk üst limiti yazmıyor olabilir",
    severity: "HIGH",
    category: "Belirsizlik",
    why: "Sorumluluk limiti yoksa, beklenmedik büyük tutarlar çıkabilir.",
    templates: ["Sorumluluk için üst limit (cap) iste (örn. toplam bedel kadar)."]
  });
  riskPoints += 10;
}

const hasConf = /(gizli\s+bilgi|gizlilik|confidential)/i.test(text);
const hasConfExceptions = /(kamuya\s+açık|halihazırda\s+bilinen|yasal\s+zorunluluk|mahkeme\s+kararı|public\s+domain|required\s+by\s+law)/i.test(text);
if (hasConf && !hasConfExceptions) {
  softWarnings.push({
    title: "Gizlilik istisnaları yazmıyor olabilir",
    severity: "MEDIUM",
    category: "Belirsizlik",
    why: "İstisnalar yoksa, kamuya açık bilgi paylaşımı bile sorun olabilir.",
    templates: ["Kamuya açık bilgi ve yasal zorunluluk istisnalarını eklet."]
  });
  riskPoints += 6;
}

  // Quality warning
  const quality = opts.quality || null;
  if (quality && quality.label === "Düşük") {
    softWarnings.unshift({
      title: "Metin kalitesi düşük olabilir",
      severity: "MEDIUM",
      category: "Kalite",
      why: "Metin eksik/bozuk çıkmış olabilir; bazı riskleri kaçırabiliriz.",
      templates: ["Daha net bir PDF dene. Tarama ise OCR'lı sürüm yükle."]
    });
    riskPoints += 6;
  }

  // Her risk maddesine, skoru ne kadar etkilediğini (puan) ekleyelim.
  for (const it of groupedIssues) {
    it.scorePoints = Number(rulePointsById[it.id] || 0);
  }

  const riskScore = scoreFromPoints(riskPoints, pack);
  const levelInfo = getLevelFromScore(riskScore);

  groupedIssues.sort((a, b) => {
    const ra = SEVERITY_RANK[a.severity] || 0;
    const rb = SEVERITY_RANK[b.severity] || 0;
    if (ra !== rb) return rb - ra;
    const oa = Number(a.occurrences || 1);
    const ob = Number(b.occurrences || 1);
    if (oa !== ob) return ob - oa;
    return (a.minIndex || 0) - (b.minIndex || 0);
  });

  // Top 3
  const topRisks = groupedIssues.slice(0, 3);

  // Category summary
  const categoryCounts = {};
  for (const it of groupedIssues) categoryCounts[it.category] = (categoryCounts[it.category] || 0) + 1;

  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const it of groupedIssues) severityCounts[it.severity] = (severityCounts[it.severity] || 0) + 1;

  // --- Skor açıklaması (explainability)
  // Amaç: "52/100 = imzala" gibi algılanmasın. Skoru hangi maddelerin yükselttiğini sade şekilde anlat.
  const byPoints = [...groupedIssues].sort((a, b) => Number(b.scorePoints || 0) - Number(a.scorePoints || 0));
  const topDriverSumRaw = byPoints.slice(0, 3).reduce((acc, it) => acc + Number(it.scorePoints || 0), 0);
  const topDrivers = byPoints.slice(0, 3).map(it => ({
    id: it.id,
    title: it.title,
    severity: it.severity,
    category: it.category,
    points: Math.round((Number(it.scorePoints || 0) + Number.EPSILON) * 10) / 10
  }));
  const withoutTopDriversScore = scoreFromPoints(Math.max(0, riskPoints - topDriverSumRaw), pack);

  const critHigh = (severityCounts.CRITICAL || 0) + (severityCounts.HIGH || 0);
  const factorLines = [];
  if (critHigh > 0) factorLines.push(`${critHigh} adet kritik/yüksek risk sinyali bulundu.`);
  if (topDrivers.length) factorLines.push(`Skoru en çok artıran maddeler: ${topDrivers.map(d => d.title).join(" • ")}.`);
  if (softWarnings.length) factorLines.push(`${softWarnings.length} adet eksik/belirsiz alan sinyali skoru artırdı.`);

  const scoreExplain = {
    meaning: "Bu skor bir tehlike alarmı veya ‘imzala/imzalama’ kararı değildir. Sözleşme dilinde senin aleyhine işleyebilecek maddelerin yoğunluğunu ve şiddetini yaklaşık olarak gösterir.",
    factors: factorLines.slice(0, 3),
    topDrivers,
    withoutTopDriversScore
  };

// Simülasyonlar (ör. Düğün/Etkinlik maliyet)
let simulation = null;
let eventMeta = null;
if (pack === "etkinlik") {
  eventMeta = extractEventMeta(text);
  simulation = { event: eventMeta };
}


// Risk -> Parasal Etki (kart etiketleri)
if (pack === "etkinlik") {
  const ctx = { pack, text, event: eventMeta };
  for (const it of groupedIssues) {
    it.moneyImpact = computeMoneyImpact(it, ctx);
  }
}
return {
    meta: {
      analyzedAt: new Date().toISOString(),
      // kept for internal dedupe (not shown in UI/PDF)
      textHash: sha(text)
    },
    summary: {
      role,
      pack: (opts.pack || "genel").toString(),
      riskScore,
      riskLevel: levelInfo.level,
      riskLevelColor: levelInfo.color,
      issueCount: groupedIssues.length,
      softWarningCount: softWarnings.length,
      quality: quality ? { label: quality.label, score: quality.score } : null,
      categoryCounts,
      severityCounts,
      scoreExplain
    },
    topRisks,
    issues: groupedIssues,
    softWarnings,
    simulation
  };
}

module.exports = { analyzeContract };
