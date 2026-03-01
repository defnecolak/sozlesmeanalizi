const NegotiationCopy = require("../src/public/negotiation-copy");
const { analyzeContract } = require("../src/services/analyzer");

function assert(cond, msg) {
  if (!cond) {
    console.error("❌ TEST FAIL:", msg);
    process.exit(1);
  }
}

// ---- Test 1: core freelancer-style rules ----
const sample1 = `
MADDE 1 - KAPSAM
1.1 Sözleşme koşullarını tek taraflı olarak değiştirebilir.

MADDE 2 - ÖDEME
2.1 Ücret iadesi yapılmaz.

MADDE 3 - FESİH
3.1 Herhangi bir gerekçe göstermeksizin derhal feshedebilir.

MADDE 4 - REVİZYON
4.1 Sınırsız revizyon talep edilebilir.

MADDE 5 - FİKRİ MÜLKİYET
5.1 Tüm fikri mülkiyet hakları münhasıran devredilir.
`;

const res1 = analyzeContract(sample1, { role: "hizmet_veren", pack: "hizmet" });
const ids1 = new Set((res1.issues || []).map(x => x.id));

assert(ids1.has("unilateral_change"), "unilateral_change bulunmalı");
assert(ids1.has("no_refund"), "no_refund bulunmalı");
assert(ids1.has("terminate_without_cause"), "terminate_without_cause bulunmalı");
assert(ids1.has("unlimited_revisions"), "unlimited_revisions bulunmalı");
assert(ids1.has("ip_assignment"), "ip_assignment bulunmalı");

assert(res1.summary.riskScore >= 35, "riskScore beklenenden düşük (test1)");
console.log("✅ Test1 passed");

// ---- Test 2: new 'general' risks ----
const sample2 = `
UYUŞMAZLIK: İşbu sözleşmeden doğan uyuşmazlıklarda yalnızca İstanbul Mahkemeleri yetkilidir.
Taraflardan biri bu sözleşmeyi karşı tarafın onayı olmaksızın üçüncü kişilere devredebilir.
Bildirimler sadece portal üzerinden yapılır; e-posta ile bildirim geçersizdir.
Ücretler şirket tarafından güncellenebilir ve fiyatlar değiştirilebilir.
Teslim edilen hizmet olduğu gibi (as-is) sunulur, hiçbir garanti verilmez.
Mücbir sebep kapsamında internet kesintisi ve tedarikçi sorunu sayılır.
`;

const res2 = analyzeContract(sample2, { role: "alici", pack: "genel" });
const ids2 = new Set((res2.issues || []).map(x => x.id));

assert(ids2.has("exclusive_jurisdiction"), "exclusive_jurisdiction bulunmalı");
assert(ids2.has("assignment_unilateral"), "assignment_unilateral bulunmalı");
assert(ids2.has("notice_portal_only"), "notice_portal_only bulunmalı");
assert(ids2.has("unilateral_price_increase"), "unilateral_price_increase bulunmalı");
assert(ids2.has("as_is_no_warranty"), "as_is_no_warranty bulunmalı");
assert(ids2.has("force_majeure_broad"), "force_majeure_broad bulunmalı");

console.log("✅ Test2 passed");
console.log("✅ Tests passed");


// ---- Test 3: negotiation copy should be natural and clause-based ----
const issue = {
  title: "Sınırsız sorumluluk / dolaylı zarar",
  clause: "Madde 10",
  why: "Sorumluluk limiti yoksa, talep edilecek tutar teorik olarak çok büyüyebilir.",
  moneyImpact: "yaklaşık 52.650 €'ya kadar risk",
  templates: [
    "Sorumluluk üst sınırı iste (örn. sözleşme bedeli kadar).",
    "Dolaylı zarar/kar kaybını hariç tut."
  ]
};
const neg = NegotiationCopy.buildIssueText(issue, { role: "hizmet_alan", pack: "etkinlik", includeGreeting: true, includeClosing: true });
assert(/Madde 10/.test(neg), "Negotiation text should use clause label");
assert(!/^[-*•]/m.test(neg), "Negotiation text should not contain bullet markers");
assert(/rica ediyorum|rica edeceğim|paylaşabilir misiniz/.test(neg), "Negotiation text should sound like a sendable revision request");
console.log("✅ Test3 passed");


