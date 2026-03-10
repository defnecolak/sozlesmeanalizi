const crypto = require("crypto");
const { RULES, SEVERITY_WEIGHT, SEVERITY_RANK } = require("./rules");
const { extractEventMeta } = require("./eventSimulator");
const { marketReviewForPack } = require("./marketReview");
const { getPackProfile } = require("./packProfiles");
const { buildRedlinePlaybook, buildSubscores, buildDecisionEngine, buildWhatIfScenarios } = require("./advancedInsights");
const { buildContentEnhancements } = require("./contentEnhancements");

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
const PACK_SCORE_PROFILES = {
  genel: { factor: 1.0, gamma: 1.0, baseline: 10, mitigationCap: 8 },
  hizmet: { factor: 1.10, gamma: 1.10, baseline: 12, mitigationCap: 10 },
  influencer: { factor: 1.12, gamma: 1.10, baseline: 12, mitigationCap: 10 },
  etkinlik: { factor: 1.28, gamma: 1.48, baseline: 14, mitigationCap: 12 },
  kira: { factor: 1.18, gamma: 1.12, baseline: 14, mitigationCap: 10 },
  satis: { factor: 1.10, gamma: 1.08, baseline: 12, mitigationCap: 9 },
  saas: { factor: 1.15, gamma: 1.12, baseline: 16, mitigationCap: 10 },
  is: { factor: 1.08, gamma: 1.00, baseline: 18, mitigationCap: 8 },
  kredi: { factor: 1.12, gamma: 1.08, baseline: 14, mitigationCap: 9 },
  egitim: { factor: 1.08, gamma: 1.06, baseline: 12, mitigationCap: 9 },
  gizlilik: { factor: 1.00, gamma: 1.00, baseline: 10, mitigationCap: 7 },
  abonelik: { factor: 1.15, gamma: 1.12, baseline: 14, mitigationCap: 9 },
  arac: { factor: 1.18, gamma: 1.10, baseline: 14, mitigationCap: 9 },
  seyahat: { factor: 1.18, gamma: 1.10, baseline: 14, mitigationCap: 9 },
  sigorta: { factor: 1.20, gamma: 1.10, baseline: 14, mitigationCap: 9 },
};

function getPackScoreProfile(pack) {
  const p = String(pack || "genel").toLowerCase();
  const local = PACK_SCORE_PROFILES[p] || PACK_SCORE_PROFILES.genel;
  const shared = getPackProfile(p) || {};
  return {
    ...local,
    factor: Number.isFinite(Number(shared.factor)) ? Number(shared.factor) : local.factor,
    gamma: Number.isFinite(Number(shared.gamma)) ? Number(shared.gamma) : local.gamma,
    baseline: Number.isFinite(Number(shared.baseline)) ? Number(shared.baseline) : local.baseline,
    reviewHint: shared.reviewHint || local.reviewHint || "",
    marketLabel: shared.marketLabel || "Piyasa / Mantık Kontrolü",
    standardRuleAdjust: (shared.standardRuleAdjust && typeof shared.standardRuleAdjust === "object") ? shared.standardRuleAdjust : {}
  };
}

const SENSITIVITY_PROFILES = {
  yumusak: { id: "yumusak", label: "Yumuşak", factorMul: 1.12, gammaDelta: 0.10, baselineAdd: 2, confidenceMul: 0.96 },
  dengeli: { id: "dengeli", label: "Dengeli", factorMul: 1.0, gammaDelta: 0.0, baselineAdd: 0, confidenceMul: 1.0 },
  sert: { id: "sert", label: "Sert", factorMul: 0.92, gammaDelta: -0.08, baselineAdd: -2, confidenceMul: 1.04 },
};

function getSensitivityProfile(sensitivity) {
  const k = String(sensitivity || "dengeli").toLowerCase();
  return SENSITIVITY_PROFILES[k] || SENSITIVITY_PROFILES.dengeli;
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function detectCounterpartyContext(text, pack) {
  const t = String(text || "").toLowerCase();
  const p = String(pack || "genel").toLowerCase();

  let scale = "standart";
  let relationship = ["etkinlik", "satis", "arac", "seyahat"].includes(p) ? "tek_seferlik" : "surekli";
  const signals = [];

  const has = (arr) => (arr || []).some((x) => t.includes(String(x)));

  if (["kredi", "sigorta"].includes(p)) {
    scale = "duzenlemeli";
    signals.push("Bu sözleşme düzenlemeye tabi bir finans / sigorta ilişkisine benziyor.");
  }
  if (has(["bakanlık", "belediye", "üniversite", "ihale", "4734", "kamu"])) {
    scale = "kamu";
    signals.push("Karşı taraf kamu / ihale düzenine yakın görünüyor.");
  } else if (has(["anonim şirket", "a.ş", "holding", "kurumsal", "grup şirket", "procurement", "satın alma"])) {
    scale = scale === "duzenlemeli" ? scale : "kurumsal";
    signals.push("Karşı taraf kurumsal / süreç odaklı bir yapıya benziyor.");
  } else if (has(["butik", "atölye", "stüdyo", "mekan", "salon", "organizasyon", "restaurant", "restoran", "otel"])) {
    if (!["duzenlemeli", "kamu"].includes(scale)) scale = "butik";
    signals.push("Karşı taraf daha butik / ilişki odaklı bir yapıya benziyor.");
  }

  if (has(["otomatik yenileme", "abonelik", "aylık", "yıllık", "yenileme dönemi", "süre uzatımı"])) {
    relationship = "surekli";
  }
  if (has(["tek sefer", "bir defaya mahsus", "etkinlik tarihi", "teslim tarihi"])) {
    relationship = relationship === "surekli" ? relationship : "tek_seferlik";
  }
  if (has(["pilot çalışma", "deneme süresi", "proof of concept", "poc"])) {
    relationship = "deneme";
    signals.push("İlişki daha çok pilot / deneme fazına benziyor.");
  }

  const scaleLabelMap = {
    butik: "Butik / ilişki odaklı",
    kurumsal: "Kurumsal",
    kamu: "Kamu / ihale",
    duzenlemeli: "Düzenlemeye tabi",
    standart: "Standart",
  };
  const relationshipLabelMap = {
    tek_seferlik: "Tek seferlik",
    surekli: "Sürekli ilişki",
    deneme: "Pilot / deneme",
  };

  let summary = `${scaleLabelMap[scale] || "Standart"} karşı taraf, ${relationshipLabelMap[relationship] || "tek seferlik"} ilişki gibi görünüyor.`;
  if (scale === "butik") summary = `Karşı taraf daha butik / ilişki odaklı görünüyor; dilin nazik ama net olması daha iyi sonuç verebilir.`;
  if (scale === "kurumsal") summary = `Karşı taraf kurumsal görünüyor; ölçülebilir, kısa ve madde bazlı revize dili daha etkili olabilir.`;
  if (scale === "kamu") summary = `Karşı taraf kamu / ihale düzenine yakın görünüyor; çok net, resmi ve gerekçeli dil kullanmak daha doğru olur.`;
  if (scale === "duzenlemeli") summary = `Karşı taraf finans / sigorta gibi düzenlemeli bir alanda görünüyor; sınırları net, mali etkisi açık bir dil daha uygun olur.`;

  return {
    scale,
    scaleLabel: scaleLabelMap[scale] || "Standart",
    relationship,
    relationshipLabel: relationshipLabelMap[relationship] || "Tek seferlik",
    summary,
    signals,
  };
}

function buildActionPlan({ issues, correctness, mitigation, pack }) {
  const hard = [];
  const clarify = [];
  const good = [];

  const correctnessItems = Array.isArray(correctness?.items) ? correctness.items : [];
  correctnessItems.forEach((it) => {
    if (!it) return;
    if (["CRITICAL", "HIGH", "MEDIUM"].includes(String(it.severity || ""))) hard.push(String(it.title || ""));
    else clarify.push(String(it.title || ""));
  });

  (issues || []).slice(0, 8).forEach((it) => {
    const title = String(it?.title || "").trim();
    if (!title) return;
    if (["CRITICAL", "HIGH"].includes(String(it.severity || ""))) hard.push(title);
    else clarify.push(title);
  });

  (Array.isArray(mitigation?.reasons) ? mitigation.reasons : []).slice(0, 3).forEach((r) => {
    if (r) good.push(String(r));
  });

  const uniq = (arr, n) => {
    const seen = new Set();
    const out = [];
    arr.forEach((x) => {
      const v = String(x || "").trim();
      if (!v) return;
      const k = v.toLocaleLowerCase('tr-TR');
      if (seen.has(k)) return;
      seen.add(k);
      out.push(v);
    });
    return out.slice(0, n);
  };

  const mustFix = uniq(hard, 4);
  const shouldClarify = uniq(clarify.filter((x) => !mustFix.some((y) => y.toLocaleLowerCase('tr-TR') === x.toLocaleLowerCase('tr-TR'))), 4);
  const goodSignals = uniq(good, 3);

  let status = "İMZA ÖNCESİ KONTROL ET";
  let color = "medium";
  if (mustFix.length >= 3) { status = "ÖNCE DÜZELT"; color = "high"; }
  else if (!mustFix.length && shouldClarify.length <= 1) { status = "GENEL OLARAK UYUMLU"; color = "low"; }

  const packLabel = PACK_LABELS_TR[String(pack || "genel").toLowerCase()] || "sözleşme";
  let summary = `${packLabel} için imza öncesi en kritik adımları özetledim.`;
  if (status === "ÖNCE DÜZELT") summary = `${packLabel} metninde imza öncesi mutlaka düzeltilmesi gereken başlıklar var.`;
  if (status === "GENEL OLARAK UYUMLU") summary = `${packLabel} metni genel olarak daha dengeli görünüyor; yine de aşağıdaki son kontrolleri yap.`;

  return { status, color, summary, mustFix, shouldClarify, goodSignals };
}


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
  if (riskScore >= 78) baseRank = 3;
  else if (riskScore >= 58) baseRank = 2;
  else if (riskScore >= 32) baseRank = 1;

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
  return getPackScoreProfile(pack).factor;
}

