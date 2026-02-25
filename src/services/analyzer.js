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

// --- Sözleşme türü uyumu (tüm türler) --------------------------------------
// Kullanıcı yanlış sözleşme türünü seçerse analiz (skor + öneriler) yanıltıcı
// olabilir. Bu kontrol metindeki tipik anahtar kelimelere bakarak "seçilen tür"
// ile "metnin daha çok benzediği tür" arasında bariz bir fark varsa soft warning
// üretir.
const PACK_LABELS_TR = {
  genel: "Genel",
  hizmet: "Hizmet / Freelance",
  influencer: "Influencer anlaşması",
  etkinlik: "Düğün / Etkinlik",
  kira: "Kira",
  satis: "Satış / Alım",
  saas: "SaaS / Yazılım abonelik",
  is: "İş sözleşmesi",
  kredi: "Kredi / Borç",
  egitim: "Eğitim",
  gizlilik: "Gizlilik (NDA)",
  abonelik: "Abonelik (tüketici)",
  arac: "Araç / Kiralama",
  seyahat: "Seyahat / Tur",
  sigorta: "Sigorta",
};

// Keyword set'leri "mükemmel" değil; amaç bariz uyumsuzlukları yakalamak.
// Ağırlıklar kaba: 3=çok güçlü, 2=orta, 1=zayıf.
const PACK_TYPE_KEYWORDS = {
  is: [
    ["iş sözleşmesi", 3],
    ["işveren", 3],
    ["çalışan", 3],
    ["sgk", 3],
    ["maaş", 2],
    ["ücret", 2],
    ["mesai", 2],
    ["deneme süresi", 2],
    ["kıdem", 2],
    ["ihbar", 2],
    ["fesih", 1],
  ],
  gizlilik: [
    ["nda", 3],
    ["non disclosure", 3],
    ["gizlilik", 3],
    ["gizli bilgi", 3],
    ["confidential", 3],
    ["ifşa", 2],
    ["disclosure", 2],
  ],
  kira: [
    ["kira sözleşmesi", 3],
    ["kiracı", 3],
    ["kiraya veren", 3],
    ["kira bedeli", 2],
    ["depozito", 2],
    ["tahliye", 2],
    ["taşınmaz", 2],
    ["konut", 1],
    ["işyeri", 1],
  ],
  satis: [
    ["satıcı", 3],
    ["alıcı", 3],
    ["satış bedeli", 3],
    ["teslim", 2],
    ["mülkiyet", 2],
    ["ayıplı", 2],
    ["garanti", 1],
    ["fatura", 1],
  ],
  saas: [
    ["saas", 3],
    ["subscription", 3],
    ["terms of service", 3],
    ["lisans", 2],
    ["abonelik", 2],
    ["kullanıcı", 2],
    ["sla", 2],
    ["hizmet seviyesi", 2],
    ["api", 1],
    ["plan", 1],
  ],
  abonelik: [
    ["abonelik", 3],
    ["üyelik", 3],
    ["otomatik yenileme", 2],
    ["iptal", 2],
    ["cayma", 2],
    ["tüketici", 1],
    ["fatura", 1],
  ],
  hizmet: [
    ["hizmet", 2],
    ["proje", 2],
    ["teslim", 2],
    ["kapsam", 2],
    ["danışman", 2],
    ["freelance", 3],
    ["serbest", 2],
    ["hakediş", 2],
    ["fatura", 1],
    ["ücret", 1],
  ],
  influencer: [
    ["influencer", 3],
    ["iş birliği", 3],
    ["reklam", 2],
    ["sponsor", 2],
    ["marka", 2],
    ["instagram", 2],
    ["tiktok", 2],
    ["youtube", 2],
    ["post", 1],
    ["story", 1],
    ["hashtag", 1],
  ],
  etkinlik: [
    ["düğün", 3],
    ["nikah", 3],
    ["davet", 2],
    ["davetli", 2],
    ["organizasyon", 2],
    ["salon", 2],
    ["etkinlik", 2],
    ["kutlama", 2],
    ["rezervasyon", 1],
    ["cayma bedeli", 1],
    ["kına", 1],
    ["nişan", 1],
  ],
  kredi: [
    ["borçlu", 3],
    ["alacaklı", 3],
    ["kredi", 3],
    ["borç", 3],
    ["taksit", 2],
    ["vade", 2],
    ["faiz", 2],
    ["temerrüt", 2],
    ["kefil", 2],
    ["senet", 1],
  ],
  egitim: [
    ["eğitim", 3],
    ["kurs", 3],
    ["öğrenci", 2],
    ["katılımcı", 2],
    ["ders", 2],
    ["program", 2],
    ["sertifika", 1],
    ["kayıt", 1],
    ["ücret iadesi", 1],
  ],
  arac: [
    ["araç", 3],
    ["kiralama", 2],
    ["plaka", 2],
    ["kilometre", 2],
    ["yakıt", 1],
    ["kasko", 2],
    ["hasar", 2],
    ["teslim", 1],
    ["iade", 1],
    ["rent a car", 3],
  ],
  seyahat: [
    ["tur", 3],
    ["seyahat", 3],
    ["acente", 2],
    ["otel", 2],
    ["rezervasyon", 2],
    ["uçuş", 2],
    ["vize", 1],
    ["iptal", 1],
    ["iade", 1],
  ],
  sigorta: [
    ["sigorta", 3],
    ["poliçe", 3],
    ["prim", 2],
    ["teminat", 2],
    ["hasar", 2],
    ["tazminat", 2],
    ["sigortalı", 2],
    ["muafiyet", 1],
    ["risk", 1],
  ],
};

