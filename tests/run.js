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