function packGamma(pack) {
  return getPackScoreProfile(pack).gamma;
}

function packBaselinePoints(pack) {
  return getPackScoreProfile(pack).baseline;
}

function standardRuleAdjust(ruleId, pack) {
  const byRule = getPackScoreProfile(pack).standardRuleAdjust || {};
  const m = Number(byRule[String(ruleId || "")] || 1.0);
  if (!Number.isFinite(m) || m <= 0) return 1.0;
  return Math.max(0.45, Math.min(1.15, m));
}

const COMBO_RULES = [
  {
    id: "combo_cancel_stack",
    packs: ["etkinlik", "abonelik", "seyahat", "egitim"],
    allOf: ["penalty_clause", "no_refund"],
    points: 4,
    title: "İptal + iadesizlik birlikte çalışıyor",
    reason: "İptalde hem cezai şart hem de iadesizlik varsa küçük bir problem bile hızlıca mali yüke dönebilir."
  },
  {
    id: "combo_liability_stack",
    packs: ["etkinlik", "hizmet", "influencer", "saas", "satis"],
    anyOf: ["unlimited_liability", "indemnity"],
    allOf: ["subcontractor_unrestricted"],
    points: 4,
    title: "Geniş sorumluluk + üçüncü kişi riski birleşiyor",
    reason: "Üçüncü kişilerin fiilleri de geniş sorumluluk diliyle birleşince beklenmedik talepler büyüyebilir."
  },
  {
    id: "combo_collection_stack",
    packs: ["kredi", "abonelik", "hizmet", "etkinlik"],
    anyOf: ["late_interest_and_costs", "kredi_degisken_faiz"],
    anyOf2: ["attorney_fee_shift", "kredi_tahsil_masraf_avukat"],
    points: 3,
    title: "Faiz + tahsil/avukat masrafı birlikte var",
    reason: "Borç gecikirse yalnız faiz değil, tahsil ve masraf yükü de eklenebilir."
  },
  {
    id: "combo_one_sided_control",
    packs: ["hizmet", "saas", "abonelik", "influencer", "is"],
    anyOf: ["unilateral_change", "unilateral_price_increase", "assignment_unilateral"],
    anyOf2: ["terminate_without_cause", "force_majeure_broad"],
    points: 3,
    title: "Tek taraflı kontrol maddeleri birleşiyor",
    reason: "Karşı tarafa hem tek taraflı değişiklik hem de güçlü çıkış/kaçış alanı bırakılıyor olabilir."
  },
  {
    id: "combo_payment_lock",
    packs: ["hizmet", "influencer", "saas"],
    allOf: ["payment_after_approval_only", "acceptance_missing"],
    points: 3,
    title: "Onay belirsiz, ödeme kilitlenebilir",
    reason: "Ödeme onaya bağlı ve kabul süreci de muğlaksa, karşı taraf işi bitmiş olsa bile ödemeyi uzatabilir."
  },
  {
    id: "combo_credit_pressure",
    packs: ["kredi"],
    allOf: ["kredi_muacceliyet", "kredi_kefalet_muteselsil"],
    anyOf2: ["kredi_teminat_ipotek_rehin", "kredi_tahsil_masraf_avukat"],
    points: 3,
    title: "Kredide baskı katmanlı hale geliyor",
    reason: "Muacceliyet, kefalet ve teminat/tahsil masrafları birleşince küçük temerrüt büyük mali baskıya dönüşebilir."
  },
  {
    id: "combo_insurance_gap",
    packs: ["sigorta"],
    allOf: ["sigorta_genis_istisna", "sigorta_muafiyet_katilim"],
    anyOf2: ["sigorta_ihbar_suresi_kisa", "sigorta_fesih_tek_taraf"],
    points: 2,
    title: "Sigorta koruması kağıt üstünde kalabilir",
    reason: "İstisna geniş, muafiyet yüksek ve ihbar/fesih şartı sertse hasar anında beklenen koruma ciddi daralabilir."
  },
  {
    id: "combo_travel_value",
    packs: ["seyahat"],
    allOf: ["seyahat_iptal_iade_yok", "seyahat_program_degisebilir"],
    anyOf2: ["seyahat_ek_ucretler_haric", "seyahat_pasaport_vize_sorumluluk"],
    points: 2,
    title: "Seyahatte fiyat/kalite dengesi bozulabilir",
    reason: "Program değişebilirken iade zayıf ve ek ücretler açık değilse alınan hizmetin değeri düşebilir."
  },
  {
    id: "combo_education_lock",
    packs: ["egitim"],
    allOf: ["egitim_iade_yok", "egitim_program_degisebilir"],
    anyOf2: ["egitim_devamsizlik_hak_kaybi", "egitim_kurum_fesih"],
    points: 2,
    title: "Eğitimde ücret içeride kalabilir",
    reason: "Program değişikliği/iade zayıflığı ve devamsızlık veya kurum feshi birlikteyse, ödediğin bedelin karşılığı azalabilir."
  },
  {
    id: "combo_car_handover",
    packs: ["arac"],
    allOf: ["arac_hasar_deger_kaybi", "arac_depozito_iade_yok"],
    anyOf2: ["arac_sigorta_kapsam_sinirli", "arac_gps_izleme"],
    points: 2,
    title: "Araç teslim/iade anında sürpriz maliyet riski var",
    reason: "Hasar/değer kaybı, depozito ve dar sigorta koşulları birleşince araç iadesinde beklenmedik kesintiler çıkabilir."
  }
];