function packLabelTR(pack) {
  return PACK_LABELS_TR[pack] || String(pack || "");
}

function scorePackType(textFold, pack) {
  const defs = PACK_TYPE_KEYWORDS[pack] || [];
  let score = 0;
  const hits = [];
  for (const [kwRaw, w] of defs) {
    const kw = foldTR(String(kwRaw).toLowerCase());
    if (!kw) continue;
    if (textFold.includes(kw)) {
      score += Number(w) || 1;
      if (hits.length < 6) hits.push(kwRaw);
    }
  }
  return { score, hits };
}

function guessPackType(textRaw) {
  const textFold = foldTR(String(textRaw || "").toLowerCase());
  const scores = {};
  const hitsByPack = {};
  let bestPack = null;
  let bestScore = 0;
  for (const pack of Object.keys(PACK_TYPE_KEYWORDS)) {
    const { score, hits } = scorePackType(textFold, pack);
    scores[pack] = score;
    hitsByPack[pack] = hits;
    if (score > bestScore) {
      bestScore = score;
      bestPack = pack;
    }
  }
  return { scores, hitsByPack, bestPack, bestScore };
}

function detectSozlesmeTuruUyumsuzlugu(textRaw, selectedPack) {
  const selected = (selectedPack || "genel").toString();
  const { scores, hitsByPack, bestPack, bestScore } = guessPackType(textRaw);
  const selectedScore = scores[selected] || 0;

  // Çok zayıf sinyalse hiç karışma.
  const MIN_SCORE = 6;
  const MARGIN = 4;
  if (!bestPack || bestScore < MIN_SCORE) return null;
  if (bestPack === selected) return null;

  // "Genel" seçildiyse bunu bir öneri gibi söyleyelim.
  const isSuggestion = selected === "genel";
  if (!isSuggestion && bestScore < selectedScore + MARGIN) return null;

  const hits = (hitsByPack[bestPack] || []).slice(0, 4);
  const hitText = hits.length ? ` (ipucu kelimeler: ${hits.join(", ")})` : "";

  return {
    id: isSuggestion ? "pack_suggestion" : "pack_mismatch",
    title: isSuggestion
      ? "Sözleşme türü tahmini"
      : "Sözleşme türü seçimi uyuşmuyor olabilir",
    severity: isSuggestion ? "low" : "medium",
    category: "Belirsizlik",
    why: isSuggestion
      ? `Bu metin, seçili tür \"Genel\" iken daha çok “${packLabelTR(bestPack)}” gibi görünüyor${hitText}. Türü seçip tekrar analiz edersen daha isabetli sonuç alırsın.`
      : `Seçilen tür “${packLabelTR(selected)}”, ama metin daha çok “${packLabelTR(bestPack)}” türüne benziyor${hitText}. Yanlış tür seçimi skor ve önerileri şişirebilir/azaltabilir; üstteki “Sözleşme Türü” alanından düzeltip tekrar analiz et.`,
    templates: [
      "Sözleşme türünü doğru seçtiğinden emin ol.",
      "Yanlış seçtiysen türü değiştirip tekrar analiz et.",
    ],
  };
}

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
  if (riskScore >= 30) return { level: "MEDIUM", color: "medium" };
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
  // Etkinlik/düğün sözleşmeleri: yüksek risk maddeleri çok sık “şablon” olarak geliyor.
  // Aynı uyarıları göstermek isteriz ama skoru daha az agresif yapalım.
  if (p === "etkinlik") return 5.00;
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

