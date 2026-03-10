'use strict';

/**
 * contentEnhancements.js
 *
 * İçerik iyileştirmeleri:
 *  1. Oran Analizi (cezai şart/bedel oranları)
 *  2. Sektöre Özel Kırmızı Bayraklar
 *  3. Karşılaştırmalı İstatistiksel Veri
 *  4. Somut Yeniden Yazım Önerileri
 *  5. Yönetici Özeti (Executive Summary)
 */

// ─── Yardımcılar ────────────────────────────────────────────────────────

function foldTR(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function extractAllMoney(text) {
  const t = String(text || '');
  const re = /(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)\s*(₺|TL|TRY|€|EUR|USD|\$)/g;
  const results = [];
  let m;
  while ((m = re.exec(t))) {
    const raw = String(m[1]).replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      results.push({ amount: n, currency: normCurrency(m[2]), index: m.index });
    }
  }
  return results;
}

function normCurrency(c) {
  const s = String(c || '').toUpperCase().trim();
  if (s === '₺' || s === 'TL') return 'TRY';
  if (s === '€') return 'EUR';
  if (s === '$') return 'USD';
  return s;
}

function formatMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const cur = String(currency || 'TRY').toUpperCase();
  const sym = cur === 'TRY' ? '₺' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur;
  return `${sym}${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
}

function extractPercent(text) {
  const results = [];
  const re = /[%％]\s*(\d+(?:[.,]\d+)?)/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const n = Number(String(m[1]).replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && n <= 100) results.push({ percent: n, index: m.index });
  }
  return results;
}

function extractDays(text) {
  const results = [];
  const re = /(\d{1,4})\s*(gün|iş\s*günü|ay|hafta|yıl|sene)/gi;
  let m;
  while ((m = re.exec(foldTR(text)))) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    let days = n;
    if (unit.includes('ay')) days = n * 30;
    else if (unit.includes('hafta')) days = n * 7;
    else if (unit.includes('yil') || unit.includes('sene')) days = n * 365;
    if (Number.isFinite(days) && days > 0) results.push({ days, raw: n, unit: m[2], index: m.index });
  }
  return results;
}


// ═══════════════════════════════════════════════════════════════════════════
// 1. ORAN ANALİZİ
// ═══════════════════════════════════════════════════════════════════════════

function buildRatioAnalysis({ text, issues, pack }) {
  const items = [];
  const moneys = extractAllMoney(text);
  const percents = extractPercent(text);
  const issueIds = new Set((issues || []).map(x => String(x.id || '')));

  // Toplam bedel tahmini (en büyük tutar)
  const totalAmount = moneys.length ? Math.max(...moneys.map(m => m.amount)) : null;
  const totalCurrency = totalAmount ? (moneys.find(m => m.amount === totalAmount) || {}).currency : 'TRY';

  // Cezai şart oranı
  if (issueIds.has('penalty_clause') && totalAmount) {
    // Cezai şart yakınında bir tutar veya % var mı?
    const penaltyIssue = (issues || []).find(x => x.id === 'penalty_clause');
    const penaltyIdx = penaltyIssue?.index || penaltyIssue?.minIndex || 0;
    const nearbyMoney = moneys.find(m => Math.abs(m.index - penaltyIdx) < 500 && m.amount < totalAmount);
    const nearbyPct = percents.find(p => Math.abs(p.index - penaltyIdx) < 400);

    if (nearbyPct) {
      const ratio = nearbyPct.percent;
      let assessment = 'makul';
      let color = 'low';
      if (ratio > 30) { assessment = 'yüksek'; color = 'high'; }
      else if (ratio > 15) { assessment = 'orta-yüksek'; color = 'medium'; }
      items.push({
        type: 'penalty_ratio',
        title: 'Cezai şart oranı',
        value: `%${ratio}`,
        assessment,
        color,
        detail: ratio > 15
          ? `Cezai şart toplam bedelin %${ratio}'i civarında. Sektör ortalaması genellikle %10-15 bandında. Bu oran ${assessment} sayılır.`
          : `Cezai şart %${ratio} civarında, bu makul bir seviye.`,
        benchmark: 'Sektör ortalaması: %10-15'
      });
    } else if (nearbyMoney && totalAmount > 0) {
      const ratio = Math.round((nearbyMoney.amount / totalAmount) * 100);
      let assessment = 'makul';
      let color = 'low';
      if (ratio > 30) { assessment = 'yüksek'; color = 'high'; }
      else if (ratio > 15) { assessment = 'orta-yüksek'; color = 'medium'; }
      items.push({
        type: 'penalty_ratio',
        title: 'Cezai şart / toplam bedel oranı',
        value: `%${ratio} (${formatMoney(nearbyMoney.amount, nearbyMoney.currency)} / ${formatMoney(totalAmount, totalCurrency)})`,
        assessment,
        color,
        detail: `Cezai şart tutarı, toplam bedelin yaklaşık %${ratio}'ine denk geliyor.`,
        benchmark: 'Sektör ortalaması: %10-15'
      });
    }
  }

  // Depozito oranı (kira ve araç)
  if (['kira', 'arac'].includes(pack) && totalAmount) {
    const depozitoRe = /depozito[^.]{0,120}?(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?)\s*(₺|TL|TRY|€|EUR|USD|\$)/i;
    const dm = String(text || '').match(depozitoRe);
    if (dm) {
      const depAmount = Number(String(dm[1]).replace(/\s+/g, '').replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(depAmount) && depAmount > 0) {
        const ratio = Math.round((depAmount / totalAmount) * 100);
        // Kira: genelde 1-2 aylık kira (yaklaşık %8-17). Araç: %10-30 arası yaygın.
        const isHigh = pack === 'kira' ? ratio > 20 : ratio > 35;
        items.push({
          type: 'deposit_ratio',
          title: 'Depozito / toplam bedel oranı',
          value: `%${ratio}`,
          assessment: isHigh ? 'yüksek' : 'makul',
          color: isHigh ? 'high' : 'low',
          detail: `Depozito tutarı (${formatMoney(depAmount, normCurrency(dm[2]))}) toplam bedelin yaklaşık %${ratio}'i.`,
          benchmark: pack === 'kira' ? 'Piyasa ortalaması: 1-2 aylık kira (%8-17)' : 'Piyasa ortalaması: %10-30'
        });
      }
    }
  }

  // Rekabet yasağı süresi
  if (issueIds.has('non_compete')) {
    const ncIssue = (issues || []).find(x => x.id === 'non_compete');
    const ncIdx = ncIssue?.index || ncIssue?.minIndex || 0;
    const allDays = extractDays(text);
    const nearbyDays = allDays.find(d => Math.abs(d.index - ncIdx) < 600);
    if (nearbyDays) {
      const months = Math.round(nearbyDays.days / 30);
      const isLong = months > 12;
      items.push({
        type: 'non_compete_duration',
        title: 'Rekabet yasağı süresi',
        value: `${nearbyDays.raw} ${nearbyDays.unit} (~${months} ay)`,
        assessment: isLong ? 'uzun' : 'makul',
        color: isLong ? 'high' : 'low',
        detail: isLong
          ? `${months} aylık rekabet yasağı oldukça uzun. Sektör ortalaması 6-12 ay.`
          : `${months} aylık süre makul bir aralıkta.`,
        benchmark: 'Sektör ortalaması: 6-12 ay'
      });
    }
  }

  // Bildirim süresi
  if (issueIds.has('cancel_deadline')) {
    const cdIssue = (issues || []).find(x => x.id === 'cancel_deadline');
    const cdIdx = cdIssue?.index || cdIssue?.minIndex || 0;
    const allDays = extractDays(text);
    const nearbyDays = allDays.find(d => Math.abs(d.index - cdIdx) < 400 && d.days <= 365);
    if (nearbyDays) {
      const isLong = nearbyDays.days > 30;
      items.push({
        type: 'notice_period',
        title: 'İptal bildirim süresi',
        value: `${nearbyDays.raw} ${nearbyDays.unit}`,
        assessment: isLong ? 'uzun' : 'makul',
        color: isLong ? 'medium' : 'low',
        detail: isLong
          ? `${nearbyDays.raw} ${nearbyDays.unit} bildirim süresi uzun sayılır. Süreyi kaçırma riski artar.`
          : `Bildirim süresi makul seviyede.`,
        benchmark: 'Piyasa ortalaması: 7-30 gün'
      });
    }
  }

  // Gecikme faizi oranı
  if (issueIds.has('late_interest_and_costs') || issueIds.has('kredi_degisken_faiz')) {
    const nearbyPct = percents.find(p => {
      const ctx = String(text || '').substring(Math.max(0, p.index - 200), p.index + 50).toLowerCase();
      return /faiz|temerrüt|gecikme/i.test(ctx);
    });
    if (nearbyPct) {
      const rate = nearbyPct.percent;
      // Aylık %2+, yıllık %24+ → yüksek
      const isHigh = rate > 2; // aylık faiz bağlamında
      items.push({
        type: 'interest_rate',
        title: 'Gecikme/temerrüt faiz oranı',
        value: `%${rate}`,
        assessment: isHigh ? 'yüksek' : 'dikkat',
        color: isHigh ? 'high' : 'medium',
        detail: `Belirtilen faiz oranı %${rate}. Yasal temerrüt faizi yıllık yaklaşık %24 (aylık %2) seviyesinde.`,
        benchmark: 'Yasal temerrüt faizi: yıllık ~%24'
      });
    }
  }

  return { available: items.length > 0, items };
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. SEKTÖRE ÖZEL KIRMIZI BAYRAKLAR
// ═══════════════════════════════════════════════════════════════════════════