function computeMitigationCredits(text, pack, groupedIssues = [], softWarnings = []) {
  const profile = getPackScoreProfile(pack);
  const ids = new Set((groupedIssues || []).map((it) => String(it.id || "")));
  const s = _norm(text);
  const perc = _extractPercents(s);
  const maxPercent = perc.length ? Math.max(...perc) : null;
  const minPercent = perc.length ? Math.min(...perc) : null;
  const days = _extractDays(s);
  const maxDays = days.length ? Math.max(...days) : null;
  const minDays = days.length ? Math.min(...days) : null;
  const amounts = _extractMoneyValues(text);
  const maxAmount = amounts.length ? Math.max(...amounts) : null;

  let points = 0;
  const reasons = [];
  const add = (pts, why) => {
    const val = Number(pts || 0);
    if (val <= 0) return;
    points += val;
    if (why && reasons.length < 6) reasons.push(String(why));
  };

  const hasRisk = (...ruleIds) => ruleIds.some((id) => ids.has(id));

  // Genel dengeleyici sinyaller
  if (_hasCapLanguage(s) && hasRisk('unlimited_liability', 'indemnity', 'liability_cap_missing')) {
    add(3, 'Metinde sorumluluk için bir üst sınır/cap dili var.');
  }
  if (_excludesIndirectDamage(s) && hasRisk('unlimited_liability', 'indemnity')) {
    add(2, 'Dolaylı zarar veya kar kaybı tamamen açık bırakılmamış görünüyor.');
  }
  if (_hasFaultBasedLiability(s) && hasRisk('unlimited_liability', 'indemnity', 'subcontractor_unrestricted', 'third_party_unlimited')) {
    add(2, 'Sorumluluk kusur / ispat / doğrudan zarar diliyle daraltılmış olabilir.');
  }
  if (_hasAdvanceNotice(s) && hasRisk('terminate_without_cause', 'cancel_deadline', 'unilateral_price_increase', 'auto_renew', 'abonelik_otomatik_yenileme')) {
    add(2, 'Metinde önceden bildirim / uyarı süresi gibi yumuşatıcı sinyaller var.');
  }
  if (_hasRefundLanguage(s) && hasRisk('no_refund', 'penalty_clause', 'seyahat_iptal_iade_yok', 'egitim_iade_yok', 'abonelik_cayma_bedeli')) {
    add(3, 'İptal/iade tarafında tam kilit yerine kısmi iade / erteleme / telafi dili geçiyor.');
  }
  if (_hasObjectiveTrigger(s) && hasRisk('unilateral_change', 'unilateral_price_increase', 'kredi_degisken_faiz', 'sigorta_prim_artisi')) {
    add(2, 'Tek taraflı değişiklikler tamamen keyfi değil; objektif tetikleyicilerden söz ediliyor.');
  }
  if (_hasAny(s, ['yazılı onay', 'yazili onay', 'açık rıza', 'acik riza']) && hasRisk('subcontractor_unrestricted', 'data_sharing', 'third_party_unlimited')) {
    add(2, 'Üçüncü kişi / veri paylaşımı tarafında onay mekanizması izleri var.');
  }
  if (_hasAny(s, ['kabul edilmiş sayılır', 'kabul edilmis sayilir', 'itiraz süresi', 'itiraz suresi']) && hasRisk('payment_after_approval_only', 'acceptance_missing')) {
    add(2, 'Teslim-kabul süreci tamamen ucu açık bırakılmamış görünüyor.');
  }
  if (_hasAny(s, ['belgeli', 'makul', 'fatura karşılığı', 'fatura karsiligi', 'tek tek listelen']) && hasRisk('late_interest_and_costs', 'attorney_fee_shift', 'kredi_tahsil_masraf_avukat')) {
    add(1.5, 'Masraf / tahsil tarafında makullük ve belgelendirme sinyali var.');
  }

  // Tür bazlı piyasa normu / yumuşatma sinyalleri
  switch (String(pack || 'genel').toLowerCase()) {
    case 'etkinlik':
      if (hasRisk('penalty_clause') && maxPercent != null) {
        if (maxPercent <= 35) add(2.5, 'İptal/cayma yüzdesi etkinlik piyasasında daha makul bantta görünüyor.');
        else if (maxPercent <= 50) add(1.5, 'İptal/cayma yüzdesi sert ama aşırı uçta değil.');
      }
      if (_hasAny(s, ['erteleme', 'başka tarihe', 'baska tarihe', 'tarih değişikliği', 'tarih degisikligi', 'voucher'])) {
        add(2, 'Etkinlikte tarih kaydırma / erteleme esnekliği izi var.');
      }
      if (_hasAny(s, ['garanti kişi sayısı', 'garanti kisi sayisi']) && _hasAny(s, ['ek kişi', 'ek kisi', 'kişi başı', 'kisi basi'])) {
        add(1, 'Kişi sayısı tarafı tamamen belirsiz değil; taban ve ek kişi mantığı yazılmış.');
      }
      break;
    case 'kira':
      if (_hasAny(s, ['depozito', 'güvence bedeli', 'guvence bedeli']) && maxAmount != null && _hasAny(s, ['iade edilir', 'hasarsız teslim', 'hasarsiz teslim'])) {
        add(1.5, 'Depozito tamamen kapalı kutu değil; iade koşulu işaret edilmiş.');
      }
      if (_hasAny(s, ['tüfe', 'tufe', 'kanuni artış', 'kanuni artis']) && hasRisk('unilateral_price_increase')) {
        add(1.5, 'Kira artışı daha objektif bir endekse bağlanmış olabilir.');
      }
      break;
    case 'saas':
    case 'abonelik':
      if (_hasAny(s, ['30 gün önce', '14 gün önce', '7 gün önce', 'önceden bildirim', 'onceden bildirim']) && hasRisk('auto_renew', 'abonelik_otomatik_yenileme')) {
        add(2, 'Abonelik yenilemesi için bildirim/kaçış alanı görünüyor.');
      }
      if (_hasAny(s, ['hizmet kredisi', 'service credit', 'orantılı iade', 'pro rata'])) {
        add(2, 'Kesinti / ayıp halinde bir telafi mekanizması izleniyor.');
      }
      break;
    case 'kredi':
      if ((minDays != null && minDays >= 7) || _hasAny(s, ['ek süre', 'ek sure', 'ihtar'])) {
        add(2, 'Temerrüt öncesi ek süre / ihtar benzeri bir tampon olabilir.');
      }
      if (maxPercent != null && maxPercent <= 2.5 && hasRisk('kredi_degisken_faiz', 'late_interest_and_costs')) {
        add(1.5, 'Faiz oranı sert ama kredi belgelerinde görülen yaygın tavanlara yakın olabilir.');
      }
      if (_hasAny(s, ['borç kapanınca', 'borc kapaninca', 'rehin kaldırılır', 'rehin kaldirilir', 'fek'])) {
        add(1.5, 'Teminatın ne zaman çözüleceği tamamen belirsiz bırakılmamış.');
      }
      break;
    case 'sigorta':
      if (_hasAny(s, ['teminat kapsamı', 'teminat kapsami', 'istisnalar', 'açıkça sayılan', 'acikca sayilan'])) {
        add(1.5, 'Sigorta kapsam/istisna tarafı daha listeli görünüyor.');
      }
      if (minDays != null && minDays >= 5 && hasRisk('sigorta_ihbar_suresi_kisa')) {
        add(1.5, 'İhbar süresi en sert kısa-bantta görünmüyor.');
      }
      break;
    case 'egitim':
      if (_hasAny(s, ['telafi dersi', 'telafi', 'başka dönem', 'baska donem', 'dondurma'])) {
        add(1.5, 'Eğitimde telafi/erteleme ihtimali var.');
      }
      break;
    case 'seyahat':
      if (_hasAny(s, ['muadil', 'eşdeğer', 'esdeger', 'başka otel', 'baska otel', 'alternatif'])) {
        add(1.5, 'Seyahatte değişiklik olursa muadil çözüm arayışı izi var.');
      }
      break;
    case 'arac':
      if (_hasAny(s, ['teslim tutanağı', 'teslim tutanagi', 'fotoğrafla', 'fotografla', 'hasar tespit'])) {
        add(1.5, 'Araç teslim/iade sürecinde ispat mekanizması bulunuyor olabilir.');
      }
      if (_hasAny(s, ['kasko dahil', 'full kasko', 'mini hasar'])) {
        add(1.5, 'Sigorta/hasar tarafında koruma tamamen çıplak bırakılmamış.');
      }
      break;
    case 'gizlilik':
      if (_hasAny(s, ['kamuya açık', 'kamuya acik', 'yasal zorunluluk', 'mahkeme kararı', 'mahkeme karari'])) {
        add(1.5, 'Gizlilik istisnaları daha dengeli görünüyor.');
      }
      break;
    default:
      break;
  }

  points = _clamp(Math.round(points * 10) / 10, 0, profile.mitigationCap || 8);
  return { points, reasons };
}

function computeComboEffects(groupedIssues, pack) {
  const ids = new Set((groupedIssues || []).map((it) => String(it.id || "")));
  const p = String(pack || "genel").toLowerCase();
  const combos = [];

  const hasAny = (arr) => Array.isArray(arr) && arr.some((id) => ids.has(id));
  const hasAll = (arr) => Array.isArray(arr) && arr.every((id) => ids.has(id));

  for (const rule of COMBO_RULES.filter(Boolean)) {
    if (Array.isArray(rule.packs) && rule.packs.length && !rule.packs.includes(p)) continue;
    if (rule.allOf && !hasAll(rule.allOf)) continue;
    if (rule.anyOf && !hasAny(rule.anyOf)) continue;
    if (rule.anyOf2 && !hasAny(rule.anyOf2)) continue;

    let pts = Number(rule.points || 0);
    // Etkinlik gibi şablon maddesi bol sözleşmelerde combo puanını da bir tık yumuşat.
    if (p === "etkinlik") pts *= 0.75;
    if (p === "gizlilik") pts *= 0.7;

    combos.push({
      id: rule.id,
      title: rule.title,
      reason: rule.reason,
      points: Math.max(1, Math.round(pts * 10) / 10)
    });
  }

  return combos;
}

function buildCorrectnessSummary(softWarnings = []) {
  const corr = (softWarnings || []).filter((w) => {
    const id = String(w?.id || "");
    const cat = String(w?.category || "");
    return cat === "Tutarlılık" || id.startsWith("pack_") || id === "event_topic_mismatch" || id === "role_mismatch" || id === "placeholders" || id.startsWith("no_") || id.includes("multiple_") || id.includes("annex_") || id.startsWith("missing_core_");
  });

  if (!corr.length) {
    return {
      status: "UYUMLU",
      color: "low",
      message: "Metin temel doğruluk/tutarlılık kontrollerinden geçti. Yine de tarih, taraf ve tutarları son kez insan gözüyle kontrol et.",
      items: []
    };
  }

  const blockingIds = new Set(["pack_mismatch", "event_topic_mismatch", "placeholders"]);
  const hasBlocking = corr.some((w) => blockingIds.has(String(w.id || "")));
  const hasMediumPlus = corr.some((w) => ["CRITICAL", "HIGH", "MEDIUM"].includes(String(w.severity || "")));

  let status = "GÖZDEN GEÇİR";
  let color = "medium";
  let message = "İmza öncesi sözleşmenin konusu, taraf rolleri ve temel bilgileri bir kez daha kontrol et. Bazı doğruluk/tutarlılık uyarıları var.";

  if (hasBlocking) {
    status = "DÜZELTİLMELİ";
    color = "high";
    message = "Metinde imza öncesi düzeltilmesi gereken bariz doğruluk/tutarlılık sorunları var. Önce bunları netleştir, sonra risk skoruna bak.";
  } else if (!hasMediumPlus) {
    status = "KONTROL ET";
    color = "medium";
    message = "Büyük bir çelişki görünmüyor ama birkaç bilgi/tutarlılık detayı netleştirilmeli.";
  }

  return {
    status,
    color,
    message,
    items: corr.slice(0, 5).map((w) => ({
      title: String(w.title || ""),
      severity: String(w.severity || "LOW"),
      why: String(w.why || "")
    }))
  };
}