// ---- Test 4: negotiation doc should be pack-aware and grouped ----
const docIssues = [
  {
    title: "İptal / iade",
    clause: "Madde 6",
    category: "İptal / İade",
    why: "İptal halinde ödenen bedelin büyük kısmı iade edilmeyebilir.",
    templates: ["cezaya üst sınır koy", "iptal yöntemi açık ve kolay olsun"]
  },
  {
    title: "Sorumluluk",
    clause: "Madde 10",
    category: "Sorumluluk",
    why: "Sorumluluk limiti yoksa talep edilecek tutar çok büyüyebilir.",
    templates: ["sorumluluk üst sınırı iste", "dolaylı zarar/kar kaybını hariç tut"]
  }
];
const eventDoc = NegotiationCopy.buildDoc(docIssues, { role: "hizmet_alan", pack: "etkinlik" });
assert(/Etkinlik sözleşmesini/.test(eventDoc), "Event doc intro should be pack-aware");
assert(/İptal ve iade/i.test(eventDoc), "Event doc should group issues by category heading");
assert(!/\n\s*1\)/.test(eventDoc), "Event doc should not fall back to old numbered builder");

const ndaDoc = NegotiationCopy.buildDoc(docIssues.slice(0,1), { role: "genel", pack: "gizlilik" });
assert(/Gizlilik metnini/.test(ndaDoc), "NDA doc intro should be pack-aware");
console.log("✅ Test4 passed");


// ---- Test 5: relationship-aware tone should vary by contract type / counterparty ----
const eventTone = NegotiationCopy.buildDoc([
  {
    title: "İptal / iade",
    clause: "Madde 6",
    category: "İptal / İade",
    why: "İptal halinde ödenen bedelin büyük kısmı iade edilmeyebilir.",
    templates: ["cezaya üst sınır koy", "iptal yöntemi açık ve kolay olsun"]
  }
], { role: "hizmet_alan", pack: "etkinlik" });
assert(/mekân \/ organizasyon tarafı/i.test(eventTone), "Event tone should mention venue/organization counterparty");
assert(/Uygun görürseniz/i.test(eventTone), "Event tone should stay softer/polite");

const creditTone = NegotiationCopy.buildDoc([
  {
    title: "Muacceliyet",
    clause: "Madde 12",
    category: "Ödeme",
    why: "Bir taksidin gecikmesi halinde tüm borç bir anda muaccel olabilir.",
    templates: ["cezaya üst sınır koy"]
  }
], { role: "alici", pack: "kredi" });
assert(/banka \/ finansman sağlayıcı/i.test(creditTone), "Credit tone should mention bank/finance provider");
assert(/sınırları belirli/i.test(creditTone), "Credit tone should be firmer");

const saasTone = NegotiationCopy.buildDoc([
  {
    title: "SLA",
    clause: "Madde 8",
    category: "Kapsam / Teslim",
    why: "Kesinti halinde hizmet seviyesi ve telafi mekanizması net görünmüyor.",
    templates: ["gecikme/eksik hizmette iade veya indirim şartı eklet"]
  }
], { role: "alici", pack: "saas" });
assert(/sağlayıcı \/ satış ekibi/i.test(saasTone), "SaaS tone should mention provider/sales team");
assert(/ölçülebilir/i.test(saasTone), "SaaS tone should sound procurement-like");
console.log("✅ Test5 passed");


// ---- Test 6: sensitivity should change score without breaking issues ----
const sensSample = `
Taraflardan biri sözleşmeyi tek taraflı değiştirebilir.
Ücret iadesi yapılmaz.
İptal halinde cezai şart uygulanır.
Tedarikçi ve üçüncü kişi zararlarından müşteri sorumludur.
`;
const softRes = analyzeContract(sensSample, { role: 'hizmet_alan', pack: 'etkinlik', sensitivity: 'yumusak' });
const hardRes = analyzeContract(sensSample, { role: 'hizmet_alan', pack: 'etkinlik', sensitivity: 'sert' });
assert(hardRes.summary.riskScore >= softRes.summary.riskScore, 'Sert mod, yumuşaktan daha düşük skor üretmemeli');
assert(softRes.summary.sensitivity === 'yumusak', 'Yumuşak hassasiyet summaryde görünmeli');
console.log('✅ Test6 passed');