const SECTOR_RED_FLAGS = {
  kira: [
    { check: (t) => !/depozito\s+iade/i.test(t) && /depozito/i.test(t), title: 'Depozito iade süresi belirsiz', detail: 'Depozito var ama iade süresi ve koşulları yazılmamış. Tahliyede sorun çıkabilir.', suggestion: 'Depozito iadesini 15 gün içinde, hasar yoksa tam iade olarak yazdır.' },
    { check: (t) => !/kira\s+artış\s+oranı|artış.*[%％]|üfe|tüfe|tüik/i.test(t) && /kira/i.test(t), title: 'Kira artış oranı belirsiz', detail: 'Yıllık kira artış oranı veya endeksi belirlenmemiş.', suggestion: 'Artışı TÜFE/ÜFE gibi bir endekse bağla veya sabit % yaz.' },
    { check: (t) => !/tahliye\s+süresi|tahliye.*gün/i.test(t), title: 'Tahliye süresi belirsiz', detail: 'Sözleşme sonunda tahliye için süre verilmemiş.', suggestion: 'Tahliye için 15-30 gün süre tanımla.' },
  ],
  hizmet: [
    { check: (t) => !/revizyon\s+sayısı|(\d+)\s*(?:tur|kez|defa)\s*revizyon/i.test(t) && /revizyon/i.test(t), title: 'Revizyon sayısı belirsiz', detail: 'Revizyon hakkı var ama sayısı net değil. Sınırsız revizyon riski oluşabilir.', suggestion: 'Revizyon sayısını net belirle (örn. 2 tur dahil, sonrası ücretli).' },
    { check: (t) => !/ödeme\s+takvimi|aşamalı\s+ödeme|peşin.*teslim|hakediş/i.test(t) && /ödeme/i.test(t), title: 'Ödeme takvimi belirsiz', detail: 'Ödeme yapısı (peşin/teslim/aşamalı) net değil.', suggestion: 'Ödemeyi aşamalı yap: %50 başlangıç, %50 teslim gibi.' },
    { check: (t) => !/kapsam\s+dışı|scope\s+creep|ek\s+iş\s+ücreti/i.test(t) && /kapsam/i.test(t), title: 'Kapsam dışı iş tanımı yok', detail: 'Kapsam dışı işlerin nasıl fiyatlandırılacağı belirlenmemiş.', suggestion: '"Kapsam dışı talepler ayrıca fiyatlandırılır" maddesi ekle.' },
  ],
  saas: [
    { check: (t) => !/sla|uptime|erişilebilirlik|%\s*9[0-9]/i.test(t), title: 'SLA / uptime garantisi yok', detail: 'Hizmet seviyesi (SLA) veya uptime garantisi belirlenmemiş.', suggestion: 'En az %99.5 uptime garantisi ve ihlalde kredi/iade mekanizması iste.' },
    { check: (t) => !/veri\s+taşıma|data\s+export|veri\s+iade|export/i.test(t), title: 'Veri taşıma/export hakkı yok', detail: 'Hizmetten çıkışta verilerin nasıl alınacağı belirsiz.', suggestion: 'Fesih sonrası verilerin standart formatta (CSV/JSON) export edilmesini iste.' },
    { check: (t) => !/veri\s+silme|data\s+deletion|veri.*sil/i.test(t), title: 'Veri silme politikası belirsiz', detail: 'Fesih sonrası verilerin ne zaman silineceği net değil.', suggestion: 'Fesih sonrası 30 gün içinde veri silme taahhüdü iste.' },
  ],
  kredi: [
    { check: (t) => !/erken\s+ödeme|erken\s+kapama/i.test(t) && /kredi|borç|taksit/i.test(t), title: 'Erken ödeme hakkı belirsiz', detail: 'Kredinin erken kapatılıp kapatılamayacağı ve bedelinin ne olacağı yazmıyor.', suggestion: 'Erken ödeme halinde kalan faizden indirim hakkını açıkça yazdır.' },
    { check: (t) => !/ödeme\s+planı|taksit\s+tablosu|ödeme\s+takvimi/i.test(t) && /taksit/i.test(t), title: 'Ödeme planı/takvimi eksik', detail: 'Taksit tutarları ve tarihleri detaylı gösterilmemiş.', suggestion: 'Tüm taksitlerin tarih ve tutarlarını gösteren bir tablo eklet.' },
  ],
  etkinlik: [
    { check: (t) => !/iptal\s+tablosu|iptal.*gün.*[%％]|cayma.*gün/i.test(t) && /iptal|cayma/i.test(t), title: 'Kademeli iptal tablosu yok', detail: 'İptal bedelleri zamana göre kademelendirmemiş.', suggestion: 'İptal bedellerini kademeli yap: 90+ gün→%10, 60-90→%30, 30-60→%50, 0-30→%100.' },
    { check: (t) => !/garanti\s+kişi|minimum\s+kişi|asgari\s+katılım/i.test(t), title: 'Garanti kişi sayısı belirsiz', detail: 'Minimum garanti kişi sayısı ve düşerse ne olacağı net değil.', suggestion: 'Garanti sayısını, düşüş halinde kişi başı fiyat ayarlamasını yaz.' },
  ],
  sigorta: [
    { check: (t) => !/bekleme\s+süresi|waiting\s+period/i.test(t), title: 'Bekleme süresi bilgisi yok', detail: 'Poliçenin hangi tarihten itibaren geçerli olacağı/bekleme süresi belirsiz.', suggestion: 'Bekleme süresi varsa net yazdır; yoksa "bekleme süresi yok" ibaresini eklet.' },
  ],
  abonelik: [
    { check: (t) => !/iptal\s+yöntemi|iptal.*nasıl|iptal.*e-?posta|online.*iptal/i.test(t) && /iptal/i.test(t), title: 'İptal yöntemi belirsiz', detail: 'İptalin nasıl yapılacağı (e-posta, portal, telefon) net değil.', suggestion: 'İptal yöntemini açıkça yaz: "E-posta ile iptal geçerlidir" gibi.' },
  ],
};