function scoreFromPoints(points, pack, riskCount = 0, softCount = 0) {
  // Puanları 0-100'e çevirirken iki şeyi dengeleriz:
  // 1) Ham puan (ağırlıklar) → daha fazla puan daha yüksek risk
  // 2) Yoğunluk → az sayıda maddeyle yüksek skor çıkmasını biraz yumuşat
  //
  // Not: Bu bir "hukuki kesinlik" değil; kullanıcıya okunabilir bir özet skor.
  const k = 130 * packFactor(pack); // önceki 95 biraz agresifti
  const raw = 100 * (1 - Math.exp(-(Number(points || 0) / k)));

  const countEff = Math.max(
    0,
    Number(riskCount || 0) + Number(softCount || 0) * 0.35
  );
  const density = 0.75 + 0.25 * (1 - Math.exp(-(countEff / 6)));

  const adjusted = raw * density;
  return Math.max(0, Math.min(100, Math.round(adjusted)));
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
// Metinden “madde/parağraf” çıkarma: kullanıcılar genelde "bütün maddeyi" görmek istiyor.
// PDF → metin dönüşümlerinde satır kırılımları çok oynak olduğu için tek satır newline
// ile kesmek alıntıyı çoğu zaman yarım bırakıyor. Bu yüzden daha geniş bir pencere
// ve daha “akıllı” bitiş kriterleri kullanıyoruz.
function makeClause(text, index, maxLen = 12000) {
  const t = String(text || "");
  if (!t) return "";

  const i = Math.max(0, Math.min(Number(index) || 0, t.length));

  // Amaç: 'Metinden alıntı' kısmında mümkün olduğunca *bütün maddeyi* göstermek.
  // PDF -> metin dönüşümlerinde satır kırılımları bozulabildiği için hem
  // "MADDE 14" hem de "14.4." gibi numaralı madde başlangıçlarını yakalamaya çalışıyoruz.
  const backWindow = 22000;
  const fwdWindow = 26000;

  const winStart = Math.max(0, i - backWindow);
  const winEnd = Math.min(t.length, i + fwdWindow);

  const before = t.slice(winStart, i);
  const after = t.slice(i, winEnd);

  // Madde başlangıcı yakalayıcıları
  const reMadde = /(^|\n)\s*(MADDE|Madde)\s*\d+[^\n]{0,120}/g;
  // 14.4., 5.5, 7) gibi (satır başında) numaralı madde başlangıçları
  const reNum = /(^|\n)\s*\d+(?:\.\d+){0,5}\s*(?:[)\.]|[-\u2013\u2014])\s*/g;

  const lastMatchStart = (rx, s) => {
    let last = null;
    let m;
    while ((m = rx.exec(s))) last = m;
    rx.lastIndex = 0;
    return last ? last.index : -1;
  };

  const firstMatchStart = (rx, s) => {
    const m = rx.exec(s);
    rx.lastIndex = 0;
    return m ? m.index : -1;
  };

  // 1) Başlangıç: gerideki en yakın madde başlığını bul
  let start = winStart;
  const s1 = lastMatchStart(reMadde, before);
  const s2 = lastMatchStart(reNum, before);
  if (s1 >= 0) start = Math.max(start, winStart + s1);
  if (s2 >= 0) start = Math.max(start, winStart + s2);

  // Hiç yakalayamazsak paragraf başlangıcına yakınla
  if (start === winStart) {
    const p2 = before.lastIndexOf("\n\n");
    if (p2 >= 0) start = winStart + p2 + 2;
    else {
      const p1 = before.lastIndexOf("\n");
      if (p1 >= 0) start = winStart + p1 + 1;
    }
  }

  // 2) Bitiş: ileriye doğru bir sonraki madde başlığını bul
  let end = winEnd;
  const e1 = firstMatchStart(reMadde, after);
  const e2 = firstMatchStart(reNum, after);

  const ends = [];
  if (e1 > 0) ends.push(i + e1);
  if (e2 > 0) ends.push(i + e2);
  if (ends.length) end = Math.min(...ends);
  else {
    const pe = after.indexOf("\n\n");
    if (pe >= 0) end = i + pe;
  }

  if (end < start) end = Math.min(t.length, start + maxLen);
  if (end - start > maxLen) end = Math.min(t.length, start + maxLen);

  let out = t.slice(start, end).trim();
  // Boşlukları hafif toparla (metni bozma)
  out = out.replace(/\t/g, " ");
  out = out.replace(/[ \u00a0]+/g, " ");
  return out;
}