function buildMitigationSummary(mitigation = null) {
  const pts = Number(mitigation?.points || 0);
  const reasons = Array.isArray(mitigation?.reasons) ? mitigation.reasons.filter(Boolean) : [];
  if (!pts && !reasons.length) return null;

  let status = "DENGELEYİCİ HÜKÜM VAR";
  let color = "medium";
  let message = "Metinde riski tamamen silmese de bir miktar dengeleyen hükümler / piyasada makul sayılabilecek sinyaller var.";
  if (pts >= 6) {
    status = "KORUYUCU DİL VAR";
    color = "low";
    message = "Metinde üst sınır, iade/erteleme, ön bildirim ve objektif kriter gibi koruyucu hükümler bulunuyor. Bunlar riski yok etmez ama yorumu yumuşatır.";
  }
  return {
    status,
    color,
    points: Math.round(pts * 10) / 10,
    message,
    items: reasons.slice(0, 5).map((r) => ({ title: String(r), severity: "LOW" }))
  };
}

function buildReviewVerdict({ riskScore = 0, correctness = null, issues = [], softWarnings = [], pack = "genel", severityCounts = {}, mitigation = null } = {}) {
  const crit = Number(severityCounts.CRITICAL || 0);
  const high = Number(severityCounts.HIGH || 0);
  const corrStatus = String(correctness?.status || "");
  const mitigationPoints = Number(mitigation?.points || 0);

  let title = "Genel olarak makul görünüyor";
  let color = "low";
  let message = "Bu metin kusursuz demek değil; ama ilk bakışta imzayı tamamen durduracak kadar bariz bir mantık hatası görünmüyor.";

  if (corrStatus === "DÜZELTİLMELİ") {
    title = "Önce metni düzelt";
    color = "high";
    message = "Önce konu, taraf, boş alan veya rakam tutarsızlıklarını düzelt. Bunlar temizlenmeden risk skorunu tartışmak yanıltıcı olur.";
  } else if (riskScore >= 65 || crit >= 2 || (crit >= 1 && high >= 2)) {
    title = "İmzadan önce pazarlık et";
    color = "high";
    message = "Ticari yükü ciddi artırabilecek birkaç sert madde var. İmza atmadan önce revize istemen daha sağlıklı olur.";
  } else if (riskScore >= 35 || crit >= 1 || high >= 2 || corrStatus === "GÖZDEN GEÇİR") {
    title = "Pazarlık ederek ilerle";
    color = "medium";
    message = "Bu sözleşme tamamen kötü görünmüyor ama birkaç kritik nokta netleşmeden imzalamak gereksiz risk yaratabilir.";
  }

  if (corrStatus !== "DÜZELTİLMELİ" && mitigationPoints >= 4) {
    message += " Ayrıca metinde riski kısmen dengeleyen hükümler de var; yani en kötü senaryo gibi okunmamalı.";
    if (color === "high" && riskScore < 75) color = "medium";
  }
  if (corrStatus === "UYUMLU" && mitigationPoints >= 6 && riskScore < 35 && crit === 0 && high <= 1) {
    title = "Dengeli ama yine de pazarlık edilebilir";
    color = "low";
    message = "Sözleşme kusursuz değil ama ciddi bir dengesizlik görünmüyor. Yine de birkaç maddeyi yazılı netleştirerek daha güvenli hale getirebilirsin.";
  }

  const actionPool = [];
  const reviewHint = getPackProfile(pack)?.reviewHint;
  if (reviewHint) actionPool.push(reviewHint);
  for (const item of (correctness?.items || [])) {
    if (item?.title) actionPool.push(item.title);
  }
  for (const issue of (issues || []).slice(0, 4)) {
    const tpls = Array.isArray(issue?.templates) ? issue.templates : [];
    for (const t of tpls.slice(0, 2)) actionPool.push(String(t || ""));
  }
  const seen = new Set();
  const actions = [];
  for (const raw of actionPool) {
    const v = String(raw || '').trim();
    if (!v) continue;
    const k = v.toLocaleLowerCase('tr-TR');
    if (seen.has(k)) continue;
    seen.add(k);
    actions.push(v);
    if (actions.length >= 5) break;
  }

  return { title, color, message, actions };
}

function scoreFromPoints(points, pack, riskCount = 0, softCount = 0, comboCount = 0, sensitivity = "dengeli") {
  const pts = Math.max(0, Number(points || 0));
  const sense = getSensitivityProfile(sensitivity);
  const pf = packFactor(pack) * sense.factorMul;
  const gamma = clamp(packGamma(pack) + sense.gammaDelta, 0.88, 1.70);

  const countEff = Math.max(1, riskCount + softCount * 0.45 + comboCount * 0.7);
  const density = clamp(countEff / 8, 0.72, 1.22);

  const baseline = packBaselinePoints(pack) + sense.baselineAdd;
  const safeBaseline = Math.min(baseline, pts * 0.58);
  const adjPts = Math.max(0, pts - safeBaseline);

  const k = 56 * pf * density;
  const raw = 100 * (1 - Math.exp(-adjPts / k));

  const confidenceLiftBase = countEff <= 2 ? 0.90 : countEff <= 4 ? 0.96 : 1.0;
  const confidenceLift = clamp(confidenceLiftBase * sense.confidenceMul, 0.86, 1.06);
  const score = Math.max(0, Math.min(100, Math.round(Math.pow((raw * confidenceLift) / 100, gamma) * 100)));
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

function _extractDays(t) {
  const s = _norm(t);
  const out = [];
  let m;
  const r = /(\d{1,3})\s*g[uü]n/g;
  while ((m = r.exec(s))) out.push(Number(m[1]));
  return out.filter((n) => Number.isFinite(n) && n >= 0 && n <= 365);
}

function _extractMoneyValues(t) {
  const s = String(t || "");
  const out = [];
  let m;
  const r = /(\d{1,3}(?:[\. ]\d{3})*(?:,\d{2})?)\s*(€|eur|tl|₺|usd|\$)/gi;
  while ((m = r.exec(s))) {
    const raw = m[1].replace(/ /g, "").replace(/\./g, "").replace(",", ".");
    const val = Number(raw);
    if (Number.isFinite(val)) out.push(val);
  }
  return out;
}

function _clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n)));
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

function _hasAdvanceNotice(t) {
  return _hasAny(t, [
    "önceden bildirim",
    "onceden bildirim",
    "önceden haber",
    "yazılı bildirim",
    "yazili bildirim",
    "en az",
    "hatırlatma",
    "hatirlatma",
    "ön bildirim",
    "on bildirim",
  ]);
}

function _hasTerminationRight(t) {
  return _hasAny(t, [
    "feshedebilir",
    "fesih hakkı",
    "fesih hakki",
    "iptal edebilir",
    "sonlandırabilir",
    "sonlandirabilir",
    "cayma hakkı",
    "cayma hakki",
    "terminate",
    "cancel",
  ]);
}

function _hasObjectiveTrigger(t) {
  return _hasAny(t, [
    "mevzuat",
    "kanun",
    "vergi",
    "kur",
    "endeks",
    "tüfe",
    "tufe",
    "üfe",
    "ufe",
    "maliyet artışı",
    "maliyet artisi",
    "objektif",
    "haklı sebep",
    "hakli sebep",
  ]);
}

function _hasRefundLanguage(t) {
  return _hasAny(t, [
    "iade edilir",
    "iade edilir.",
    "kısmi iade",
    "kismi iade",
    "orantılı iade",
    "orantili iade",
    "pro rata",
    "tarih değişikliği",
    "tarih degisikligi",
    "erteleme",
    "başka tarihe",
    "baska tarihe",
    "voucher",
  ]);
}

function _hasMutualLanguage(t) {
  return _hasAny(t, [
    "karşılıklı",
    "karsilikli",
    "her iki taraf",
    "taraflar",
    "mutual",
  ]);
}

function _hasFaultBasedLiability(t) {
  return _hasAny(t, [
    "kusuru oranında",
    "kusuru oraninda",
    "kendi kusuru",
    "ağır kusur",
    "agir kusur",
    "kast",
    "ispatlanırsa",
    "ispatlanirsa",
    "doğrudan zarar",
    "dogrudan zarar",
  ]);
}

function _hasDataLimits(t) {
  return _hasAny(t, [
    "açık rıza",
    "acik riza",
    "anonim",
    "anonimle",
    "amaçla sınırlı",
    "amacla sinirli",
    "saklama süresi",
    "saklama suresi",
    "kvkk",
    "gdpr",
    "veri minimizasyon",
    "purpose limitation",
  ]);
}