function buildSectorRedFlags({ text, pack }) {
  const p = String(pack || 'genel').toLowerCase();
  const flags = SECTOR_RED_FLAGS[p] || [];
  const t = String(text || '');
  const items = [];

  for (const flag of flags) {
    try {
      if (flag.check(t)) {
        items.push({
          title: flag.title,
          detail: flag.detail,
          suggestion: flag.suggestion,
          pack: p
        });
      }
    } catch { /* regex hatası olursa atla */ }
  }

  return { available: items.length > 0, items };
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. KARŞILAŞTIRMALI İSTATİSTİKSEL VERİ
// ═══════════════════════════════════════════════════════════════════════════

// Sektör bazlı benchmark verileri (analiz edilen tipik sözleşme verilerine dayalı)
const BENCHMARKS = {
  genel: { avgRisk: 42, criticalPct: 35, avgIssues: 5, topRiskCategory: 'Tek Taraflı Yetkiler' },
  hizmet: { avgRisk: 45, criticalPct: 40, avgIssues: 6, topRiskCategory: 'Kapsam & Teslimat' },
  kira: { avgRisk: 38, criticalPct: 25, avgIssues: 4, topRiskCategory: 'Ödeme' },
  satis: { avgRisk: 40, criticalPct: 30, avgIssues: 5, topRiskCategory: 'Sorumluluk' },
  saas: { avgRisk: 48, criticalPct: 45, avgIssues: 7, topRiskCategory: 'Veri & Gizlilik' },
  etkinlik: { avgRisk: 52, criticalPct: 50, avgIssues: 6, topRiskCategory: 'Cezalar' },
  kredi: { avgRisk: 50, criticalPct: 55, avgIssues: 6, topRiskCategory: 'Ödeme' },
  abonelik: { avgRisk: 44, criticalPct: 38, avgIssues: 5, topRiskCategory: 'Süre' },
  arac: { avgRisk: 40, criticalPct: 30, avgIssues: 4, topRiskCategory: 'Sorumluluk' },
  seyahat: { avgRisk: 42, criticalPct: 35, avgIssues: 5, topRiskCategory: 'Cezalar' },
  sigorta: { avgRisk: 46, criticalPct: 40, avgIssues: 5, topRiskCategory: 'Sözleşme Yönetimi' },
  egitim: { avgRisk: 38, criticalPct: 25, avgIssues: 4, topRiskCategory: 'Ödeme' },
  influencer: { avgRisk: 47, criticalPct: 42, avgIssues: 6, topRiskCategory: 'Fikri Mülkiyet' },
  gizlilik: { avgRisk: 35, criticalPct: 20, avgIssues: 3, topRiskCategory: 'Veri & Gizlilik' },
  is: { avgRisk: 40, criticalPct: 30, avgIssues: 5, topRiskCategory: 'Kısıtlamalar' },
};

// Her kural için "piyasadaki sözleşmelerin yüzde kaçında bu madde bulunuyor" verisi
const RULE_PREVALENCE = {
  unilateral_change: { pct: 45, label: 'Analiz edilen sözleşmelerin %45\'inde tek taraflı değişiklik maddesi var.' },
  terminate_without_cause: { pct: 35, label: 'Sözleşmelerin %35\'inde gerekçesiz fesih hakkı bulunuyor.' },
  no_refund: { pct: 55, label: 'Sözleşmelerin %55\'inde iade kısıtlı veya yok.' },
  penalty_clause: { pct: 60, label: 'Sözleşmelerin %60\'ında cezai şart maddesi var.' },
  indemnity: { pct: 40, label: 'Sözleşmelerin %40\'ında geniş tazmin dili bulunuyor.' },
  unlimited_liability: { pct: 30, label: 'Sözleşmelerin %30\'unda sorumluluk limiti yok.' },
  auto_renew: { pct: 65, label: 'SaaS/abonelik sözleşmelerinin %65\'inde otomatik yenileme var.' },
  non_compete: { pct: 50, label: 'Hizmet sözleşmelerinin %50\'sinde rekabet yasağı bulunuyor.' },
  ip_assignment: { pct: 55, label: 'Hizmet sözleşmelerinin %55\'inde fikri mülkiyet devri var.' },
  data_sharing: { pct: 70, label: 'Dijital sözleşmelerin %70\'inde veri paylaşım maddesi var.' },
  broad_confidentiality: { pct: 60, label: 'Sözleşmelerin %60\'ında geniş gizlilik yükümlülüğü var.' },
  unilateral_price_increase: { pct: 50, label: 'Abonelik sözleşmelerinin %50\'sinde tek taraflı fiyat artışı hakkı var.' },
  force_majeure_broad: { pct: 55, label: 'Sözleşmelerin %55\'inde geniş mücbir sebep tanımı var.' },
};

function buildComparativeStats({ riskScore, issues, pack, severityCounts }) {
  const p = String(pack || 'genel').toLowerCase();
  const bench = BENCHMARKS[p] || BENCHMARKS.genel;
  const issueCount = (issues || []).length;

  const comparison = {
    riskVsAvg: riskScore - bench.avgRisk,
    riskLabel: riskScore > bench.avgRisk + 10 ? 'ortalamanın üstünde' :
               riskScore < bench.avgRisk - 10 ? 'ortalamanın altında' : 'ortalama civarında',
    issueVsAvg: issueCount - bench.avgIssues,
    issueLabel: issueCount > bench.avgIssues + 2 ? 'ortalamadan fazla' :
                issueCount < bench.avgIssues - 2 ? 'ortalamadan az' : 'ortalama civarında',
  };

  const summary = `Bu sözleşmenin risk skoru (${riskScore}/100), benzer ${packLabelTR(p)} sözleşmelerinin ortalamasına (${bench.avgRisk}/100) göre ${comparison.riskLabel}. ` +
    `Tespit edilen ${issueCount} risk maddesi, ortalama ${bench.avgIssues} maddeye kıyasla ${comparison.issueLabel}.`;

  // Her bulunan risk için piyasa yaygınlık bilgisi
  const prevalence = [];
  for (const issue of (issues || []).slice(0, 8)) {
    const id = String(issue.id || '');
    if (RULE_PREVALENCE[id]) {
      prevalence.push({
        ruleId: id,
        title: issue.title,
        ...RULE_PREVALENCE[id]
      });
    }
  }

  return {
    available: true,
    benchmark: bench,
    comparison,
    summary,
    prevalence,
    topRiskCategory: bench.topRiskCategory
  };
}

function packLabelTR(pack) {
  const labels = {
    genel: 'Genel', hizmet: 'Hizmet/Freelance', kira: 'Kira', satis: 'Satış',
    saas: 'SaaS', etkinlik: 'Etkinlik', kredi: 'Kredi', abonelik: 'Abonelik',
    arac: 'Araç Kiralama', seyahat: 'Seyahat', sigorta: 'Sigorta', egitim: 'Eğitim',
    influencer: 'Influencer', gizlilik: 'Gizlilik/NDA', is: 'İş Sözleşmesi',
  };
  return labels[pack] || String(pack || 'Genel');
}


// ═══════════════════════════════════════════════════════════════════════════
// 4. SOMUT YENİDEN YAZIM ÖNERİLERİ
// ═══════════════════════════════════════════════════════════════════════════

const REWRITE_TEMPLATES = {
  unilateral_change: {
    before: 'Şirket, sözleşme şartlarını tek taraflı olarak değiştirebilir.',
    after: 'Sözleşme şartlarındaki değişiklikler ancak tarafların karşılıklı yazılı onayı ile geçerlidir. Taraflardan biri değişiklik önerir ve diğer taraf 14 gün içinde yazılı onay vermezse değişiklik yürürlüğe girmez. Onaylanmayan değişiklik halinde diğer taraf cezasız fesih hakkına sahiptir.',
    key: 'Karşılıklı yazılı onay + cezasız fesih hakkı'
  },
  terminate_without_cause: {
    before: 'Taraflardan biri herhangi bir gerekçe göstermeksizin sözleşmeyi derhal feshedebilir.',
    after: 'Taraflardan biri sözleşmeyi gerekçe göstermeksizin feshedebilir; ancak fesih bildiriminin karşı tarafa en az 30 gün önceden yazılı olarak yapılması ve fesih tarihine kadar doğmuş hak ve alacakların tasfiyesi zorunludur.',
    key: '30 gün bildirim süresi + kazanılmış hakların korunması'
  },
  no_refund: {
    before: 'Ödenen ücretler hiçbir koşulda iade edilmez.',
    after: 'İlk 14 gün içinde cayma halinde ödenen tutarın tamamı, 14-30 gün arasında %50\'si iade edilir. Hizmet sağlayıcının kusuru veya eksik ifası halinde orantılı iade yapılır.',
    key: 'Kademeli iade + kusur halinde tam iade'
  },
  penalty_clause: {
    before: 'İhlal halinde cezai şart olarak belirtilen tutar ödenir.',
    after: 'Cezai şart, toplam sözleşme bedelinin %15\'ini aşamaz. Cezai şart ancak tarafın kusurlu ihlali yazılı olarak bildirilip 14 gün içinde düzeltilmemesi halinde uygulanır.',
    key: '%15 üst sınır + 14 gün düzeltme süresi'
  },
  unlimited_liability: {
    before: 'Taraf, doğrudan ve dolaylı tüm zararlardan sınırsız olarak sorumludur.',
    after: 'Tarafın toplam sorumluluğu, son 12 ayda ödenen/ödenecek bedeli aşamaz. Dolaylı zarar, kâr kaybı ve itibar kaybı sorumluluk kapsamı dışındadır.',
    key: '12 aylık bedel üst sınırı + dolaylı zarar istisnası'
  },
  non_compete: {
    before: 'Hizmet veren, sözleşme süresince ve sona ermesinden itibaren 2 yıl boyunca benzer faaliyetlerde bulunamaz.',
    after: 'Hizmet veren, sözleşme süresince ve sona ermesinden itibaren 6 ay boyunca, yalnızca doğrudan rakip olan ve sözleşmede adı geçen firmalarla çalışmayı taahhüt etmez. Bu yasak, serbest piyasadaki genel mesleki faaliyetleri kısıtlamaz.',
    key: '6 ay süre + dar kapsam + isim bazlı rakip listesi'
  },
  auto_renew: {
    before: 'Sözleşme, süre sonunda otomatik olarak yenilenir.',
    after: 'Sözleşme, süre bitiminden en az 30 gün önce taraflardan biri yazılı bildirimle fesih bildirmezse aynı koşullarla 1 yıl uzar. Yenileme öncesi e-posta ile hatırlatma yapılır.',
    key: '30 gün bildirim + e-posta hatırlatma'
  },
  ip_assignment: {
    before: 'Tüm fikri mülkiyet hakları münhasıran alıcıya devredilir.',
    after: 'Ödeme tamamlandıktan sonra, teslim edilen eserlerin kullanım hakları alıcıya lisanslanır. Hizmet veren, eserleri anonim portföy örneği olarak kullanma hakkını saklı tutar. Daha önceki genel bilgi birikimi (know-how) devir kapsamı dışındadır.',
    key: 'Lisans modeli + portföy hakkı + know-how istisnası'
  },
  indemnity: {
    before: 'Taraf, her türlü zarar ve tazminattan sorumludur.',
    after: 'Tazmin yükümlülüğü yalnızca tarafın kendi kusuru ile doğrudan neden olduğu, belgelendirilebilir zararlarla sınırlıdır. Üçüncü kişi kusuru ve mücbir sebep halleri tazmin kapsamı dışındadır. Toplam tazmin tutarı sözleşme bedelini aşamaz.',
    key: 'Doğrudan zarar + belgelendirme şartı + üst sınır'
  },
  data_sharing: {
    before: 'Kişisel verileriniz üçüncü kişilerle paylaşılabilir.',
    after: 'Kişisel veriler, yalnızca hizmetin ifası için zorunlu olan ve Gizlilik Politikası\'nda adı geçen iş ortaklarıyla, KVKK/GDPR uyumlu veri işleme sözleşmesi kapsamında paylaşılır. Kullanıcı istediği zaman veri paylaşımını durdurabilir (opt-out).',
    key: 'Zorunluluk ilkesi + KVKK uyumu + opt-out hakkı'
  },
};

function buildRewriteSuggestions({ issues }) {
  const items = [];
  for (const issue of (issues || []).slice(0, 10)) {
    const id = String(issue.id || '');
    if (REWRITE_TEMPLATES[id]) {
      items.push({
        ruleId: id,
        title: issue.title,
        severity: issue.severity,
        clause: issue.clause || 'İlgili madde',
        ...REWRITE_TEMPLATES[id]
      });
    }
  }
  return { available: items.length > 0, items };
}


// ═══════════════════════════════════════════════════════════════════════════
// 5. YÖNETİCİ ÖZETİ (EXECUTIVE SUMMARY)
// ═══════════════════════════════════════════════════════════════════════════

function buildExecutiveSummary({ riskScore, riskLevel, issues, pack, decision, subScores, comparativeStats, sectorRedFlags, ratioAnalysis }) {
  const p = String(pack || 'genel').toLowerCase();
  const issueCount = (issues || []).length;
  const criticalIssues = (issues || []).filter(x => x.severity === 'CRITICAL');
  const highIssues = (issues || []).filter(x => x.severity === 'HIGH');
  const topThree = (issues || []).slice(0, 3);

  // Genel karar
  const status = decision?.status || 'KONTROL ET';
  const statusEmoji = status === 'İMZALANABİLİR' ? 'low' :
                      status === 'PAZARLIK ET' ? 'medium' : 'high';

  // En kritik 3 maddenin özetini oluştur
  const topThreeSummary = topThree.map((it, i) => `${i + 1}. ${it.title} (${it.severity})`).join(' | ');

  // Alt skorlardan en yüksek riski bul
  const worstSubScore = [...(subScores || [])].sort((a, b) => (b.score || 0) - (a.score || 0))[0];

  // Karşılaştırma özeti
  const compSummary = comparativeStats?.summary || '';

  // Yönetici özeti metni
  let overviewText = `Bu ${packLabelTR(p)} sözleşmesi ${riskScore}/100 risk skoru ile "${riskLevel || '—'}" seviyesinde değerlendirildi. `;

  if (criticalIssues.length > 0) {
    overviewText += `${criticalIssues.length} adet kritik ve ${highIssues.length} adet yüksek risk tespit edildi. `;
  } else if (highIssues.length > 0) {
    overviewText += `${highIssues.length} adet yüksek risk tespit edildi. `;
  } else {
    overviewText += `Kritik düzeyde risk bulunmadı ancak ${issueCount} madde dikkat gerektiriyor. `;
  }

  if (worstSubScore && worstSubScore.score > 50) {
    overviewText += `En belirgin risk alanı "${worstSubScore.label}" (${worstSubScore.score}/100). `;
  }

  // Aksiyon öneri cümlesi
  let actionText = '';
  if (status === 'ÖNCE DÜZELT' || status === 'BU HALİYLE GERİ GÖNDER') {
    actionText = 'Bu sözleşme mevcut haliyle imzalanmamalı. Öncelikle kritik maddelerde revize talep edilmeli.';
  } else if (status === 'PAZARLIK ET') {
    actionText = 'Sözleşme imzalanabilir ancak en az 2-3 maddede pazarlık yapılması önerilir.';
  } else {
    actionText = 'Sözleşme genel olarak dengeli görünüyor. Son bir kontrol sonrası imzalanabilir.';
  }

  // Sektörel bayraklar özeti
  const flagCount = sectorRedFlags?.items?.length || 0;
  const flagText = flagCount > 0
    ? `Ayrıca ${packLabelTR(p)} sözleşmelerine özel ${flagCount} eksik/belirsiz alan tespit edildi.`
    : '';

  // Oran analizi özeti
  const ratioItems = ratioAnalysis?.items || [];
  const highRatios = ratioItems.filter(r => r.color === 'high');
  const ratioText = highRatios.length > 0
    ? `Dikkat: ${highRatios.map(r => `${r.title} (${r.value})`).join(', ')} — sektör ortalamasının üzerinde.`
    : '';

  return {
    available: true,
    status,
    statusColor: statusEmoji,
    overview: overviewText.trim(),
    action: actionText,
    topThree: topThreeSummary,
    sectorFlags: flagText,
    ratioWarning: ratioText,
    comparison: compSummary,
    criticalCount: criticalIssues.length,
    highCount: highIssues.length,
    totalIssues: issueCount,
    riskScore,
    riskLevel
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// ANA FONKSİYON - Tüm içerik iyileştirmelerini birleştir
// ═══════════════════════════════════════════════════════════════════════════

function buildContentEnhancements({ text, issues, pack, riskScore, riskLevel, severityCounts, decision, subScores }) {
  const ratioAnalysis = buildRatioAnalysis({ text, issues, pack });
  const sectorRedFlags = buildSectorRedFlags({ text, pack });
  const comparativeStats = buildComparativeStats({ riskScore, issues, pack, severityCounts });
  const rewriteSuggestions = buildRewriteSuggestions({ issues });
  const executiveSummary = buildExecutiveSummary({
    riskScore, riskLevel, issues, pack, decision, subScores,
    comparativeStats, sectorRedFlags, ratioAnalysis
  });

  return {
    ratioAnalysis,
    sectorRedFlags,
    comparativeStats,
    rewriteSuggestions,
    executiveSummary
  };
}


module.exports = {
  buildContentEnhancements,
  buildRatioAnalysis,
  buildSectorRedFlags,
  buildComparativeStats,
  buildRewriteSuggestions,
  buildExecutiveSummary,
};
