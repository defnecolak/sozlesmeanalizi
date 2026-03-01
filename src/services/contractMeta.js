const ROLE_OPTIONS = [
  {
    id: "genel",
    label: "Genel",
    helper: "Emin değilsen bunu seç. Uygulama metne bakıp rol/tür tutarlılığı için ayrıca uyarı verir."
  },
  {
    id: "hizmet_alan",
    label: "Hizmet Alan",
    helper: "Bu rolde skor, sözleşmeyi satın alan / iş veren / davet sahibi tarafından inceleniyormuş gibi hesaplanır."
  },
  {
    id: "hizmet_veren",
    label: "Hizmet Veren",
    helper: "Bu rolde skor, freelancer / ajans / mekan / sağlayıcı açısından riskleri daha görünür hale getirir."
  },
  {
    id: "kiraci",
    label: "Kiracı",
    helper: "Kira sözleşmesinde depozito, tahliye, bakım ve artış maddeleri kiracı gözünden yorumlanır."
  },
  {
    id: "ev_sahibi",
    label: "Ev Sahibi",
    helper: "Kira sözleşmesinde tahsilat, kullanım, hasar ve tahliye maddeleri ev sahibi gözünden ele alınır."
  },
  {
    id: "alici",
    label: "Alıcı",
    helper: "Satış, abonelik veya kredi ilişkilerinde ödeyen/tüketen taraf için daha hassas bir analiz üretir."
  },
  {
    id: "satici",
    label: "Satıcı",
    helper: "Satış veya abonelik ilişkisinde sağlayan/teslim eden tarafın risklerini daha görünür hale getirir."
  }
];

const PACK_OPTIONS = [
  {
    id: "genel",
    label: "Genel",
    helper: "Türden emin değilsen başla. Uygulama metne göre daha uygun tür önerisi de verebilir.",
    examples: ["karışık taslak", "belirsiz sözleşme", "birden çok konu içeren metin"]
  },
  {
    id: "hizmet",
    label: "Hizmet / Serbest Çalışma",
    helper: "Freelance, ajans, danışmanlık, prodüksiyon, yazılım geliştirme, tasarım ve benzeri hizmet sözleşmeleri için.",
    examples: ["freelance", "danışmanlık", "ajans hizmeti"]
  },
  {
    id: "influencer",
    label: "Influencer Anlaşması",
    helper: "Marka iş birliği, içerik üretimi, reklam yayını, kullanım hakları ve sponsorlu paylaşım anlaşmaları için.",
    examples: ["instagram iş birliği", "sponsorlu post", "içerik üretimi"]
  },
  {
    id: "etkinlik",
    label: "Düğün / Etkinlik",
    helper: "Mekan, düğün, nişan, after party, kurumsal davet, organizasyon ve salon sözleşmeleri için.",
    examples: ["düğün", "mekan sözleşmesi", "kurumsal etkinlik"]
  },
  {
    id: "kira",
    label: "Kira",
    helper: "Konut, ofis, dükkan veya kısa dönem kiralama sözleşmeleri için.",
    examples: ["konut kirası", "ofis", "depozito"]
  },
  {
    id: "satis",
    label: "Satış / Alım",
    helper: "Mal alım-satımı, ürün teslimi, ayıplı mal, garanti ve mülkiyet devri içeren sözleşmeler için.",
    examples: ["ürün satışı", "tedarik", "satış bedeli"]
  },
  {
    id: "saas",
    label: "SaaS / Yazılım Aboneliği",
    helper: "Yazılım üyeliği, dijital hizmet, API kullanımı, SLA ve hizmet seviyesi hükümleri için.",
    examples: ["SaaS", "API", "SLA"]
  },
  {
    id: "is",
    label: "İş Sözleşmesi",
    helper: "İşveren-çalışan ilişkisi, maaş, mesai, izin, deneme süresi ve fesih hükümleri için.",
    examples: ["işçi", "maaş", "SGK"]
  },
  {
    id: "kredi",
    label: "Kredi / Borç",
    helper: "Borç, taksit, faiz, muacceliyet, kefil, teminat ve tahsil masrafı içeren metinler için.",
    examples: ["kredi", "faiz", "kefil"]
  },
  {
    id: "egitim",
    label: "Eğitim / Kurs",
    helper: "Kurs, bootcamp, koçluk, eğitim programı, ders paketi ve sertifika sözleşmeleri için.",
    examples: ["kurs", "öğrenci", "program"]
  },
  {
    id: "gizlilik",
    label: "Gizlilik / NDA",
    helper: "Gizli bilgi, ifşa yasağı, veri paylaşımı, ticari sır ve gizlilik yükümlülüğü içeren metinler için.",
    examples: ["NDA", "gizli bilgi", "ifşa yasağı"]
  },
  {
    id: "abonelik",
    label: "Abonelik / Taahhüt",
    helper: "Telefon, internet, üyelik, otomatik yenileme, cayma ve taahhüt sözleşmeleri için.",
    examples: ["otomatik yenileme", "taahhüt", "üyelik"]
  },
  {
    id: "arac",
    label: "Araç Kiralama",
    helper: "Rent a car, filo, günlük/haftalık araç kiralama, km sınırı ve hasar sorumluluğu içeren metinler için.",
    examples: ["plaka", "km sınırı", "rent a car"]
  },
  {
    id: "seyahat",
    label: "Seyahat / Tur / Otel",
    helper: "Tur, paket seyahat, rezervasyon, otel, transfer ve iptal/iade maddeleri içeren sözleşmeler için.",
    examples: ["otel", "uçuş", "rezervasyon"]
  },
  {
    id: "sigorta",
    label: "Sigorta / Poliçe",
    helper: "Poliçe, prim, teminat, hasar, ihbar süresi, muafiyet ve kapsam dışı hükümler için.",
    examples: ["poliçe", "prim", "muafiyet"]
  }
];


