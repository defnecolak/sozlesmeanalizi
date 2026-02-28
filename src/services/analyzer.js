const crypto = require("crypto");
const { RULES, SEVERITY_WEIGHT, SEVERITY_RANK } = require("./rules");
const { extractEventMeta } = require("./eventSimulator");
const { marketReviewForPack } = require("./marketReview");

const PACK_ALIASES = {
  is: ["hizmet"],
  egitim: ["satis"],
  kredi: ["satis"],
  gizlilik: ["saas", "hizmet"],

  // Etkinlik sözleşmeleri pratikte çoğu zaman "hizmet" sözleşmesi gibi işler
  etkinlik: ["hizmet"],

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
    severity: isSuggestion ? "INFO" : "MEDIUM",
    category: "Belirsizlik",
    why: isSuggestion
      ? `Bu metin, seçili tür \"Genel\" iken daha çok “${packLabelTR(bestPack)}” gibi görünüyor${hitText}. Türü seçip tekrar analiz edersen daha isabetli sonuç alırsın.`
      : `Seçilen tür “${packLabelTR(selected)}”, ama metin daha çok “${packLabelTR(bestPack)}” türüne benziyor${hitText}. Yanlış tür seçimi skor ve önerileri şişirebilir/azaltabilir; üstteki “Sözleşme Türü” alanından düzeltip tekrar analiz et.`,
    templates: [
      "Sözleşme türünü doğru seçtiğinden emin ol.",
      "Yanlış seçtiysen türü değiştirip tekrar analiz et.",
    ],

    // Bu uyarı bir tutarlılık/tahmin uyarısıdır; risk skorunu şişirmesin.
    countsForScore: false,
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

function getLevelFromScore(riskScore, severityCounts = {}) {
  // Skor tek başına her zaman yeterli değil.
  // Örn. 1 adet KRİTİK madde varsa, toplam skor düşük kalsa bile kullanıcıya en az "ORTA" demek daha dürüst.
  const rankMap = [
    { level: "DÜŞÜK", color: "low" },
    { level: "ORTA", color: "medium" },
    { level: "YÜKSEK", color: "high" },
    { level: "ÇOK YÜKSEK", color: "critical" },
  ];

  // Baz eşikler (genel):
  let baseRank = 0;
  if (riskScore >= 75) baseRank = 3;
  else if (riskScore >= 55) baseRank = 2;
  else if (riskScore >= 30) baseRank = 1;

  // Şiddete göre minimum seviye:
  const crit = Number(severityCounts.CRITICAL || 0);
  const high = Number(severityCounts.HIGH || 0);
  let minRank = 0;
  if (crit >= 1) minRank = 1; // en az ORTA
  if (crit >= 2 || (crit >= 1 && high >= 2)) minRank = 2; // en az YÜKSEK
  if (crit >= 3) minRank = 3; // çok nadir

  const finalRank = Math.max(baseRank, minRank);
  return rankMap[finalRank];
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
  // Not: Bu değer "puan -> skor" eğrisini etkiler (k sabitini büyütür). Çok yüksek yaparsak skor aşırı düşer.
  if (p === "etkinlik") return 1.20;
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


function packGamma(pack) {
  // Skor kalibrasyonu: bazı sözleşme türlerinde (özellikle etkinlik/düğün)
  // standart ama sert yazılmış maddeler çok sık görünüyor. "Hemen yüksek!" demek yerine
  // skor eğrisini yumuşatıyoruz.
  // gamma=1.0 => değişmez; gamma>1.0 => skor daha düşük çıkar (aynı puanda).
  const key = String(pack || "genel").toLowerCase();
  if (key === "etkinlik") return 1.35; // etkinlikte skor şişmesin ama 0’a da çökmesin
  return 1.0;
}

function packBaselinePoints(pack) {
  // Her tür için "normal" kabul edilen (çoğu sözleşmede zaten olan) risk yoğunluğunu
  // sıfırdan saymak yerine hafifçe normalize ediyoruz.
  const p = String(pack || "genel").toLowerCase();
  const map = {
    etkinlik: 12,
    hizmet: 12,
    genel: 10,
    influencer: 12,
    kira: 14,
    satis: 12,
    saas: 16,
    is: 18,
    kredi: 14,
    egitim: 12,
    gizlilik: 10,
    abonelik: 14,
    arac: 14,
    seyahat: 14,
    sigorta: 14,
  };
  return map[p] ?? 18;
}



function scoreFromPoints(points, pack, riskCount = 0, softCount = 0) {
  // Puanları 0-100'e çevirirken iki şeyi dengeleriz:
  // 1) Ham puan (ağırlıklar) → daha fazla puan daha yüksek risk
  // 2) Yoğunluk / kanıt → daha çok sinyal yakaladıkça skor biraz daha “kendinden emin” olur
  //
  // Ek olarak: Her sözleşme türünde "doğası gereği" sık görülen bazı maddeler var.
  // Bunları tamamen yok saymıyoruz ama skoru şişirmesin diye küçük bir baz çizgisi düşüyoruz.
  const pts = Math.max(0, Number(points || 0));

  const pf = packFactor(pack);
  const gamma = packGamma(pack);

  const countEff = Math.max(1, riskCount + softCount * 0.6);
  const density = Math.max(0.7, Math.min(1.25, countEff / 8));

  const baseline = packBaselinePoints(pack);
  // Baz çizgisi, çok düşük puanlarda skoru sıfırlamasın diye puanın belli bir yüzdesini aşmasın.
  const safeBaseline = Math.min(baseline, pts * 0.6);
  const adjPts = Math.max(0, pts - safeBaseline);

  const k = 55 * pf * density;
  const raw = 100 * (1 - Math.exp(-adjPts / k));

  const score = Math.max(0, Math.min(100, Math.round(Math.pow(raw / 100, gamma) * 100)));
  return score;
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


// --- Bağlama duyarlı (context-aware) puan ayarlamaları ---
// Amaç: "her gördüğümü kırmızıya boyayayım" yerine, sözleşme türüne göre daha gerçekçi bir skor.
// Özellikle etkinlik/düğün sözleşmelerinde bazı sert kalıplar çok standart: puanı biraz yumuşatırız.

function _norm(s) {
  return String(s || "").toLowerCase();
}

function _hasAny(t, needles) {
  const s = _norm(t);
  return (needles || []).some((n) => s.includes(String(n)));
}

function _extractPercents(t) {
  const s = _norm(t);
  const out = [];
  let m;
  const r1 = /%\s*(\d{1,3}(?:[\.,]\d+)?)/g;
  while ((m = r1.exec(s))) out.push(parseFloat(m[1].replace(",", ".")));
  const r2 = /(\d{1,3}(?:[\.,]\d+)?)\s*%/g;
  while ((m = r2.exec(s))) out.push(parseFloat(m[1].replace(",", ".")));
  return out.filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
}

function _hasCapLanguage(t) {
  return _hasAny(t, [
    "üst sınır",
    "ust sınır",
    "azami",
    "limit",
    "ile sınırl",
    "sınırlıdır",
    "sinirlidir",
    "toplam bedel",
    "sözleşme bedeli",
    "sozlesme bedeli",
  ]);
}

function _excludesIndirectDamage(t) {
  const s = _norm(t);
  const idx = Math.max(s.indexOf("dolaylı"), s.indexOf("dolayli"));
  if (idx < 0) return false;
  const win = s.slice(Math.max(0, idx - 40), Math.min(s.length, idx + 80));
  return (
    win.includes("hariç") ||
    win.includes("haric") ||
    win.includes("dahil değildir") ||
    win.includes("dahil degildir") ||
    win.includes("dahil değil") ||
    win.includes("dahil degil")
  );
}

function contextAdjust(ruleId, sample, pack) {
  const p = _norm(pack);
  const quote = _norm((sample && (sample.quoteFull || sample.quote || sample.snippet)) || "");
  if (!quote) return 1.0;

  let m = 1.0;

  if (p === "etkinlik") {
    // 1) Sınırsız sorumluluk / dolaylı zarar
    if (ruleId === "unlimited_liability") {
      m *= 0.72;
      if (_hasCapLanguage(quote)) m *= 0.65;
      if (_excludesIndirectDamage(quote)) m *= 0.70;
    }

    // 2) Cezai şart / cayma bedeli: yüzdeye göre şiddeti ayarla
    if (ruleId === "penalty_clause") {
      m *= 0.85;
      const perc = _extractPercents(quote);
      if (perc.length) {
        const mx = Math.max(...perc);
        if (mx <= 20) m *= 0.65;
        else if (mx <= 35) m *= 0.80;
        else if (mx <= 50) m *= 0.90;
      }
    }

    // 3) Alt yüklenici / üçüncü kişi kullanımı
    if (ruleId === "third_party_unlimited") {
      m *= 0.80;
      if (_hasAny(quote, ["yazılı izin", "yazili izin", "onay"])) m *= 0.85;
    }
  }

  // Güvenli aralık (aşırı oynamasın)
  return Math.max(0.35, Math.min(1.35, m));
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

// -------------------------------------------
// Pack'e göre “konu / içerik” tutarlılık kontrolleri
//
// Amaç:
// - Kullanıcı yanlış dosya yüklediyse (veya metin içinde bariz başka bir konu varsa)
//   bunu erken yakalayıp uyarı vermek.
// - Skoru şişirmemek için bu uyarılar *puan eklemez* (sadece bilgi/uyarı).
// -------------------------------------------

function _countAny(textNorm, needles) {
  let c = 0;
  for (const n of needles) {
    if (!n) continue;
    const nn = foldTR(String(n).toLowerCase());
    if (nn && textNorm.includes(nn)) c++;
  }
  return c;
}

function detectPackTopicHints(text, pack) {
  const t = foldTR(String(text || "").toLowerCase());
  const hints = [];

  // 1) Etkinlik özel: düğün yerine kurumsal/başka etkinlik yazılmış olabilir
  if (pack === "etkinlik") {
    const konu = detectEtkinlikKonuUyumsuzlugu(text);
    if (konu) {
      const ev = konu.evidence && konu.evidence.length ? ` (örn. ${konu.evidence.join(", ")})` : "";
      hints.push({
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
    }
    return hints.map((h) => ({ countsForScore: false, ...h }));
  }

  // 2) Araç sinyali: plaka/şasi/ruhsat vb.
  const aracSignals = [
    "plaka",
    "şasi",
    "sasi",
    "ruhsat",
    "kilometre",
    "km ",
    "motor",
    "kasko",
    "trafik sigortası",
    "muayene",
    "satış tescil",
    "noter",
  ];
  const aracScore = _countAny(t, aracSignals);

  // 3) Gayrimenkul / tapu sinyali
  const tapuSignals = [
    "tapu",
    "ada",
    "parsel",
    "taşınmaz",
    "tasınmaz",
    "kat irtifakı",
    "kat mülkiyeti",
    "iskan",
  ];
  const tapuScore = _countAny(t, tapuSignals);

  // 4) İş sözleşmesi sinyali
  const isSignals = [
    "işveren",
    "isveren",
    "işçi",
    "isci",
    "sgk",
    "maaş",
    "maas",
    "ücret bordro",
    "çalışma süresi",
    "mesai",
    "yıllık izin",
    "ihbar",
    "kıdem",
  ];
  const isScore = _countAny(t, isSignals);

  // 5) Abonelik / üyelik sinyali (SaaS olmayan üyelikler dahil)
  const abonelikSignals = [
    "abonelik",
    "üyelik",
    "uyelik",
    "yenileme",
    "otomatik yenile",
    "iptal",
    "cayma",
  ];
  const abonelikScore = _countAny(t, abonelikSignals);

  // 6) SaaS / dijital hizmet sinyali
  const saasSignals = [
    "saas",
    "api",
    "endpoint",
    "uptime",
    "sla",
    "hizmet seviyesi",
    "kullanıcı hesab",
    "veri işleme",
    "data processing",
    "kullanım şart",
  ];
  const saasScore = _countAny(t, saasSignals);

  // 7) Gizlilik / NDA sinyali
  const ndaSignals = [
    "gizli bilgi",
    "gizlilik",
    "confidential",
    "nda",
    "non-disclosure",
    "ifşa",
    "ifsa",
  ];
  const ndaScore = _countAny(t, ndaSignals);

  // 8) Seyahat sinyali
  const seyahatSignals = [
    "otel",
    "rezervasyon",
    "uçuş",
    "ucus",
    "tur",
    "vize",
    "check-in",
    "check out",
  ];
  const seyahatScore = _countAny(t, seyahatSignals);

  // 9) Sigorta sinyali
  const sigortaSignals = [
    "poliçe",
    "police",
    "prim",
    "teminat",
    "muafiyet",
    "hasar",
    "rücu",
    "rucu",
  ];
  const sigortaScore = _countAny(t, sigortaSignals);

  // 10) Eğitim sinyali
  const egitimSignals = [
    "öğrenci",
    "ogrenci",
    "kurs",
    "eğitim",
    "egitim",
    "ders",
    "sertifika",
    "kayıt ücreti",
  ];
  const egitimScore = _countAny(t, egitimSignals);

  // Pack'e göre “ben aslında başka bir şeye benziyorum” uyarıları
  // (özellikle kullanıcı yanlış tür seçmiş ama pack_mismatch eşiğini geçmemiş olabilir)
  // Not: Bunlar yumuşak uyarı; puan eklemiyoruz.

  if (pack === "kira" && aracScore >= 3) {
    hints.push({
      id: "topic_suggest_arac",
      title: "Bu metin araçla ilgili olabilir",
      severity: "INFO",
      category: "Tutarlılık",
      why: "Metinde plaka/ruhsat/şasi gibi araç sinyalleri var. Eğer bu bir araç kiralama/satış metniyse ‘Araç’ türünü seçmek daha doğru olur.",
      templates: ["Sözleşme türünü kontrol et: Kira mı, araç mı?", "Araçla ilgiliyse plaka/şasi/teslim-iade şartlarını netleştir."],
    });
  }

  if (pack === "satis" && aracScore >= 3) {
    hints.push({
      id: "topic_suggest_arac",
      title: "Bu satış metni araç satışı olabilir",
      severity: "INFO",
      category: "Tutarlılık",
      why: "Metinde plaka/ruhsat/şasi gibi araç sinyalleri var. Araç satışıysa ‘Araç’ türü daha isabetli analiz verir.",
      templates: ["Araç satışında plaka/şasi, hasar kaydı ve devir/tescil akışını netleştir."],
    });
  }

  if (pack === "arac" && tapuScore >= 2) {
    hints.push({
      id: "topic_maybe_not_arac",
      title: "Bu metin araçla ilgili olmayabilir",
      severity: "INFO",
      category: "Tutarlılık",
      why: "Metinde tapu/ada/parsel gibi gayrimenkul sinyalleri var. Yanlış dosya yüklenmiş olabilir.",
      templates: ["Sözleşme türünü ve yüklenen dosyayı kontrol et."],
    });
  }

  if (pack === "is" && isScore < 2 && ndaScore + saasScore + abonelikScore + tapuScore + aracScore >= 4) {
    hints.push({
      id: "topic_maybe_not_employment",
      title: "Bu metin iş sözleşmesi olmayabilir",
      severity: "INFO",
      category: "Tutarlılık",
      why: "İş sözleşmesi sinyalleri zayıf (SGK/maaş/mesai/izin gibi) ama başka sözleşme sinyalleri güçlü. Yanlış tür/dosya seçilmiş olabilir.",
      templates: ["Eğer bu bir hizmet/freelance ilişkisi ise ‘Hizmet Sözleşmesi’ türü daha uygun olur.", "İş sözleşmesi ise ücret, çalışma süresi, izin ve fesih hükümlerini netleştir."],
    });
  }

  if (pack === "gizlilik" && ndaScore < 2) {
    hints.push({
      id: "topic_maybe_not_nda",
      title: "Bu metin NDA/Gizlilik olmayabilir",
      severity: "INFO",
      category: "Tutarlılık",
      why: "Metinde ‘gizli bilgi / gizlilik / confidential’ gibi temel gizlilik sinyalleri zayıf görünüyor. Yanlış tür/dosya seçilmiş olabilir.",
      templates: ["Gizlilik sözleşmesi ise gizli bilginin tanımı, kapsamı ve istisnaları net olsun."],
    });
  }

  if (pack === "abonelik" && saasScore >= 3 && abonelikScore >= 2) {
    hints.push({
      id: "topic_suggest_saas",
      title: "Bu metin SaaS/Dijital hizmet aboneliği gibi",
      severity: "INFO",
      category: "Tutarlılık",
      why: "Metinde API/SLA/veri işleme gibi dijital hizmet sinyalleri var. SaaS türü daha iyi analiz verebilir.",
      templates: ["SLA/uptime, veri işleme (KVKK/GDPR) ve hizmet kesintisi hükümlerini kontrol et."],
    });
  }

  if (pack === "saas" && abonelikScore >= 4 && saasScore < 2) {
    hints.push({
      id: "topic_suggest_abonelik",
      title: "Bu metin daha çok genel abonelik/üyelik gibi",
      severity: "INFO",
      category: "Tutarlılık",
      why: "Metinde abonelik/iptal/yenileme sinyalleri var ama API/SLA gibi SaaS sinyalleri zayıf. Genel abonelik türü daha uygun olabilir.",
      templates: ["İptal/yenileme ve ücret değişikliği kurallarını netleştir."],
    });
  }

  if (pack === "seyahat" && seyahatScore < 2 && (aracScore + tapuScore + saasScore + ndaScore + isScore) >= 4) {
    hints.push({
      id: "topic_maybe_not_travel",
      title: "Bu metin seyahat sözleşmesi olmayabilir",
      severity: "INFO",
      category: "Tutarlılık",
      why: "Seyahat sinyalleri zayıf ama başka sözleşme sinyalleri güçlü. Yanlış dosya/tür seçilmiş olabilir.",
      templates: ["Yüklenen dosyayı ve sözleşme türünü kontrol et."],
    });
  }

  if (pack === "sigorta" && sigortaScore < 2 && (aracScore + tapuScore + saasScore + ndaScore + abonelikScore + isScore) >= 4) {
    hints.push({
      id: "topic_maybe_not_insurance",
      title: "Bu metin sigorta sözleşmesi olmayabilir",
      severity: "INFO",
      category: "Tutarlılık",
      why: "Sigorta sinyalleri zayıf ama başka sözleşme sinyalleri güçlü. Yanlış dosya/tür seçilmiş olabilir.",
      templates: ["Yüklenen dosyayı ve sözleşme türünü kontrol et."],
    });
  }

  if (pack === "egitim" && egitimScore < 2 && (saasScore + abonelikScore + ndaScore + isScore) >= 4) {
    hints.push({
      id: "topic_maybe_not_education",
      title: "Bu metin eğitim sözleşmesi olmayabilir",
      severity: "INFO",
      category: "Tutarlılık",
      why: "Eğitim sinyalleri zayıf ama başka sözleşme sinyalleri güçlü. Yanlış dosya/tür seçilmiş olabilir.",
      templates: ["Yüklenen dosyayı ve sözleşme türünü kontrol et."],
    });
  }

  return hints.map((h) => ({ countsForScore: false, ...h }));
}

// ------------------------------------------------------------
// “Sözleşme doğru mu?” kontrolleri (tüm türlerde)
// Bu kontroller puan eklemez; sadece uyarı üretir.
// ------------------------------------------------------------

function extractSubjectSnippet(text) {
  const t = String(text || "");
  const lines = t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const patterns = [
    /sözleşmenin\s+konusu\s*[:\-–]?\s*(.{10,220})/i,
    /konu\s*[:\-–]\s*(.{10,220})/i,
    /subject\s*[:\-–]\s*(.{10,220})/i,
  ];
  for (const line of lines) {
    for (const re of patterns) {
      const m = line.match(re);
      if (m && m[1]) return m[1].trim();
    }
  }
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function detectTemplatePlaceholders(text) {
  const t = String(text || "");
  const hits = [];
  const rules = [
    { id: "blank_underscores", re: /_{4,}/g },
    { id: "blank_dots", re: /\.{5,}/g },
    { id: "blank_brackets", re: /\[(\s*)\]/g },
    { id: "blank_curly", re: /\{\{\s*\w*\s*\}\}/g },
    { id: "placeholder_adsoyad", re: /(ad\s*soyad\s*[:\-–]?\s*$|ad\s*soyad\s*[:\-–]?\s*\.+)/gim },
    { id: "placeholder_tckn", re: /(t\.?\s*c\.?\s*kimlik|tckn|tc\s*no)\s*[:\-–]?\s*$|((t\.?\s*c\.?\s*kimlik|tckn|tc\s*no)\s*[:\-–]?\s*\.+)/gim },
  ];
  for (const r of rules) {
    const m = t.match(r.re);
    if (m && m.length) hits.push(r.id);
  }
  if (/(lorem\s+ipsum|\bTBD\b|\bTO\s*BE\s*DECIDED\b|\bFILL\s*IN\b)/i.test(t)) hits.push("placeholder_text");
  return Array.from(new Set(hits));
}

function inferRoleFromText(text) {
  const t = String(text || "");
  const counts = {
    hizmet_alan: 0,
    hizmet_veren: 0,
    kiraci: 0,
    ev_sahibi: 0,
    alici: 0,
    satici: 0,
  };

  const bump = (key, re) => {
    const m = t.match(re);
    if (!m) return;
    counts[key] += m.length;
  };

  // Kira
  bump("kiraci", /(\bkiracı\b|\bkiraci\b|tenant|lessee)/ig);
  bump("ev_sahibi", /(kiraya\s+veren|mal\s+sahibi|ev\s+sahibi|landlord|lessor)/ig);

  // Satış
  bump("alici", /(\balıcı\b|\balici\b|buyer|purchaser)/ig);
  bump("satici", /(\bsatıcı\b|\bsatici\b|seller|vendor)/ig);

  // Hizmet
  bump("hizmet_alan", /(hizmet\s+alan|müşteri|musteri|iş\s*sahibi|davet\s*sahibi|client)/ig);
  bump("hizmet_veren", /(hizmet\s+veren|sağlayıcı|saglayici|yüklenici|yuklenici|provider|contractor|supplier)/ig);

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topRole, topCount] = entries[0];
  const second = entries[1]?.[1] ?? 0;

  if (topCount <= 1) return { role: null, strength: 0, counts };
  if (topCount === second) return { role: null, strength: 0, counts };

  const strength = Math.min(1, (topCount - second) / Math.max(2, topCount));
  return { role: topRole, strength, counts };
}

function detectRoleMismatch(text, selectedRole) {
  const sel = String(selectedRole || "genel");
  if (!sel || sel === "genel") return null;
  const guess = inferRoleFromText(text);
  if (!guess.role) return null;
  if (guess.role === sel) return null;
  if (guess.strength < 0.35) return null;

  const nice = {
    hizmet_alan: "Hizmet Alan",
    hizmet_veren: "Hizmet Veren",
    kiraci: "Kiracı",
    ev_sahibi: "Ev Sahibi",
    alici: "Alıcı",
    satici: "Satıcı",
    genel: "Genel",
  };

  return {
    id: "role_mismatch",
    title: "Rol seçimi ile metnin dili uyuşmuyor olabilir",
    severity: "MEDIUM",
    category: "Tutarlılık",
    why: `Seçtiğin rol ‘${nice[sel] || sel}’ ama metin daha çok ‘${nice[guess.role] || guess.role}’ tarafın diliyle yazılmış görünüyor. Rol yanlış seçildiyse analiz yanlış yere odaklanabilir; rol doğruysa sözleşmede taraf tanımlarını netleştir.`,
    templates: [
      "Taraf tanımlarını (Hizmet Alan/Hizmet Veren veya Alıcı/Satıcı vb.) başta net yazalım.",
      "Sözleşme boyunca taraf isimleri/tanımları tutarlı kullanılsın.",
    ],
    points: 0,
    countsForScore: false,
  };
}

function detectMissingEssentials(text, pack) {
  const t = String(text || "");
  const warnings = [];

  const hasMoney = /(\d{1,3}(?:[\.,]\d{3})*(?:[\.,]\d{1,2})?\s*(₺|TL|TRY|€|EUR|USD|\$)|\b(₺|TL|TRY|€|EUR|USD)\b)/i.test(t)
    || /\b(bedel|ücret|ucret|tutar|fiyat|ödeme|odeme|taksit|depozito|kapora|cayma)\b/i.test(t);
  const hasDate = /(\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{1,2}\s*(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\s*\d{2,4}\b)/i.test(t);
  const hasParties = /(\btaraflar\b|\btaraf\b|\balıcı\b|\bsatıcı\b|\bkiracı\b|kiraya\s+veren|işveren|işçi|müşteri|hizmet\s+alan|hizmet\s+veren|davet\s+sahibi)/i.test(t);
  const hasSignature = /(imza|imzalan|imzalanmıştır|imzalanmistir|ıslak\s+imza|kaşe|kase)/i.test(t);

  if (!hasParties) {
    warnings.push({
      id: "no_parties",
      title: "Taraf tanımı net değil",
      severity: "LOW",
      category: "Tutarlılık",
      why: "Metinde ‘taraflar/alıcı-satıcı/kiracı-kiraya veren’ gibi net taraf tanımları zayıf görünüyor. İmza öncesi taraflar ve unvanlar açık yazılmalı.",
      templates: ["Tarafların adı/ünvanı/adresi başta net yazılsın."],
      points: 0,
      countsForScore: false,
    });
  }

  if (!hasSignature) {
    warnings.push({
      id: "no_signature",
      title: "İmza/kaşe bölümü görünmüyor olabilir",
      severity: "LOW",
      category: "Tutarlılık",
      why: "Metinde imza/kaşe alanına dair net bir bölüm göremedim. Bu bir taslak olabilir veya metin çıkarımında eksik kalmış olabilir.",
      templates: ["İmza sayfası/alanı eklensin; tarih ve imza yerleri belli olsun."],
      points: 0,
      countsForScore: false,
    });
  }

  const moneyOptional = new Set(["gizlilik"]);
  if (!moneyOptional.has(pack) && pack !== "genel" && !hasMoney) {
    warnings.push({
      id: "no_money",
      title: "Bedel/ücret bilgisi net değil",
      severity: "MEDIUM",
      category: "Tutarlılık",
      why: "Metinde bedel/ücret/ödeme tutarı net görünmüyor. Sözleşmelerde en çok sorun çıkaran yer burası; rakamlar ve ödeme planı açık olmalı.",
      templates: ["Toplam bedel, ödeme takvimi ve varsa depozito/kapora net yazılsın."],
      points: 0,
      countsForScore: false,
    });
  }

  const dateRequired = new Set(["etkinlik", "seyahat", "egitim"]);
  if (dateRequired.has(pack) && !hasDate) {
    warnings.push({
      id: "no_date",
      title: "Tarih/süre bilgisi net değil",
      severity: "MEDIUM",
      category: "Tutarlılık",
      why: "Bu tür sözleşmelerde tarih/süre kritik. Metinde net bir tarih/süre bilgisi göremedim.",
      templates: ["Başlangıç-bitiş tarihi/saat aralığı net yazılsın."],
      points: 0,
      countsForScore: false,
    });
  }

  return warnings;
}

function buildCorrectnessChecks(text, pack, role) {
  const t = String(text || "");
  const out = [];

  const ph = detectTemplatePlaceholders(t);
  if (ph.length) {
    out.push({
      id: "placeholders",
      title: "Sözleşmede boş bırakılmış alanlar olabilir",
      severity: "MEDIUM",
      category: "Tutarlılık",
      why: "Metin içinde boş alan/şablon izleri tespit ettim (örn. ‘____’, ‘.....’, ‘[ ]’). İmza öncesi tüm alanların doldurulduğundan emin ol.",
      templates: ["Boş alanları dolduralım; isim/ünvan/adres/bedel/tarih gibi bilgiler eksik kalmasın."],
      points: 0,
      countsForScore: false,
    });
  }

  const rm = detectRoleMismatch(t, role);
  if (rm) out.push(rm);

  out.push(...detectMissingEssentials(t, pack));

  // Bilgi amaçlı: yakalanırsa ileride farklı türler için de kullanılabilir.
  void extractSubjectSnippet(t);

  return out;
}

const CORRECTNESS_WARNING_IDS = new Set([
  "pack_mismatch",
  "pack_suggestion",
  "event_topic_mismatch",
  "placeholders",
  "role_mismatch",
  "no_parties",
  "no_signature",
  "no_money",
  "no_date",
  "topic_suggest_arac",
  "topic_maybe_not_arac",
  "topic_maybe_not_employment",
  "topic_maybe_not_nda",
  "topic_suggest_saas",
  "topic_suggest_abonelik",
  "topic_maybe_not_travel",
  "topic_maybe_not_insurance",
  "topic_maybe_not_education",
]);

function isCorrectnessWarning(w) {
  if (!w) return false;
  if (w.category === "Tutarlılık") return true;
  if (w.id && CORRECTNESS_WARNING_IDS.has(String(w.id))) return true;
  return false;
}

function buildContractCheckSummary(softWarnings, pack, role) {
  const warnings = (softWarnings || []).filter(isCorrectnessWarning);
  const mediumOrAbove = warnings.filter((w) => ["CRITICAL", "HIGH", "MEDIUM"].includes(String(w.severity || "")));
  const infoCount = warnings.length - mediumOrAbove.length;

  let status = "ok";
  let label = "Genel olarak uyumlu görünüyor";
  let color = "low";
  let summary = "Bariz bir sözleşme türü / konu / taraf tutarsızlığı yakalanmadı. Yine de imzadan önce ana bilgileri bir kez kontrol et.";

  if (mediumOrAbove.length >= 2) {
    status = "fix";
    label = "İmzadan önce düzelt";
    color = "critical";
    summary = "Sözleşme konusu, türü veya temel bilgileri tarafında birden fazla ciddi tutarsızlık/eksiklik görünüyor. Önce bunları düzeltmek daha doğru.";
  } else if (mediumOrAbove.length === 1 || infoCount >= 2) {
    status = "review";
    label = "İmzadan önce kontrol et";
    color = "medium";
    summary = "Metin genel olarak kullanılabilir görünüyor ama konu/tür/boş alan/rol gibi alanlarda yeniden gözden geçirilmesi gereken noktalar var.";
  }

  const top = warnings
    .slice()
    .sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0))
    .slice(0, 4)
    .map((w) => ({
      id: w.id || "",
      title: w.title,
      severity: w.severity,
      why: w.why,
      templates: Array.isArray(w.templates) ? w.templates : [],
    }));

  const actions = [];
  for (const w of top) {
    for (const t of (w.templates || [])) {
      if (actions.length >= 3) break;
      if (!actions.includes(t)) actions.push(t);
    }
    if (actions.length >= 3) break;
  }

  return {
    status,
    label,
    color,
    summary,
    warningCount: warnings.length,
    blockingCount: mediumOrAbove.length,
    pack,
    role,
    items: top,
    actions,
  };
}

function computeOverlapReduction({ groupedIssues, softWarnings, rulePointsById, pack }) {
  const ids = new Set((groupedIssues || []).map((it) => it.id));
  const softIds = new Set((softWarnings || []).map((w) => w.id).filter(Boolean));
  const reductions = [];
  let total = 0;

  const addReduction = (amount, reason) => {
    const n = Math.max(0, Math.round((Number(amount) || 0) * 10) / 10);
    if (!n) return;
    total += n;
    reductions.push({ amount: n, reason });
  };

  const pts = (id) => Number(rulePointsById[id] || 0);

  if (ids.has("penalty_clause") && ids.has("no_refund")) {
    addReduction(Math.min(6, pts("no_refund") * 0.45), "Cayma/ceza ile iadesiz ödeme aynı finansal riski kısmen tekrar ediyor.");
  }

  if (pack === "etkinlik" && ids.has("penalty_clause") && ids.has("cancel_deadline")) {
    addReduction(Math.min(5, pts("cancel_deadline") * 0.60), "Etkinlik sözleşmelerinde iptal tablosu + erken bildirim şartı tek paketin parçaları olabilir.");
  }

  if (ids.has("unlimited_liability") && softIds.has("liability_cap_missing")) {
    addReduction(2, "Sorumluluk limiti yok uyarısı, sınırsız sorumluluk riskinin alt başlığı gibi çalışıyor.");
  }

  if (ids.has("unlimited_liability") && ids.has("indemnity")) {
    addReduction(Math.min(6, Math.min(pts("unlimited_liability"), pts("indemnity")) * 0.35), "Sınırsız sorumluluk ve geniş tazmin kısmen aynı zarar kümesini sayıyor olabilir.");
  }

  if ((pack === "saas" || pack === "abonelik") && ids.has("auto_renew") && ids.has("cancel_deadline")) {
    addReduction(Math.min(4, pts("cancel_deadline") * 0.35), "Otomatik yenileme ile iptal süresi şartı birbirini kısmen tekrar ediyor.");
  }

  return { total, reductions };
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

  // ------------------------------------------------------------
  // Zekileştirme: bağlamdan daha iyi açıklama üret (puanı bozma)
  // ------------------------------------------------------------
  // Etkinlik sözleşmelerinde “dolaylı zarar / tazmin” ifadeleri çoğu zaman
  // davetlilerin veya senin seçtiğin üçüncü kişilerin (dekor, ses-ışık, foto vb.)
  // vereceği zararlar için sorumluluğu geniş tutan standart bir maddeye işaret eder.
  // Bu durumda kullanıcıya daha doğru ve sakin bir açıklama verelim.
  if (pack === "etkinlik") {
    for (const it of groupedIssues) {
      if (it.id !== "unlimited_liability") continue;
      const q = String(it.quote || "");
      const qFold = q.toLowerCase();
      const thirdPartyCtx = /(davetli|katılımcı|üçüncü\s*kişi|alt\s*yüklenici|taşeron|organizasyon|dekor|ses\s*-?\s*ışık|fotoğraf|video|dj|müzik|ekip|tedarikçi)/i.test(q);
      const jointLiability = /(müteselsil|müştereken)/i.test(q);
      if (thirdPartyCtx || jointLiability) {
        it.why = "Bu madde, davetlilerin veya senin seçtiğin üçüncü kişilerin vereceği zararlarda sorumluluğu geniş tutuyor. Tutar öngörüsü zor olabilir.";
        it.redLine = "Sorumluluğu sadece doğrudan ve ispatlı zararlarla sınırla; makul bir üst limit (cap) ve mümkünse sigorta/teminat şartı eklet.";
        // Pazarlık metni daha net olsun: 3. kişi bağlamı
        it.templates = [
          "Sorumluluk sadece doğrudan ve ispatlı zararlarla sınırlı olsun; dolaylı zarar/kar kaybı hariç tutulsun.",
          "Davetli/taşeron kaynaklı zararlar için makul bir üst sınır (cap) ve sigorta/teminat şartı eklenmesini rica ediyorum.",
          "Müteselsil sorumluluk varsa, sadece kendi kusurumla sınırlı olacak şekilde daraltılmasını rica ediyorum."
        ];
      }
    }
  }

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
    const ctxAdj = contextAdjust(rid, sample, pack);
    const pts = (w * mult * rm * (Number.isFinite(packAdj) ? packAdj : 1.0) * ctxAdj);
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
  // Zekice puanlama: “sınırsız sorumluluk / tazmin” gibi bir risk zaten yakalandıysa
  // ayrıca “cap yok” diye yüksek puan eklemek çoğu zaman aynı sorunu iki kere sayar.
  // Uyarıyı koruyalım ama puanı ve şiddeti düşürelim.
  const hasLiabilityRisk = groupedIssues.some(it => ["unlimited_liability", "indemnity"].includes(it.id));
  const capPoints = hasLiabilityRisk ? 2 : 10;
  softWarnings.push({
    id: "liability_cap_missing",
    title: "Sorumluluk üst limiti yazmıyor olabilir",
    severity: hasLiabilityRisk ? "MEDIUM" : "HIGH",
    category: "Belirsizlik",
    why: "Sorumluluk limiti yoksa, beklenmedik büyük tutarlar çıkabilir.",
    templates: ["Sorumluluk için üst limit (cap) iste (örn. toplam bedel kadar)."],
    points: capPoints
  });
  riskPoints += capPoints;
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

// Pack'e göre konu/tutarlılık kontrolleri (puan eklemez)
// Yanlış tür seçimi netse zaten pack_mismatch uyarısı gösterilir; yine de konu ipuçlarını göstermek faydalı olabilir.
const topicHints = detectPackTopicHints(text, pack);
if (topicHints && topicHints.length) {
  // en önemli gibi görünenler üstte çıksın
  for (let i = topicHints.length - 1; i >= 0; i--) {
    softWarnings.unshift(topicHints[i]);
  }
}

// “Sözleşme doğru mu?” kontrolleri (boş alan / rol / temel bilgiler)
// Puan eklemez; sadece uyarı üretir.
const correctnessChecks = buildCorrectnessChecks(text, pack, role);
if (correctnessChecks && correctnessChecks.length) {
  for (let i = correctnessChecks.length - 1; i >= 0; i--) {
    softWarnings.unshift(correctnessChecks[i]);
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

  const correctnessSummary = buildContractCheckSummary(softWarnings, pack, role);

  // Her risk maddesine, skoru ne kadar etkilediğini (puan) ekleyelim.
  for (const it of groupedIssues) {
    it.scorePoints = Number(rulePointsById[it.id] || 0);
  }

  const overlapReduction = computeOverlapReduction({ groupedIssues, softWarnings, rulePointsById, pack });
  if (overlapReduction.total > 0) {
    riskPoints = Math.max(0, riskPoints - overlapReduction.total);
    // Kullanıcıya açıklanabilsin diye düşülen puanı info olarak summary'ye taşıyacağız.
  }

  // Seviye hesaplaması için şiddet sayımları
  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const it of groupedIssues) severityCounts[it.severity] = (severityCounts[it.severity] || 0) + 1;

  const softCountForScore = softWarnings.filter((w) => w && w.countsForScore !== false).length;
  const riskScore = scoreFromPoints(riskPoints, pack, groupedIssues.length, softCountForScore);
  const levelInfo = getLevelFromScore(riskScore, severityCounts);

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

  // (severityCounts yukarıda hesaplandı)

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
  const scoreSoftCount = softWarnings.filter(w => w && w.countsForScore !== false && Number(w.points || 0) > 0).length;
  if (scoreSoftCount > 0) factorLines.push(`${scoreSoftCount} adet eksik/belirsiz alan sinyali skoru artırdı.`);

  const scoreExplain = {
    meaning: "Bu skor bir tehlike alarmı veya ‘imzala/imzalama’ kararı değildir. Sözleşme dilinde senin aleyhine işleyebilecek maddelerin yoğunluğunu ve şiddetini yaklaşık olarak gösterir.",
    factors: factorLines.slice(0, 3),
    topDrivers,
    withoutTopDriversScore,
    overlapReduction
  };

// Simülasyonlar (ör. Düğün/Etkinlik maliyet)
let simulation = null;
let eventMeta = null;
if (pack === "etkinlik") {
  eventMeta = extractEventMeta(text);
  const market = marketReviewForPack(pack, eventMeta);
  simulation = { event: eventMeta, market };
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
      scoreExplain,
      contractCheck: correctnessSummary
    },
    topRisks,
    issues: groupedIssues,
    softWarnings,
    simulation
  };
}

module.exports = { analyzeContract };