// ---- Test 7: counterparty context + action plan should exist ----
const ctxRes = analyzeContract(`
ABC A.Ş. satın alma ekibi ile yıllık SaaS aboneliği sözleşmesi.
Otomatik yenileme uygulanır. SLA ve hizmet seviyesi tarafların mutabakatına tabidir.
Değişiklikler sağlayıcı tarafından tek taraflı yapılabilir.
`, { role: 'alici', pack: 'saas', sensitivity: 'dengeli' });
assert(ctxRes.summary.counterpartyContext && ctxRes.summary.counterpartyContext.scale, 'Counterparty context üretilmeli');
assert(ctxRes.summary.actionPlan && Array.isArray(ctxRes.summary.actionPlan.mustFix), 'Action plan üretilmeli');
const subj = NegotiationCopy.buildSubjectLine({
  role: 'alici',
  pack: 'saas',
  sensitivity: 'dengeli',
  counterpartyContext: ctxRes.summary.counterpartyContext,
});
assert(/revize talebi/i.test(subj), 'Subject line üretilebilmeli');
console.log('✅ Test7 passed');

// ---- Test 8: advanced review blocks should exist ----
const advRes = analyzeContract(`
MADDE 1 - ÖDEME
1.1 Ücret iadesi yapılmaz.
MADDE 2 - SORUMLULUK
2.1 Dolaylı zararlar dahil olmak üzere tüm zararlardan sorumludur.
MADDE 3 - FESİH
3.1 Karşı taraf tek taraflı değişiklik yapabilir ve dilediğinde feshedebilir.
`, { role: 'hizmet_alan', pack: 'hizmet', sensitivity: 'dengeli' });
assert(advRes.summary.decision && advRes.summary.decision.status, 'Decision summary üretilmeli');
assert(Array.isArray(advRes.summary.subScores) && advRes.summary.subScores.length >= 4, 'Alt skorlar üretilmeli');
assert(Array.isArray(advRes.redlinePlaybook) && advRes.redlinePlaybook.length >= 1, 'Redline playbook üretilmeli');
assert(advRes.redlinePlaybook[0].idealClause, 'Redline item ideal madde içermeli');
console.log('✅ Test8 passed');

// ---- Test 9: what-if scenarios should exist for key packs ----
const eventRes = analyzeContract(`
ETKİNLİK TARİHİ: 28 Ağustos 2026
GARANTİ KİŞİ SAYISI: 300
TOPLAM TUTAR: 52.650 €
15.2 179 gün – 130 gün kala iptal halinde %35 cezai şart uygulanır.
15.3 14 gün kala tamamı tahsil edilir.
`, { role: 'hizmet_alan', pack: 'etkinlik', sensitivity: 'dengeli' });
assert(eventRes.whatIf && eventRes.whatIf.available, 'Etkinlik için what-if üretilmeli');
assert((eventRes.whatIf.items || []).some(x => /iptal/i.test(String(x.title || ''))), 'Etkinlik what-if içinde iptal senaryosu olmalı');

const creditRes = analyzeContract(`
Borçlu taksitlerden birini ödemediği takdirde tüm borç muaccel olur.
Aylık %2,5 gecikme faizi uygulanır.
`, { role: 'alici', pack: 'kredi', sensitivity: 'dengeli' });
assert(creditRes.whatIf && creditRes.whatIf.available, 'Kredi için what-if üretilmeli');
assert((creditRes.whatIf.items || []).some(x => /taksit/i.test(String(x.title || '')) || /muaccel/i.test(String(x.outcome || ''))), 'Kredi what-if muacceliyet/taksit senaryosu içermeli');
console.log('✅ Test9 passed');