const SENSITIVITY_OPTIONS = [
  {
    id: "dengeli",
    label: "Dengeli",
    helper: "Varsayılan mod. Piyasa normunu ve gerçek riski birlikte tartmaya çalışır."
  },
  {
    id: "yumusak",
    label: "Yumuşak",
    helper: "Daha az alarmist yorum isterken kullan. Standart sektör maddelerini daha toleranslı değerlendirir."
  },
  {
    id: "sert",
    label: "Sert",
    helper: "Daha temkinli inceleme isterken kullan. Risk işaretlerini daha görünür hale getirir."
  }
];

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((x) => [x.id, x.label]));
const ROLE_HELPERS = Object.fromEntries(ROLE_OPTIONS.map((x) => [x.id, x.helper]));
const PACK_LABELS = Object.fromEntries(PACK_OPTIONS.map((x) => [x.id, x.label]));
const PACK_HELPERS = Object.fromEntries(PACK_OPTIONS.map((x) => [x.id, x.helper]));
const PACK_EXAMPLES = Object.fromEntries(PACK_OPTIONS.map((x) => [x.id, x.examples || []]));
const SENSITIVITY_LABELS = Object.fromEntries(SENSITIVITY_OPTIONS.map((x) => [x.id, x.label]));
const SENSITIVITY_HELPERS = Object.fromEntries(SENSITIVITY_OPTIONS.map((x) => [x.id, x.helper]));

const ROLE_IDS = new Set(Object.keys(ROLE_LABELS));
const PACK_IDS = new Set(Object.keys(PACK_LABELS));
const SENSITIVITY_IDS = new Set(Object.keys(SENSITIVITY_LABELS));

const PACK_ALIAS_MAP = {
  nda: "gizlilik",
  freelance: "hizmet",
  freelancer: "hizmet",
  hizmetler: "hizmet",
  dugun: "etkinlik",
  event: "etkinlik",
  alis: "satis",
  alım: "satis",
  alım_satim: "satis",
  alim: "satis",
  alim_satim: "satis",
  araba: "arac",
  rentacar: "arac",
  rent_a_car: "arac",
  tur: "seyahat",
  travel: "seyahat",
  course: "egitim",
  education: "egitim",
  loan: "kredi",
  nda_gizlilik: "gizlilik"
};

function normalizeRoleId(v) {
  const s = String(v || "genel").trim().toLowerCase();
  return ROLE_IDS.has(s) ? s : "genel";
}

function normalizePackId(v) {
  const s = String(v || "genel").trim().toLowerCase();
  if (PACK_IDS.has(s)) return s;
  if (PACK_ALIAS_MAP[s]) return PACK_ALIAS_MAP[s];
  return "genel";
}


function normalizeSensitivityId(v) {
  const s = String(v || "dengeli").trim().toLowerCase();
  if (s === "yumusak" || s === "soft") return "yumusak";
  if (s === "sert" || s === "strict") return "sert";
  if (SENSITIVITY_IDS.has(s)) return s;
  return "dengeli";
}

module.exports = {
  ROLE_OPTIONS,
  PACK_OPTIONS,
  ROLE_LABELS,
  ROLE_HELPERS,
  PACK_LABELS,
  PACK_HELPERS,
  PACK_EXAMPLES,
  SENSITIVITY_OPTIONS,
  SENSITIVITY_LABELS,
  SENSITIVITY_HELPERS,
  PACK_IDS,
  ROLE_IDS,
  SENSITIVITY_IDS,
  PACK_ALIAS_MAP,
  normalizeRoleId,
  normalizePackId,
  normalizeSensitivityId,
};