function _extractDurationMonths(t) {
  const s = _norm(t);
  let m = s.match(/(\d{1,2})\s*(ay|month)s?/);
  if (m) return Number(m[1]);
  m = s.match(/(\d{1,2})\s*(yıl|yil|year)s?/);
  if (m) return Number(m[1]) * 12;
  return null;
}

function contextAdjust(ruleId, sample, pack) {
  const p = _norm(pack);
  const quote = _norm((sample && (sample.quoteFull || sample.quote || sample.snippet)) || "");
  if (!quote) return 1.0;

  let m = 1.0;
  const hasCap = _hasCapLanguage(quote);
  const hasExit = _hasTerminationRight(quote);
  const hasNotice = _hasAdvanceNotice(quote);
  const hasObjective = _hasObjectiveTrigger(quote);
  const hasRefund = _hasRefundLanguage(quote);
  const hasMutual = _hasMutualLanguage(quote);
  const hasFault = _hasFaultBasedLiability(quote);
  const hasDataLimits = _hasDataLimits(quote);
  const durMonths = _extractDurationMonths(quote);
  const days = _extractDays(quote);
  const minDays = days.length ? Math.min(...days) : null;
  const perc = _extractPercents(quote);
  const maxPercent = perc.length ? Math.max(...perc) : null;
  const hasConsent = _hasAny(quote, ["yazılı onay", "yazili onay", "açık rıza", "acik riza", "onay", "rıza", "riza"]);
  const hasEquivalent = _hasAny(quote, ["eşdeğer", "esdeger", "muadil", "denk hizmet", "aynı nitelikte", "ayni nitelikte", "muadil program", "muadil eğitmen", "muadil egitmen"]);
  const hasGrace = _hasAny(quote, ["ek süre", "ek sure", "makul süre", "makul sure", "ihtar", "ihbar", "uyarı", "uyari", "temerrüt ihtarı", "temerrut ihtari"]);
  const hasItemized = _hasAny(quote, ["tek tek listelen", "açıkça belirtilen", "acikca belirtilen", "ayrı ayrı", "ayri ayri", "belgeli", "makul"]);
  const hasSecurityPurpose = _hasAny(quote, ["güvenlik", "guvenlik", "çalıntı", "calinti", "hasar tespiti", "teslim güvenliği", "teslim guvenligi"]);
  const hasRelease = _hasAny(quote, ["borç kapanınca", "borc kapaninca", "borcun kapanması halinde", "rehin kaldırılır", "rehin kaldirilir", "fek", "teminat iadesi"]);

  if (p === "etkinlik") {
    if (ruleId === "unlimited_liability") {
      m *= 0.72;
      if (hasCap) m *= 0.65;
      if (_excludesIndirectDamage(quote)) m *= 0.70;
      if (hasFault) m *= 0.82;
    }
    if (ruleId === "penalty_clause") {
      m *= 0.85;
      if (maxPercent != null) {
        if (maxPercent <= 20) m *= 0.65;
        else if (maxPercent <= 35) m *= 0.80;
        else if (maxPercent <= 50) m *= 0.90;
      }
    }
    if (["third_party_unlimited", "subcontractor_unrestricted"].includes(ruleId)) {
      m *= 0.80;
      if (hasConsent) m *= 0.85;
    }
  }

  switch (ruleId) {
    case "unlimited_liability":
    case "indemnity":
      if (hasCap) m *= 0.65;
      if (_excludesIndirectDamage(quote)) m *= 0.70;
      if (hasFault) m *= 0.82;
      if (hasMutual) m *= 0.92;
      break;

    case "penalty_clause":
    case "no_refund":
    case "cancel_deadline":
    case "abonelik_cayma_bedeli":
    case "seyahat_iptal_iade_yok":
    case "egitim_iade_yok":
    case "arac_depozito_iade_yok":
      if (maxPercent != null) {
        if (maxPercent <= 10) m *= 0.62;
        else if (maxPercent <= 20) m *= 0.75;
        else if (maxPercent <= 35) m *= 0.88;
        else if (maxPercent <= 50) m *= 0.96;
      }
      if (hasRefund) m *= 0.78;
      if (_hasAny(quote, ["erteleme", "reschedule", "başka tarihe", "baska tarihe", "voucher", "transfer hakkı", "transfer hakki"])) m *= 0.86;
      if (hasMutual) m *= 0.92;
      break;

    case "terminate_without_cause":
    case "force_majeure_broad":
    case "egitim_kurum_fesih":
    case "sigorta_fesih_tek_taraf":
      if (hasNotice || hasGrace || (minDays != null && minDays >= 3)) m *= 0.82;
      if (hasRefund || hasExit) m *= 0.84;
      if (hasObjective) m *= 0.88;
      if (_hasAny(quote, ["tamamlanan iş", "tamamlanan is", "hakediş", "hak edis", "oransal iade", "pro rata"])) m *= 0.84;
      break;

    case "unilateral_change":
    case "unilateral_price_increase":
    case "assignment_unilateral":
    case "abonelik_fiyat_tek_taraf":
    case "sigorta_prim_artisi":
    case "kredi_degisken_faiz":
      if (hasNotice) m *= 0.86;
      if (hasExit) m *= 0.82;
      if (hasObjective) m *= 0.80;
      if (hasMutual) m *= 0.92;
      break;

    case "auto_renew":
    case "abonelik_otomatik_yenileme":
      if (hasNotice) m *= 0.82;
      if (hasExit) m *= 0.78;
      if (_hasAny(quote, ["hatırlatma", "hatirlatma", "e-posta ile iptal", "eposta ile iptal"])) m *= 0.82;
      break;

    case "data_sharing":
    case "broad_confidentiality":
      if (hasDataLimits) m *= 0.65;
      if (hasConsent) m *= 0.85;
      if (_hasAny(quote, ["kamuya açık", "kamuya acik", "public domain", "halihazırda bilinen", "halihazirda bilinen", "yasal zorunluluk", "mahkeme kararı", "mahkeme karari"])) {
        m *= 0.74;
      }
      break;

    case "non_compete":
      if (durMonths && durMonths <= 12) m *= 0.78;
      if (_hasAny(quote, ["coğrafi", "cografi", "bölge", "bolge", "şehir", "sehir", "faaliyet alanı", "faaliyet alani", "scope"])) m *= 0.86;
      break;

    case "payment_after_approval_only":
    case "acceptance_missing":
      if (_hasAny(quote, ["teslimden itibaren", "gün içinde", "gun icinde", "days", "iş günü", "is gunu"])) m *= 0.85;
      if (_hasAny(quote, ["kabul edilmiş sayılır", "kabul edilmis sayilir", "deemed accepted", "aksi halde kabul"])) m *= 0.65;
      if (hasGrace) m *= 0.90;
      break;

    case "late_interest_and_costs":
    case "attorney_fee_shift":
    case "kredi_tahsil_masraf_avukat":
      if (hasItemized) m *= 0.72;
      if (maxPercent != null) {
        if (maxPercent <= 1.0) m *= 0.72;
        else if (maxPercent <= 2.0) m *= 0.84;
      }
      break;

    case "subcontractor_unrestricted":
    case "third_party_unlimited":
      if (hasConsent) m *= 0.82;
      if (hasFault) m *= 0.80;
      break;

    case "kredi_muacceliyet":
      if (hasGrace || hasNotice || (minDays != null && minDays >= 7)) m *= 0.80;
      if (_hasAny(quote, ["iki taksit", "2 taksit", "ardışık", "ardisik", "iki dönem", "2 dönem"])) m *= 0.82;
      break;

    case "kredi_kefalet_muteselsil":
      if (hasCap || _hasAny(quote, ["azami tutar", "belirli tutar", "belirli süre", "belirli sure"])) m *= 0.82;
      break;

    case "kredi_teminat_ipotek_rehin":
      if (hasRelease) m *= 0.84;
      break;

    case "sigorta_genis_istisna":
      if (hasItemized || _hasAny(quote, ["sınırlı sayıda", "sinirli sayida", "açıkça listelen", "acikca listelen"])) m *= 0.84;
      break;

    case "sigorta_ihbar_suresi_kisa":
      if (minDays != null) {
        if (minDays >= 10) m *= 0.70;
        else if (minDays >= 5) m *= 0.82;
      }
      break;

    case "sigorta_muafiyet_katilim":
      if (maxPercent != null) {
        if (maxPercent <= 5) m *= 0.72;
        else if (maxPercent <= 10) m *= 0.85;
      }
      break;

    case "as_is_no_warranty":
      if (_hasAny(quote, ["garanti kapsamında", "garanti kapsaminda", "düzeltme", "duzeltme", "iade", "onarım", "onarim"])) m *= 0.82;
      break;

    case "arac_km_limit_asim":
      if (_hasAny(quote, ["aylık 3000 km", "aylik 3000 km", "yıllık 30000 km", "yillik 30000 km"])) m *= 0.82;
      break;

    case "arac_gps_izleme":
      if (hasConsent || hasSecurityPurpose) m *= 0.84;
      break;

    case "arac_sigorta_kapsam_sinirli":
      if (_hasAny(quote, ["kasko dahil", "full kasko", "mini hasar", "muafiyet yok", "ikame araç", "ikame arac"])) m *= 0.80;
      break;

    case "seyahat_program_degisebilir":
      if (hasEquivalent || hasRefund) m *= 0.80;
      break;

    case "seyahat_ek_ucretler_haric":
      if (hasItemized) m *= 0.84;
      break;

    case "seyahat_pasaport_vize_sorumluluk":
      if (_hasAny(quote, ["acikca bilgilendirme", "açıkça bilgilendirme", "gerekli belgeler listesi", "kontrol listesi"])) m *= 0.88;
      break;

    case "egitim_program_degisebilir":
      if (hasEquivalent || hasRefund) m *= 0.82;
      break;

    case "egitim_devamsizlik_hak_kaybi":
      if ((maxPercent != null && maxPercent <= 20) || _hasAny(quote, ["telafi", "make-up", "ek ders"])) m *= 0.84;
      break;

    default:
      break;
  }

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

const PACK_ESSENTIAL_GROUPS = {
  etkinlik: [
    { label: "tarih/saat", re: /(etkinlik\s+tarihi|organizasyon\s+tarihi|düğün\s+tarihi|dugun\s+tarihi|saat|başlangıç|baslangic|bitiş|bitis)/i },
    { label: "kişi sayısı", re: /(kişi\s+sayısı|kisi\s+sayisi|davetli|garanti\s+kişi|garanti\s+kisi)/i },
    { label: "ödeme", re: /(ödeme|odeme|kapora|depozito|bedel|tutar)/i },
    { label: "iptal/iade", re: /(iptal|cayma|iade|cezai\s+şart|cezai\s+sart)/i },
  ],
  kira: [
    { label: "kira bedeli", re: /(kira\s+bedeli|aylık\s+kira|aylik\s+kira)/i },
    { label: "depozito", re: /(depozito|güvence|guvence)/i },
    { label: "teslim/tahliye", re: /(teslim|tahliye|boşaltma|bosaltma)/i },
  ],
  satis: [
    { label: "satış bedeli", re: /(satış\s+bedeli|satis\s+bedeli|toplam\s+bedel)/i },
    { label: "teslim", re: /(teslim|nakliye|sevkiyat)/i },
    { label: "ayıp/garanti", re: /(ayıp|ayip|garanti|iade)/i },
  ],
  hizmet: [
    { label: "kapsam", re: /(kapsam|işin\s+tanımı|isin\s+tanimi|hizmet\s+tanımı|hizmet\s+tanimi)/i },
    { label: "teslim/revizyon", re: /(teslim|revizyon|onay|kabul)/i },
    { label: "ücret", re: /(ücret|ucret|bedel|ödeme|odeme)/i },
  ],
  influencer: [
    { label: "içerik/teslim", re: /(post|story|reel|içerik|icerik|yayın|yayin|teslim)/i },
    { label: "ücret", re: /(ücret|ucret|bedel|ödeme|odeme|sponsor)/i },
    { label: "kullanım hakkı", re: /(lisans|reklam\s+kullanımı|reklam\s+kullanimi|portföy|portfoy|telif)/i },
  ],
  saas: [
    { label: "plan/fiyat", re: /(plan|paket|abonelik|fiyat|ücret|ucret)/i },
    { label: "veri/gizlilik", re: /(veri|gizlilik|kvkk|gdpr)/i },
    { label: "fesih/iptal", re: /(fesih|iptal|sonlandırma|sonlandirma|cayma)/i },
  ],
  abonelik: [
    { label: "ücret", re: /(ücret|ucret|fatura|ödeme|odeme)/i },
    { label: "yenileme/iptal", re: /(yenileme|iptal|cayma|sonlandırma|sonlandirma)/i },
    { label: "süre", re: /(süre|sure|aylık|aylik|yıllık|yillik)/i },
  ],
  is: [
    { label: "ücret", re: /(maaş|maas|ücret|ucret|bordro)/i },
    { label: "çalışma", re: /(çalışma\s+süresi|calisma\s+suresi|mesai|haftalık\s+saat|haftalik\s+saat)/i },
    { label: "izin/fesih", re: /(izin|fesih|ihbar|kıdem|kidem)/i },
  ],
  kredi: [
    { label: "vade/taksit", re: /(vade|taksit|ödeme\s+planı|odeme\s+plani)/i },
    { label: "faiz", re: /(faiz|temerrüt|temerrut|oran)/i },
    { label: "teminat", re: /(kefil|ipotek|rehin|teminat)/i },
  ],
  egitim: [
    { label: "program", re: /(program|ders|modül|modul|eğitim|egitim)/i },
    { label: "ücret", re: /(ücret|ucret|kayıt\s+ücreti|kayit\s+ucreti|ödeme|odeme)/i },
    { label: "iptal/devamsızlık", re: /(iptal|iade|devamsızlık|devamsizlik|hak\s+kaybı|hak\s+kaybi)/i },
  ],
  gizlilik: [
    { label: "gizli bilgi", re: /(gizli\s+bilgi|confidential)/i },
    { label: "istisnalar", re: /(kamuya\s+açık|kamuya\s+acik|yasal\s+zorunluluk|public\s+domain)/i },
    { label: "süre", re: /(süre|sure|yıl|yil|ay)/i },
  ],
  arac: [
    { label: "araç bilgileri", re: /(plaka|şasi|sasi|km|kilometre|ruhsat)/i },
    { label: "teslim/iade", re: /(teslim|iade|yakıt|yakit)/i },
    { label: "hasar/sigorta", re: /(hasar|kasko|sigorta|muafiyet)/i },
  ],
  seyahat: [
    { label: "program/otel", re: /(program|otel|konaklama|uçuş|ucus|transfer)/i },
    { label: "ücret", re: /(ücret|ucret|ödeme|odeme|bedel)/i },
    { label: "iptal/iade", re: /(iptal|iade|cayma|voucher)/i },
  ],
  sigorta: [
    { label: "teminat", re: /(teminat|kapsam|risk)/i },
    { label: "prim", re: /(prim|ödeme|odeme)/i },
    { label: "hasar/ihbar", re: /(hasar|ihbar|muafiyet|tazminat)/i },
  ],
};

function detectReferencedAnnexes(text) {
  const t = String(text || "");
  const folded = foldTR(t);
  const refs = [];
  const ekMatches = t.match(/(EK|Ek)\s*[-–]?\s*\d+/g) || [];
  if (ekMatches.length) refs.push(...ekMatches.slice(0, 4));

  const refWords = [
    ["menü", "menu"],
    ["tarife", "price list"],
    ["ekli liste", "liste"],
    ["şartname", "sartname"],
    ["teknik şartname", "teknik sartname"],
    ["program", "itinerary"],
    ["özel şart", "ozel sart"],
    ["özel koşul", "ozel kosul"],
  ];
  for (const pair of refWords) {
    if (pair.some((w) => folded.includes(foldTR(w)))) refs.push(pair[0]);
  }

  const uniq = Array.from(new Set(refs));
  if (!uniq.length) return null;
  return {
    id: "annex_reference_check",
    title: "Ek / liste / şartname referanslarını kontrol et",
    severity: "LOW",
    category: "Tutarlılık",
    why: `Metinde ${uniq.slice(0, 4).join(", ")} gibi ek/liste referansları var. İmza öncesi bu eklerin gerçekten sözleşme dosyasında bulunduğunu ve final sürümle uyumlu olduğunu kontrol et.`,
    templates: [
      "Metinde anılan tüm ekler (menü, tarife, liste, şartname, program vb.) dosyada yer alsın.",
      "Eklerin tarih/sürüm ve fiyat bilgilerinin ana sözleşmeyle uyumlu olduğundan emin ol.",
    ],
    points: 0,
    countsForScore: false,
  };
}

function detectMissingCoreSections(text, pack) {
  const defs = PACK_ESSENTIAL_GROUPS[String(pack || "").toLowerCase()];
  if (!defs || !defs.length) return [];
  const missing = defs.filter((d) => !d.re.test(String(text || ""))).map((d) => d.label);
  if (missing.length < 2) return [];
  return [{
    id: `missing_core_${pack}`,
    title: "Bazı temel sözleşme başlıkları eksik veya zayıf görünüyor",
    severity: missing.length >= 3 ? "MEDIUM" : "LOW",
    category: "Tutarlılık",
    why: `Bu tür sözleşmelerde kritik olan şu başlıklar metinde zayıf görünüyor: ${missing.join(", ")}. Metin eksik çıkarılmış olabilir; yine de imza öncesi bunları tek tek doğrulamak iyi olur.`,
    templates: ["Eksik görünen başlıkları sözleşmeye net şekilde eklet veya ilgili maddeleri teyit et."],
    points: 0,
    countsForScore: false,
  }];
}

function extractDistinctIbans(text) {
  const t = String(text || "");
  const matches = t.match(/TR\d{2}(?:\s?\d{4}){5}\s?\d{2}/gim) || [];
  const norm = matches.map((x) => x.replace(/\s+/g, "").toUpperCase());
  return Array.from(new Set(norm));
}

function normalizeCurrencyHint(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return null;
  if (s === "₺" || s === "TL" || s === "TRY") return "TRY";
  if (s === "€" || s === "EUR" || s === "EURO") return "EUR";
  if (s === "$" || s === "USD") return "USD";
  if (s === "£" || s === "GBP" || s === "STERLIN") return "GBP";
  return null;
}

function detectCurrencyHint(text) {
  const t = String(text || "");
  const m = t.match(/(?:^|[\s:(-])(TL|TRY|EUR|EURO|USD|GBP|STERLIN)(?=\s|$|[:)\-])|([₺€$£])/i);
  if (!m) return null;
  return normalizeCurrencyHint(m[1] || m[2]);
}

function extractIbanEntries(text) {
  const t = String(text || "");
  const distinct = extractDistinctIbans(t);
  if (!distinct.length) return [];

  const entries = new Map();
  distinct.forEach((iban) => {
    entries.set(iban, { iban, currency: null, contexts: [] });
  });

  const assign = (iban, currency, context) => {
    const key = String(iban || "").replace(/\s+/g, "").toUpperCase();
    const item = entries.get(key);
    if (!item) return;
    if (currency && !item.currency) item.currency = currency;
    const snippet = String(context || "").replace(/\s+/g, " ").trim();
    if (snippet && !item.contexts.includes(snippet) && item.contexts.length < 2) {
      item.contexts.push(snippet);
    }
  };

  const labeledRe = /(TL|TRY|EUR|EURO|USD|GBP|STERLIN|[₺€$£])\s*IBAN[^\n\rA-Z0-9]{0,20}(TR\d{2}(?:\s?\d{4}){5}\s?\d{2})/gim;
  let m;
  while ((m = labeledRe.exec(t))) {
    assign(m[2], normalizeCurrencyHint(m[1]), m[0]);
  }

  const lines = t.split(/\r?\n/);
  const ibanRe = /TR\d{2}(?:\s?\d{4}){5}\s?\d{2}/gim;
  for (let i = 0; i < lines.length; i += 1) {
    const prev = lines[i - 1] || "";
    const cur = lines[i] || "";
    const next = lines[i + 1] || "";
    const window = `${prev} ${cur} ${next}`.trim();
    const ibans = window.match(ibanRe) || [];
    if (!ibans.length) continue;
    const currency = detectCurrencyHint(`${prev} ${cur}`) || detectCurrencyHint(`${cur} ${next}`) || detectCurrencyHint(window);
    ibans.forEach((iban) => assign(iban, currency, window));
  }

  return Array.from(entries.values());
}

function buildIbanConsistencyWarning(text) {
  const entries = extractIbanEntries(text);
  if (entries.length < 2) return null;

  const unlabeled = entries.filter((x) => !x.currency);
  const byCurrency = new Map();
  for (const item of entries) {
    if (!item.currency) continue;
    if (!byCurrency.has(item.currency)) byCurrency.set(item.currency, new Set());
    byCurrency.get(item.currency).add(item.iban);
  }

  const labeledCount = Array.from(byCurrency.values()).reduce((sum, set) => sum + set.size, 0);
  const allDistinctCurrencies = labeledCount === entries.length && Array.from(byCurrency.values()).every((set) => set.size === 1);
  if (!unlabeled.length && allDistinctCurrencies) {
    return null;
  }

  const duplicateCurrencies = Array.from(byCurrency.entries())
    .filter(([, set]) => set.size >= 2)
    .map(([currency]) => currency);

  if (duplicateCurrencies.length) {
    const label = duplicateCurrencies.join(", ");
    return {
      id: "multiple_iban",
      title: "Aynı para birimi için birden fazla IBAN görünüyor",
      severity: "MEDIUM",
      category: "Tutarlılık",
      why: `Metinde ${label} için birden fazla farklı IBAN yakaladım. Kur hesabı ayrı olabilir; yine de aynı para biriminde hangi hesabın geçerli olduğu yazılı ve net olmalı.`,
      templates: ["Aynı para birimi için tek geçerli IBAN açıkça yazılsın; alternatif hesap varsa hangi durumda kullanılacağı netleştirilsin."],
      points: 0,
      countsForScore: false,
    };
  }

  return {
    id: "multiple_iban",
    title: "Birden fazla IBAN görünüyor",
    severity: "MEDIUM",
    category: "Tutarlılık",
    why: "Metinde birden fazla IBAN yakaladım. Bunlar farklı para birimlerine ait olabilir; yine de hangi hesabın hangi para birimi / senaryo için geçerli olduğu yazılı ve resmi olarak doğrulanmalı.",
    templates: ["Ödeme yapılacak IBAN ve para birimi eşleşmesi açıkça yazılsın; alternatif hesap varsa hangi durumda kullanılacağı son sürümde teyit edilsin."],
    points: 0,
    countsForScore: false,
  };
}

function extractLabeledTotals(text) {
  const t = String(text || "");
  const out = [];
  const re = /(toplam\s+(?:bedel|tutar)|sözleşme\s+bedeli|sozlesme\s+bedeli|hizmet\s+bedeli|satış\s+bedeli|satis\s+bedeli|kira\s+bedeli)[^\n\r0-9]{0,30}(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)\s*(₺|TL|TRY|€|EUR|USD|\$)/gim;
  let m;
  while ((m = re.exec(t))) {
    const amount = `${String(m[2]).replace(/\s+/g, "")}_${String(m[3]).toUpperCase()}`;
    out.push({ label: m[1], value: amount });
  }
  return out;
}

function extractLabeledDeposits(text) {
  const t = String(text || "");
  const out = [];
  const re = /(kapora|depozito|ön\s+ödeme|on\s+odeme|peşinat|pesinat|cayma\s+bedeli)[^\n\r0-9]{0,30}(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)\s*(₺|TL|TRY|€|EUR|USD|\$)/gim;
  let m;
  while ((m = re.exec(t))) {
    const amount = `${String(m[2]).replace(/\s+/g, "")}_${String(m[3]).toUpperCase()}`;
    out.push({ label: m[1], value: amount });
  }
  return out;
}

function extractLabeledGuestCounts(text) {
  const t = String(text || "");
  const out = [];
  const re = /(garanti\s+kişi\s+sayısı|garanti\s+kisi\s+sayisi|garanti\s+davetli\s+sayısı|minimum\s+kişi\s+sayısı|minimum\s+kisi\s+sayisi)[^\n\r\d]{0,20}(\d{1,4})/gim;
  let m;
  while ((m = re.exec(t))) out.push({ label: m[1], value: m[2] });
  return out;
}

function extractLabeledDates(text, pack) {
  const t = String(text || "");
  const labelsByPack = {
    etkinlik: /(etkinlik\s+tarihi|organizasyon\s+tarihi|düğün\s+tarihi|dugun\s+tarihi|rezervasyon\s+tarihi)/i,
    seyahat: /(tur\s+tarihi|hareket\s+tarihi|uçuş\s+tarihi|ucus\s+tarihi|check-?in)/i,
    egitim: /(eğitim\s+tarihi|egitim\s+tarihi|başlangıç\s+tarihi|baslangic\s+tarihi|ders\s+tarihi)/i,
  };
  const lbl = labelsByPack[String(pack || "").toLowerCase()];
  if (!lbl) return [];
  const lines = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  const dateRe = /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s*(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\s*\d{2,4})/i;
  for (const line of lines) {
    if (!lbl.test(line)) continue;
    const m = line.match(dateRe);
    if (m) out.push(m[1].toLowerCase());
  }
  return Array.from(new Set(out));
}

function detectStructuredContradictions(text, pack) {
  const out = [];
  const ibanWarning = buildIbanConsistencyWarning(text);
  if (ibanWarning) out.push(ibanWarning);

  const totals = extractLabeledTotals(text);
  const distinctTotals = Array.from(new Set(totals.map((x) => x.value)));
  if (distinctTotals.length >= 2) {
    out.push({
      id: "multiple_total_amounts",
      title: "Toplam bedel birden fazla farklı tutarla geçiyor olabilir",
      severity: "MEDIUM",
      category: "Tutarlılık",
      why: "Metinde ‘toplam/sözleşme bedeli’ etiketine yakın birden fazla farklı tutar gördüm. Bu bir kur/TL karşılığı olabilir; yine de hangi rakamın bağlayıcı olduğu net yazılmalı.",
      templates: ["Toplam bedel tek bir para birimi ve tek bir rakamla açıkça yazılsın; kur dönüşümü varsa hangi tarihe göre olduğu belirtilsin."],
      points: 0,
      countsForScore: false,
    });
  }

  const deposits = extractLabeledDeposits(text);
  const distinctDeposits = Array.from(new Set(deposits.map((x) => x.value)));
  if (distinctDeposits.length >= 2) {
    out.push({
      id: "multiple_deposit_amounts",
      title: "Kapora / ön ödeme tutarı birden fazla farklı görünüyor",
      severity: "LOW",
      category: "Tutarlılık",
      why: "Metinde kapora/depozito/ön ödeme için birden fazla farklı tutar gördüm. Bunun taksit planı mı yoksa taslak çelişkisi mi olduğu netleştirilmeli.",
      templates: ["Kapora/depozito/ön ödeme kalemleri ayrı ayrı ve tutarlı şekilde yazılsın."],
      points: 0,
      countsForScore: false,
    });
  }

  const guestCounts = extractLabeledGuestCounts(text);
  const distinctGuests = Array.from(new Set(guestCounts.map((x) => x.value)));
  if (String(pack || "") === "etkinlik" && distinctGuests.length >= 2) {
    out.push({
      id: "multiple_guest_counts",
      title: "Garanti kişi sayısı birden fazla farklı görünüyor",
      severity: "MEDIUM",
      category: "Tutarlılık",
      why: "Metinde garanti kişi sayısı için birden fazla farklı sayı yakaladım. Etkinlik sözleşmelerinde bu sayı fiyatı doğrudan etkiler; tek net sayı bırakılmalı.",
      templates: ["Garanti kişi sayısı tek ve net şekilde yazılsın; aşağı/yukarı revize kuralı ayrıca belirtilsin."],
      points: 0,
      countsForScore: false,
    });
  }

  const labeledDates = extractLabeledDates(text, pack);
  if (labeledDates.length >= 2) {
    out.push({
      id: "multiple_key_dates",
      title: "Ana tarih alanlarında birden fazla farklı tarih görünüyor",
      severity: "LOW",
      category: "Tutarlılık",
      why: "Metinde aynı tür ana tarih alanına yakın birden fazla farklı tarih yakaladım. Biri taslak/eski tarih olabilir; imza öncesi doğru tarih netleştirilsin.",
      templates: ["Etkinlik/tur/eğitim tarihi tek ve tutarlı olsun; eski taslak tarihleri temizlensin."],
      points: 0,
      countsForScore: false,
    });
  }

  return out;
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
  const annexWarn = detectReferencedAnnexes(t);
  if (annexWarn) out.push(annexWarn);
  out.push(...detectMissingCoreSections(t, pack));
  out.push(...detectStructuredContradictions(t, pack));

  // Bilgi amaçlı: yakalanırsa ileride farklı türler için de kullanılabilir.
  void extractSubjectSnippet(t);

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
    const stdAdj = standardRuleAdjust(rid, pack);
    const pts = (w * mult * rm * (Number.isFinite(packAdj) ? packAdj : 1.0) * ctxAdj * stdAdj);
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

  // Her risk maddesine, skoru ne kadar etkilediğini (puan) ekleyelim.
  for (const it of groupedIssues) {
    it.scorePoints = Number(rulePointsById[it.id] || 0);
  }

  // Kombinasyon etkileri: bazı maddeler tek tek değil, birlikte daha önemlidir.
  const comboEffects = computeComboEffects(groupedIssues, pack);
  const comboPoints = comboEffects.reduce((acc, c) => acc + Number(c.points || 0), 0);
  riskPoints += comboPoints;

  // Metindeki dengeleyici / piyasada makul kabul edilebilen sinyaller varsa
  // bunları ayrı not edip toplam puanı biraz yumuşatıyoruz.
  const mitigation = computeMitigationCredits(text, pack, groupedIssues, softWarnings);
  if (mitigation.points > 0) {
    riskPoints = Math.max(0, riskPoints - mitigation.points);
  }

  // Seviye hesaplaması için şiddet sayımları
  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const it of groupedIssues) severityCounts[it.severity] = (severityCounts[it.severity] || 0) + 1;

  const softCountForScore = softWarnings.filter((w) => w && w.countsForScore !== false).length;
  const riskScore = scoreFromPoints(riskPoints, pack, groupedIssues.length, softCountForScore, comboEffects.length, opts.sensitivity);
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
  const withoutTopDriversScore = scoreFromPoints(Math.max(0, riskPoints - topDriverSumRaw), pack, Math.max(0, groupedIssues.length - Math.min(3, topDrivers.length)), softCountForScore, Math.max(0, comboEffects.length - 1), opts.sensitivity);

  const critHigh = (severityCounts.CRITICAL || 0) + (severityCounts.HIGH || 0);
  const factorLines = [];
  if (critHigh > 0) factorLines.push(`${critHigh} adet kritik/yüksek risk sinyali bulundu.`);
  if (topDrivers.length) factorLines.push(`Skoru en çok artıran maddeler: ${topDrivers.map(d => d.title).join(" • ")}.`);
  const scoreSoftCount = softWarnings.filter(w => w && w.countsForScore !== false && Number(w.points || 0) > 0).length;
  if (scoreSoftCount > 0) factorLines.push(`${scoreSoftCount} adet eksik/belirsiz alan sinyali skoru artırdı.`);

  if (comboEffects.length) {
    factorLines.push(`Birlikte daha kritik çalışan ${comboEffects.length} madde kombinasyonu tespit edildi.`);
  }
  if (mitigation.points > 0) {
    factorLines.push(`${mitigation.reasons.length || 1} adet dengeleyici/piyasada daha makul sinyal skoru yumuşattı.`);
  }

  const scoreExplain = {
    meaning: "Bu skor bir tehlike alarmı veya ‘imzala/imzalama’ kararı değildir. Sözleşme dilinde senin aleyhine işleyebilecek maddelerin yoğunluğunu ve şiddetini yaklaşık olarak gösterir.",
    factors: factorLines.slice(0, 4),
    topDrivers,
    withoutTopDriversScore,
    combos: comboEffects,
    mitigation
  };

const correctness = buildCorrectnessSummary(softWarnings);
const mitigationSummary = buildMitigationSummary(mitigation);
const counterpartyContext = detectCounterpartyContext(text, pack);
const actionPlan = buildActionPlan({ issues: groupedIssues, correctness, mitigation, pack });
const reviewVerdict = buildReviewVerdict({ riskScore, correctness, issues: groupedIssues, softWarnings, pack, severityCounts, mitigation });
const subScores = buildSubscores({ issues: groupedIssues, softWarnings, correctness });
const decision = buildDecisionEngine({ riskScore, correctness, subScores, issues: groupedIssues, mitigation, reviewVerdict });
const redlinePlaybook = buildRedlinePlaybook({ issues: groupedIssues, pack, role });

// Simülasyonlar / piyasa mantık kontrolü
let simulation = null;
let eventMeta = null;
if (pack === "etkinlik") {
  eventMeta = extractEventMeta(text);
}

const marketReview = marketReviewForPack(pack, {
  text,
  event: eventMeta,
  issues: groupedIssues,
  softWarnings,
  summary: { riskScore, severityCounts, correctness },
  pack,
  role
});

if ((pack === "etkinlik" && eventMeta && eventMeta.available) || (marketReview && marketReview.available)) {
  simulation = { event: eventMeta, market: marketReview };
}

const whatIf = buildWhatIfScenarios({
  pack,
  text,
  issues: groupedIssues,
  softWarnings,
  simulation,
  marketReview
});

// Risk -> Parasal Etki (kart etiketleri)
if (pack === "etkinlik") {
  const ctx = { pack, text, event: eventMeta };
  for (const it of groupedIssues) {
    it.moneyImpact = computeMoneyImpact(it, ctx);
  }
}

// İçerik iyileştirmeleri: oran analizi, sektörel bayraklar, karşılaştırma, yeniden yazım, yönetici özeti
const contentEnhancements = buildContentEnhancements({
  text,
  issues: groupedIssues,
  pack,
  riskScore,
  riskLevel: levelInfo.level,
  severityCounts,
  decision,
  subScores
});

return {
    meta: {
      analyzedAt: new Date().toISOString(),
      // kept for internal dedupe (not shown in UI/PDF)
      textHash: sha(text)
    },
    summary: {
      role,
      pack: (opts.pack || "genel").toString(),
      sensitivity: String(opts.sensitivity || "dengeli"),
      riskScore,
      riskLevel: levelInfo.level,
      riskLevelColor: levelInfo.color,
      issueCount: groupedIssues.length,
      softWarningCount: softWarnings.length,
      quality: quality ? { label: quality.label, score: quality.score } : null,
      categoryCounts,
      severityCounts,
      scoreExplain,
      correctness,
      counterpartyContext,
      actionPlan,
      reviewVerdict,
      comboCount: comboEffects.length,
      mitigationPoints: mitigation.points,
      mitigationReasons: mitigation.reasons,
      mitigationSummary,
      marketReviewStatus: marketReview?.status || null,
      subScores,
      decision,
      reviewVerdict,
      redlineCount: redlinePlaybook.length,
      whatIfCount: Array.isArray(whatIf?.items) ? whatIf.items.length : 0,
      hasContentEnhancements: true,
      ratioCount: contentEnhancements.ratioAnalysis?.items?.length || 0,
      sectorFlagCount: contentEnhancements.sectorRedFlags?.items?.length || 0,
      rewriteCount: contentEnhancements.rewriteSuggestions?.items?.length || 0
    },
    topRisks,
    issues: groupedIssues,
    softWarnings,
    simulation,
    combos: comboEffects,
    mitigation,
    marketReview,
    counterpartyContext,
    actionPlan,
    reviewVerdict,
    subScores,
    decision,
    redlinePlaybook,
    whatIf,
    contentEnhancements
  };
}

module.exports = { analyzeContract };