// --- Etkinlik konusu / türü tutarlılık kontrolü (düğün mü, kurumsal etkinlik mi?) ---
function foldTR(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function findFirstMatchIndex(text, regexes) {
  const t = String(text || "");
  for (const re of regexes) {
    try {
      const r = new RegExp(re.source, re.flags); // clone to avoid sticky state
      const m = r.exec(t);
      if (m && typeof m.index === "number") return { index: m.index, match: m[0] };
    } catch (_) {
      // ignore invalid regex
    }
  }
  return null;
}

function detectEtkinlikKonuUyumsuzlugu(text) {
  const raw = String(text || "");
  if (!raw) return null;

  const folded = foldTR(raw);

    const weddingMarkers = [
      "dugun",
      "nikah",
      "gelin",
      "damat",
      "nisan",
      "kina",
      "evlilik",
      "davetli",
      "dugun salon",
    ];
    const corpMarkers = [
      "sirket",
      "firma",
      "kurumsal",
      "eczane",
      "magaza",
      "marka",
      "lansman",
      "acilis",
      "yildonum",
      "yil donum",
      "kutlama",
    ];

    const hasWedding = weddingMarkers.some((k) => folded.includes(k));
    const hasCorp = corpMarkers.some((k) => folded.includes(k));

  // "Etkinlik konusu" gibi bir cümle/başlık yakalamaya çalış
  const subjectHit =
    findFirstMatchIndex(raw, [
      /[^\n.]{0,80}\b(kutlamas[ıi]|yıl\s*dönümü|yıldönümü)\b[^\n.]{0,80}/i,
      /[^\n.]{0,80}\b(etkinli(ğ|g)i|organizasyon(u)?)\b[^\n.]{0,80}/i,
      /eczane[^\n.]{0,120}/i,
    ]) || findFirstMatchIndex(raw, [/etkinlik/i, /organizasyon/i, /kutlama/i, /yıl\s*dönümü/i]);

  const quote = subjectHit ? makeClause(raw, subjectHit.index) : "";

  // Kanıt kelimelerinden 1-2 tane gösterelim
  const evidence = [];
  const corpEv = findFirstMatchIndex(raw, [
    /eczane/i,
    /şirket/i,
    /firma/i,
    /kurumsal/i,
    /yıl\s*dönümü/i,
    /yıldönümü/i,
    /kutlama/i,
    /lansman/i,
    /açılış/i,
  ]);
  if (corpEv) evidence.push(corpEv.match);
  const wedEv = findFirstMatchIndex(raw, [/düğün/i, /dugun/i, /nikah/i, /gelin/i, /damat/i, /nişan/i, /nisan/i, /kına/i, /kina/i]);
  if (wedEv) evidence.push(wedEv.match);

  // Uyarı üret: düğün beklenirken kurumsal etkinlik gibi duruyorsa
  if (hasCorp && !hasWedding) {
    return {
      detectedType: "kurumsal/başka etkinlik",
      level: "MEDIUM",
      evidence: evidence.filter(Boolean).slice(0, 3),
      quote,
      message:
        "Metin düğün/nikah gibi görünmüyor; kurumsal/başka bir etkinliğe işaret eden ifadeler var. Eğer bu sözleşme düğün için hazırlanıyorsa, etkinlik konusu/başlığı yanlış yazılmış olabilir.",
    };
  }

  // Her ikisi de varsa: karışık olabilir
  if (hasCorp && hasWedding) {
    return {
      detectedType: "karma",
      level: "LOW",
      evidence: evidence.filter(Boolean).slice(0, 3),
      quote,
      message:
        "Metinde hem düğün hem de kurumsal/başka etkinlik ifadeleri var. Etkinlik konusu/başlığı, taraflar ve tarihler tutarlı mı kontrol et.",
    };
  }

  return null;
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

// Sözleşme türü seçimi ile metnin türü bariz şekilde uyuşmuyorsa uyar (tüm türler)
const packTypeWarn = detectSozlesmeTuruUyumsuzlugu(text, pack);
if (packTypeWarn) {
  // Bu uyarı genelde "yanlış tür seçimi" demek olduğu için üstte görünmesi iyi.
  softWarnings.unshift(packTypeWarn);
}

// Etkinlik sözleşmelerinde "konu" tutarlılığı: düğün yerine başka bir etkinlik yazılmış olabilir
if (pack === "etkinlik" && !(packTypeWarn && packTypeWarn.id === "pack_mismatch")) {
  const konu = detectEtkinlikKonuUyumsuzlugu(text);
  if (konu) {
    const ev = konu.evidence && konu.evidence.length ? ` (örn. ${konu.evidence.join(", ")})` : "";
    softWarnings.unshift({
      id: "event_topic_mismatch",
      title: "Etkinlik konusu tutarsız olabilir",
      severity: konu.level || "MEDIUM",
      category: "Tutarlılık",
      why: `${konu.message}${ev}`,
      quote: konu.quote || undefined,
      templates: [
        "Etkinlik konusu/başlığı (ne etkinliği/kutlaması) net ve doğru yazılsın.",
        "Sözleşmenin tamamında etkinlik adı/türü, tarih ve taraflar aynı şekilde geçsin.",
        "Eğer bu bir düğün sözleşmesi ise, metindeki etkinlik tanımı düğün/nikah ile uyumlu hale getirilsin.",
      ],
    });
    // Not: Bu bir tutarlılık uyarısı; skoru şişirmemek için puan eklemiyoruz.
  }
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

  const riskScore = scoreFromPoints(riskPoints, pack, groupedIssues.length, softWarnings.length);
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
