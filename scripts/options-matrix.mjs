import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { analyzeContract } = require("../src/services/analyzer");
const { ROLE_OPTIONS, PACK_OPTIONS, normalizePackId, normalizeRoleId } = require("../src/services/contractMeta");

const SAMPLE_BY_PACK = {
  genel: `Taraflar bu sözleşme kapsamında hizmetin kapsamı, ödeme tarihi, teslim ve fesih kurallarını aşağıdaki şekilde kabul eder.`,
  hizmet: `HİZMET SÖZLEŞMESİ\nHizmet veren proje kapsamındaki tasarım ve danışmanlık işlerini teslim eder. Ücret iki taksitte ödenir. Revizyon sayısı iki ile sınırlıdır.`,
  influencer: `INFLUENCER İŞ BİRLİĞİ\nMarka için 2 adet post ve 3 adet story paylaşılacaktır. İçerik kullanım hakkı 6 ay süreyle markaya verilir.`,
  etkinlik: `ETKİNLİK SÖZLEŞMESİ\nDüğün tarihi 28 Ağustos 2026'dır. Garanti kişi sayısı 300'dür. Cayma halinde ücretin belirli kısmı iade edilmez.`,
  kira: `KİRA SÖZLEŞMESİ\nKiracı aylık kira bedelini her ayın 5'inde öder. Depozito teslimde alınır. Tahliye ve bakım kuralları aşağıda belirtilmiştir.`,
  satis: `SATIŞ SÖZLEŞMESİ\nSatıcı ürünleri 10 gün içinde teslim eder. Satış bedeli 150.000 TL'dir. Ayıplı mal halinde alıcının seçimlik hakları saklıdır.`,
  saas: `SAAS ABONELİK\nMüşteri API ve panel erişimi için aylık abonelik bedeli öder. SLA, kesinti bildirimi ve veri işleme hükümleri uygulanır.`,
  is: `İŞ SÖZLEŞMESİ\nİşveren aylık ücret öder. Çalışan haftalık 45 saat çalışır. SGK, izin ve fesih hükümleri bu sözleşmede düzenlenmiştir.`,
  kredi: `KREDİ SÖZLEŞMESİ\nBorçlu aylık taksitleri vade tarihinde öder. Gecikme halinde temerrüt faizi ve muacceliyet hükümleri uygulanır.`,
  egitim: `EĞİTİM KAYIT SÖZLEŞMESİ\nKatılımcı kurs ücretini öder. Eğitim programı ve ders tarihleri ek listede yer alır. Devamsızlık ve sertifika kuralları aşağıdadır.`,
  gizlilik: `GİZLİLİK SÖZLEŞMESİ\nTaraflar gizli bilgileri üçüncü kişilerle paylaşmayacaktır. Kamuya açık bilgiler ve yasal zorunluluk halleri istisnadır.`,
  abonelik: `ABONELİK SÖZLEŞMESİ\nÜyelik aylık yenilenir. Müşteri iptal etmediği sürece abonelik devam eder. Fatura ve cayma koşulları aşağıdadır.`,
  arac: `ARAÇ KİRALAMA SÖZLEŞMESİ\nAraç plakası 34 ABC 123'tür. Günlük km sınırı 300'dür. Hasar, yakıt ve iade koşulları aşağıda düzenlenmiştir.`,
  seyahat: `SEYAHAT SÖZLEŞMESİ\nTur programı, otel ve transfer detayları aşağıdadır. Rezervasyon iptali ve iade koşulları katılımcıya bildirilmiştir.`,
  sigorta: `SİGORTA POLİÇESİ\nSigortalı prim öder. Teminat kapsamı, muafiyet, hasar ihbar süresi ve tazminat hesaplama usulü poliçede belirtilmiştir.`
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let count = 0;
for (const role of ROLE_OPTIONS) {
  for (const pack of PACK_OPTIONS) {
    const text = SAMPLE_BY_PACK[pack.id] || SAMPLE_BY_PACK.genel;
    const res = analyzeContract(text, { role: role.id, pack: pack.id });
    assert(res && res.summary, `${role.id}/${pack.id}: summary yok`);
    assert(res.summary.pack === pack.id, `${role.id}/${pack.id}: pack bozuldu (${res.summary.pack})`);
    assert(res.summary.role === role.id, `${role.id}/${pack.id}: role bozuldu (${res.summary.role})`);
    assert(Number.isFinite(res.summary.riskScore), `${role.id}/${pack.id}: riskScore sayı değil`);
    assert(res.summary.riskScore >= 0 && res.summary.riskScore <= 100, `${role.id}/${pack.id}: riskScore aralık dışı`);
    assert(Array.isArray(res.issues), `${role.id}/${pack.id}: issues array değil`);
    assert(Array.isArray(res.softWarnings), `${role.id}/${pack.id}: softWarnings array değil`);
    assert(res.summary.correctness && typeof res.summary.correctness === "object", `${role.id}/${pack.id}: correctness yok`);
    count += 1;
  }
}

const aliasChecks = {
  dugun: "etkinlik",
  nda: "gizlilik",
  freelance: "hizmet",
  alis: "satis",
  araba: "arac",
  tur: "seyahat"
};
for (const [raw, expected] of Object.entries(aliasChecks)) {
  assert(normalizePackId(raw) === expected, `alias ${raw} -> ${expected} bekleniyordu`);
}

for (const role of ROLE_OPTIONS) {
  assert(normalizeRoleId(role.id) === role.id, `role normalize bozuk: ${role.id}`);
}

console.log(`✅ Option matrix passed (${count} rol/tür kombinasyonu)`);
