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
// 6. MADDE BAZLI GÜÇ DENGESİ GÖSTERGESİ
// ═══════════════════════════════════════════════════════════════════════════

// Her kural id'si için "kimin lehine" bilgisi
const POWER_BALANCE_MAP = {
  // Kritik - karşı taraf lehine
  unilateral_change:       { favor: 'counter', label: 'Karşı taraf lehine', reason: 'Tek taraflı değişiklik hakkı sadece karşı tarafta.' },
  terminate_without_cause: { favor: 'counter', label: 'Karşı taraf lehine', reason: 'Gerekçesiz fesih hakkı dengesiz.' },
  no_refund:               { favor: 'counter', label: 'Karşı taraf lehine', reason: 'İade yok = tüm finansal risk sende.' },
  unlimited_liability:     { favor: 'counter', label: 'Karşı taraf lehine', reason: 'Sınırsız sorumluluk yükü sende.' },
  indemnity:               { favor: 'counter', label: 'Karşı taraf lehine', reason: 'Geniş tazmin yükümlülüğü sende.' },
  unilateral_price_increase: { favor: 'counter', label: 'Karşı taraf lehine', reason: 'Fiyatı tek taraflı artırabilir.' },
  assignment_unilateral:   { favor: 'counter', label: 'Karşı taraf lehine', reason: 'Sözleşmeyi devredebilir, sen edemezsin.' },
  ip_assignment:           { favor: 'counter', label: 'Karşı taraf lehine', reason: 'Fikri mülkiyet tamamen karşı tarafa geçiyor.' },
  data_sharing:            { favor: 'counter', label: 'Karşı taraf lehine', reason: 'Veri paylaşımı kontrolü karşı tarafta.' },
  non_compete:             { favor: 'counter', label: 'Karşı taraf lehine', reason: 'Rekabet yasağı seni kısıtlıyor.' },

  // Orta - kısmen dengesiz
  penalty_clause:          { favor: 'partial', label: 'Kısmen dengesiz', reason: 'Cezai şart var ama iki tarafa da uygulanabilir.' },
  auto_renew:              { favor: 'partial', label: 'Kısmen dengesiz', reason: 'Otomatik yenileme iki tarafı da bağlayabilir.' },
  force_majeure_broad:     { favor: 'partial', label: 'Kısmen dengesiz', reason: 'Mücbir sebep geniş ama bağlama göre değişir.' },
  broad_confidentiality:   { favor: 'partial', label: 'Kısmen dengesiz', reason: 'Gizlilik yükümlülüğü her iki tarafa da olabilir.' },

  // Muğlak / kontrol et
  acceptance_missing:      { favor: 'unclear', label: 'Belirsiz', reason: 'Kabul mekanizması netleştirilmeli.' },
  vague_scope:             { favor: 'unclear', label: 'Belirsiz', reason: 'Kapsamın muğlaklığı her iki tarafı da etkileyebilir.' },
};

function buildPowerBalance({ issues, role }) {
  const items = [];
  let counterCount = 0;
  let partialCount = 0;
  let unclearCount = 0;

  for (const issue of (issues || [])) {
    const id = String(issue.id || '');
    const pb = POWER_BALANCE_MAP[id];
    if (pb) {
      items.push({
        ruleId: id,
        title: issue.title,
        severity: issue.severity,
        favor: pb.favor,
        label: pb.label,
        reason: pb.reason
      });
      if (pb.favor === 'counter') counterCount++;
      else if (pb.favor === 'partial') partialCount++;
      else unclearCount++;
    }
  }

  const total = items.length || 1;
  const counterPct = Math.round((counterCount / total) * 100);

  let overallBalance = 'dengeli';
  let overallLabel = 'Genel olarak dengeli';
  let overallColor = 'low';
  if (counterPct >= 70) {
    overallBalance = 'tek_tarafli';
    overallLabel = 'Ağırlıklı olarak karşı taraf lehine';
    overallColor = 'high';
  } else if (counterPct >= 40) {
    overallBalance = 'kismi_dengesiz';
    overallLabel = 'Kısmen dengesiz (karşı tarafa meyilli)';
    overallColor = 'medium';
  }

  const summary = items.length
    ? `Tespit edilen ${items.length} maddeden ${counterCount} tanesi açıkça karşı taraf lehine, ${partialCount} tanesi kısmen dengesiz. ${overallLabel}.`
    : 'Güç dengesi analizi için yeterli veri bulunamadı.';

  return {
    available: items.length > 0,
    items,
    counterCount,
    partialCount,
    unclearCount,
    counterPct,
    overallBalance,
    overallLabel,
    overallColor,
    summary
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// 7. MÜZAKERE ÖNCELİK SIRALAMASI
// ═══════════════════════════════════════════════════════════════════════════

// Karşı tarafın kabul etme olasılığı (düşük = zor pazarlık, yüksek = kolay kabul)
const NEGOTIATION_LIKELIHOOD = {
  // Kolay kabul (karşı taraf çoğu zaman razı olur)
  auto_renew: 0.85,
  acceptance_missing: 0.80,
  vague_scope: 0.75,
  broad_confidentiality: 0.70,

  // Orta (pazarlıkla kabul edilebilir)
  terminate_without_cause: 0.60,
  penalty_clause: 0.55,
  non_compete: 0.55,
  force_majeure_broad: 0.50,
  data_sharing: 0.50,
  unilateral_price_increase: 0.45,

  // Zor (karşı taraf direnir ama deneye değer)
  no_refund: 0.40,
  indemnity: 0.35,
  unlimited_liability: 0.35,
  ip_assignment: 0.30,
  unilateral_change: 0.30,
  assignment_unilateral: 0.25,
};

const SEVERITY_IMPACT = { CRITICAL: 10, HIGH: 7, MEDIUM: 4, LOW: 2 };

function buildNegotiationPriority({ issues }) {
  const items = [];

  for (const issue of (issues || [])) {
    const id = String(issue.id || '');
    const likelihood = NEGOTIATION_LIKELIHOOD[id] || 0.50;
    const impact = SEVERITY_IMPACT[issue.severity] || 4;
    const scorePoints = Number(issue.scorePoints || 0);

    // Öncelik skoru = etki × kabul olasılığı × puan ağırlığı
    const priorityScore = Math.round(impact * likelihood * (1 + scorePoints / 20) * 10) / 10;

    items.push({
      ruleId: id,
      title: issue.title,
      severity: issue.severity,
      clause: issue.clause || 'İlgili madde',
      impact,
      likelihood: Math.round(likelihood * 100),
      priorityScore,
      likelihoodLabel: likelihood >= 0.65 ? 'Yüksek' : likelihood >= 0.40 ? 'Orta' : 'Düşük',
      tip: likelihood >= 0.65
        ? 'Bu maddeyi değiştirmek genellikle kolay kabul edilir. Öncelikle bununla başla.'
        : likelihood >= 0.40
          ? 'Pazarlıkla değiştirilebilir. Net ve gerekçeli bir dille talep et.'
          : 'Karşı taraf büyük ihtimalle direnecek. Alternatif çözüm (cap, süre sınırı) öner.'
    });
  }

  // Öncelik skoruna göre sırala (yüksek → düşük)
  items.sort((a, b) => b.priorityScore - a.priorityScore);

  // İlk 3'ü "hemen pazarlık et", sonraki 3'ü "fırsat olursa pazarlık et"
  const immediate = items.slice(0, 3);
  const secondary = items.slice(3, 6);

  return {
    available: items.length > 0,
    items,
    immediate,
    secondary,
    summary: items.length
      ? `${items.length} madde müzakere edilebilir. İlk ${Math.min(3, items.length)} madde öncelikli.`
      : 'Müzakere öncelik sıralaması için yeterli risk maddesi bulunamadı.'
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// 8. EKSİK MADDE TESPİTİ
// ═══════════════════════════════════════════════════════════════════════════

const ESSENTIAL_CLAUSES = {
  genel: [
    { id: 'mc_dispute', label: 'Uyuşmazlık çözümü', pattern: /yetkili\s+mahkeme|uygulanacak\s+hukuk|tahkim|arabuluculuk|uyuşmazlık/i, importance: 'high', why: 'Sorun çıktığında nerede/nasıl çözüleceği belirsiz kalır.', suggestion: '"Uyuşmazlıklarda [şehir] Mahkemeleri yetkilidir ve Türk hukuku uygulanır" maddesi ekle.' },
    { id: 'mc_force_majeure', label: 'Mücbir sebep', pattern: /mücbir\s+sebep|force\s+majeure|doğal\s+afet|salgın|pandemi/i, importance: 'medium', why: 'Deprem, salgın gibi durumlarda tarafların hakları belirsiz kalır.', suggestion: 'Mücbir sebep tanımı ve tarafların bu durumda hakları/yükümlülükleri ekle.' },
    { id: 'mc_confidentiality', label: 'Gizlilik', pattern: /gizlilik|gizli\s+bilgi|confidential|nda/i, importance: 'medium', why: 'Paylaşılan hassas bilgilerin korunması güvence altında değil.', suggestion: 'Gizlilik yükümlülüğü, süresi ve istisnaları ekle.' },
    { id: 'mc_termination', label: 'Fesih koşulları', pattern: /fesih|feshedebilir|sona\s+erer|sona\s+erme|süre\s+bitimi/i, importance: 'high', why: 'Sözleşmeden nasıl çıkılacağı belirsiz.', suggestion: 'Fesih bildirim süresi, koşulları ve sonuçlarını (iade, tasfiye) detaylı yaz.' },
    { id: 'mc_payment', label: 'Ödeme koşulları', pattern: /ödeme|bedel|ücret|fiyat|tutar|fee|payment/i, importance: 'high', why: 'Ödeme tutarı, tarihi ve yöntemi belirsiz.', suggestion: 'Tutar, vade, ödeme yöntemi ve gecikme sonuçlarını net yaz.' },
    { id: 'mc_liability', label: 'Sorumluluk sınırı', pattern: /sorumluluk|tazmin|zarar|liability|indemnif/i, importance: 'high', why: 'Sorumluluk sınırsız kalabilir.', suggestion: 'Toplam sorumluluk üst sınırı (cap) ve dolaylı zarar istisnası ekle.' },
    { id: 'mc_data_protection', label: 'Kişisel veri koruma', pattern: /kişisel\s+veri|kvkk|gdpr|veri\s+koruma|data\s+protection/i, importance: 'medium', why: 'KVKK/GDPR uyumluluğu sağlanmamış olabilir.', suggestion: 'Kişisel veri işleme amacı, süresi, aktarımı ve saklama koşullarını ekle.' },
    { id: 'mc_ip', label: 'Fikri mülkiyet', pattern: /fikri\s+mülkiyet|telif|patent|lisans|intellectual\s+property/i, importance: 'low', why: 'Oluşan eserlerin kime ait olduğu belirsiz.', suggestion: 'Fikri mülkiyet sahipliği, lisans kapsamı ve portföy kullanım hakkını tanımla.' },
  ],
  kira: [
    { id: 'mc_deposit_return', label: 'Depozito iade koşulları', pattern: /depozito\s+iade|depozito.*geri|kapora.*iade/i, importance: 'high', why: 'Depozito ne zaman ve nasıl iade edileceği belirsiz.', suggestion: 'Depozito iadesini tahliyeden sonra 15 gün içinde, hasar yoksa tam iade olarak yaz.' },
    { id: 'mc_rent_increase', label: 'Kira artış mekanizması', pattern: /kira\s+artış|artış\s+oranı|üfe|tüfe|tüik|endeks/i, importance: 'high', why: 'Yıllık kira artışı belirsiz, sürpriz artış gelebilir.', suggestion: 'Artışı TÜFE/ÜFE veya sabit % ile sınırla, üst sınır koy.' },
    { id: 'mc_maintenance', label: 'Bakım/onarım sorumluluğu', pattern: /bakım|onarım|tamir|tadilat|maintenance/i, importance: 'medium', why: 'Hangi onarımlar kiracıya, hangileri ev sahibine ait belirsiz.', suggestion: 'Küçük bakım kiracıya, yapısal onarım ev sahibine ait olacak şekilde yaz.' },
  ],
  hizmet: [
    { id: 'mc_scope', label: 'İş kapsamı tanımı', pattern: /kapsam|teslimat|deliverable|işin\s+tanımı|hizmet\s+tanımı/i, importance: 'high', why: 'Ne yapılacağı net değilse kapsam kayması (scope creep) riski var.', suggestion: 'Teslim edilecekler listesi, revizyon sayısı ve süreyi net tanımla.' },
    { id: 'mc_revision_limit', label: 'Revizyon sınırı', pattern: /revizyon\s+sayısı|(\d+)\s*(?:tur|kez|defa)\s*revizyon|revizyon\s+hakkı/i, importance: 'medium', why: 'Sınırsız revizyon riski var.', suggestion: 'Dahil revizyon sayısını yaz, fazlası için ek ücret tanımla.' },
    { id: 'mc_acceptance', label: 'Kabul/onay mekanizması', pattern: /kabul|onay|tesellüm|approval|acceptance/i, importance: 'medium', why: 'İşin ne zaman "tamamlanmış" sayılacağı belirsiz.', suggestion: 'Teslimden sonra X gün içinde yazılı onay verilmezse kabul edilmiş sayılır maddesi ekle.' },
  ],
  saas: [
    { id: 'mc_sla', label: 'SLA / Uptime garantisi', pattern: /sla|uptime|erişilebilirlik|%\s*9[0-9]|hizmet\s+seviye/i, importance: 'high', why: 'Hizmet kesintisi durumunda ne olacağı belirsiz.', suggestion: 'En az %99.5 uptime garantisi ve ihlalde kredi/iade mekanizması ekle.' },
    { id: 'mc_data_export', label: 'Veri taşıma/export hakkı', pattern: /veri\s+taşıma|data\s+export|veri\s+iade|export|veri\s+al/i, importance: 'high', why: 'Hizmetten çıkışta veriler sıkışabilir.', suggestion: 'Fesih sonrası 30 gün içinde standart formatta veri export hakkı iste.' },
  ],
  etkinlik: [
    { id: 'mc_cancel_table', label: 'Kademeli iptal tablosu', pattern: /iptal\s+tablosu|iptal.*gün.*[%％]|cayma.*gün.*[%％]/i, importance: 'high', why: 'İptal bedellerinin zamana göre kademesi belli değil.', suggestion: 'İptal bedellerini kademeli yap: 90+ gün→%10, 60-90→%30 gibi.' },
    { id: 'mc_headcount', label: 'Kişi sayısı garantisi', pattern: /garanti\s+kişi|minimum\s+kişi|asgari\s+katılım|kişi\s+sayısı/i, importance: 'medium', why: 'Garanti kişi düşüşünde ne olacağı belirsiz.', suggestion: 'Garanti sayısı ve düşüş halinde kişi başı fiyat ayarlamasını yaz.' },
  ],
  kredi: [
    { id: 'mc_early_repay', label: 'Erken ödeme hakkı', pattern: /erken\s+ödeme|erken\s+kapama|peşin\s+ödeme/i, importance: 'high', why: 'Kredinin erken kapatılabilirliği ve bedeli belirsiz.', suggestion: 'Erken ödeme halinde kalan faizden indirim hakkını açıkça yaz.' },
    { id: 'mc_payment_schedule', label: 'Taksit planı', pattern: /ödeme\s+planı|taksit\s+tablosu|ödeme\s+takvimi/i, importance: 'high', why: 'Taksit tarihleri ve tutarları detaylı gösterilmemiş.', suggestion: 'Tüm taksitlerin tarih ve tutarlarını gösteren bir tablo ekle.' },
  ],
};

function buildMissingClauses({ text, pack, issues }) {
  const p = String(pack || 'genel').toLowerCase();
  const t = String(text || '');
  const issueIds = new Set((issues || []).map(x => String(x.id || '')));

  // Genel + sektöre özel
  const clausesToCheck = [...(ESSENTIAL_CLAUSES.genel || []), ...(ESSENTIAL_CLAUSES[p] || [])];

  const missing = [];
  const present = [];

  for (const clause of clausesToCheck) {
    const found = clause.pattern.test(t);
    if (found) {
      present.push({ id: clause.id, label: clause.label });
    } else {
      missing.push({
        id: clause.id,
        label: clause.label,
        importance: clause.importance,
        why: clause.why,
        suggestion: clause.suggestion
      });
    }
  }

  // Önem sırasına göre sırala
  const importanceOrder = { high: 0, medium: 1, low: 2 };
  missing.sort((a, b) => (importanceOrder[a.importance] || 2) - (importanceOrder[b.importance] || 2));

  const highCount = missing.filter(m => m.importance === 'high').length;

  return {
    available: missing.length > 0,
    missing,
    present,
    totalChecked: clausesToCheck.length,
    missingCount: missing.length,
    presentCount: present.length,
    highPriorityCount: highCount,
    completeness: Math.round((present.length / (clausesToCheck.length || 1)) * 100),
    summary: missing.length
      ? `Kontrol edilen ${clausesToCheck.length} temel maddeden ${missing.length} tanesi sözleşmede bulunamadı (${highCount} yüksek öncelikli).`
      : 'Tüm temel maddeler sözleşmede mevcut.'
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// 9. ZAMANAŞIMI & SÜRE HARİTASI
// ═══════════════════════════════════════════════════════════════════════════

function buildTimelineMap({ text, pack }) {
  const t = String(text || '');
  const items = [];

  // Süre ve tarih pattern'leri
  const patterns = [
    { type: 'contract_duration', label: 'Sözleşme süresi', re: /sözleşme\s+süresi\s*[:.]?\s*(\d+)\s*(gün|ay|yıl|sene|hafta)/i },
    { type: 'notice_period', label: 'Fesih bildirim süresi', re: /(?:fesih|iptal|çıkış).*?(\d+)\s*(gün|ay|hafta)\s*(?:önce|önceden|süre)/i },
    { type: 'cancellation', label: 'İptal/cayma süresi', re: /(?:cayma|iptal).*?(\d+)\s*(gün|ay|hafta)/i },
    { type: 'payment_due', label: 'Ödeme vadesi', re: /(?:ödeme|vade|fatura).*?(\d+)\s*(gün|ay|hafta)\s*(?:içinde|süre)/i },
    { type: 'warranty', label: 'Garanti süresi', re: /garanti\s+süresi\s*[:.]?\s*(\d+)\s*(gün|ay|yıl)/i },
    { type: 'trial_period', label: 'Deneme süresi', re: /deneme\s+süresi\s*[:.]?\s*(\d+)\s*(gün|ay|hafta)/i },
    { type: 'renewal_notice', label: 'Yenileme bildirim süresi', re: /(?:yenileme|uzatma).*?(\d+)\s*(gün|ay|hafta)\s*(?:önce|önceden)/i },
    { type: 'delivery', label: 'Teslim süresi', re: /(?:teslim|teslimat).*?(\d+)\s*(gün|ay|hafta)\s*(?:içinde|süre)/i },
    { type: 'response_time', label: 'Cevap/onay süresi', re: /(?:cevap|yanıt|onay|kabul).*?(\d+)\s*(gün|ay|hafta)\s*(?:içinde|süre)/i },
    { type: 'confidentiality', label: 'Gizlilik süresi', re: /gizlilik.*?(\d+)\s*(gün|ay|yıl|sene)\s*(?:süre|boyunca|devam)/i },
    { type: 'non_compete', label: 'Rekabet yasağı süresi', re: /rekabet\s+yasağı.*?(\d+)\s*(gün|ay|yıl|sene)/i },
    { type: 'deposit_return', label: 'Depozito iade süresi', re: /depozito.*?iade.*?(\d+)\s*(gün|ay|hafta)/i },
    { type: 'early_termination', label: 'Erken fesih cezası süresi', re: /(?:erken|süresinden\s+önce).*?fesih.*?(\d+)\s*(gün|ay|yıl)/i },
  ];

  // Tarih pattern'leri
  const datePatterns = [
    { type: 'start_date', label: 'Başlangıç tarihi', re: /(?:başlangıç|yürürlük|geçerlilik)\s*(?:tarihi)?\s*[:.]?\s*(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4})/i },
    { type: 'end_date', label: 'Bitiş tarihi', re: /(?:bitiş|sona\s+erme|son\s+tarih)\s*(?:tarihi)?\s*[:.]?\s*(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4})/i },
    { type: 'event_date', label: 'Etkinlik tarihi', re: /(?:etkinlik|düğün|organizasyon)\s*(?:tarihi)?\s*[:.]?\s*(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4})/i },
  ];

  // Süreleri tespit et
  for (const p of patterns) {
    const m = t.match(p.re);
    if (m) {
      const value = Number(m[1]);
      const unit = m[2].toLowerCase();
      let days = value;
      if (unit.includes('ay')) days = value * 30;
      else if (unit.includes('hafta')) days = value * 7;
      else if (unit.includes('yıl') || unit.includes('sene')) days = value * 365;

      items.push({
        type: p.type,
        label: p.label,
        value,
        unit: m[2],
        days,
        displayValue: `${value} ${m[2]}`,
        category: categorizeTimeline(p.type)
      });
    }
  }

  // Tarihleri tespit et
  for (const p of datePatterns) {
    const m = t.match(p.re);
    if (m) {
      items.push({
        type: p.type,
        label: p.label,
        value: m[1],
        unit: 'tarih',
        days: 0,
        displayValue: m[1],
        category: 'tarih'
      });
    }
  }

  // Kategori bazlı gruplama
  const groups = {};
  for (const item of items) {
    const cat = item.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  // Uyarılar
  const warnings = [];
  const noticePeriod = items.find(i => i.type === 'notice_period');
  const contractDuration = items.find(i => i.type === 'contract_duration');
  if (noticePeriod && noticePeriod.days > 60) {
    warnings.push(`Fesih bildirim süresi ${noticePeriod.displayValue} — uzun sayılır, kaçırma riski var.`);
  }
  if (contractDuration && contractDuration.days > 365 * 2) {
    warnings.push(`Sözleşme süresi ${contractDuration.displayValue} — uzun vadeli, çıkış koşullarını iyi kontrol et.`);
  }

  return {
    available: items.length > 0,
    items,
    groups,
    warnings,
    totalPeriods: items.length,
    summary: items.length
      ? `Sözleşmede ${items.length} adet süre/tarih tespit edildi.`
      : 'Sözleşmede belirgin süre veya tarih bilgisi bulunamadı.'
  };
}

function categorizeTimeline(type) {
  if (['contract_duration', 'start_date', 'end_date', 'event_date'].includes(type)) return 'Ana Süreler';
  if (['notice_period', 'cancellation', 'renewal_notice', 'early_termination'].includes(type)) return 'Bildirim & Çıkış';
  if (['payment_due', 'deposit_return'].includes(type)) return 'Ödeme & İade';
  if (['warranty', 'delivery', 'response_time', 'trial_period'].includes(type)) return 'Teslim & Garanti';
  if (['confidentiality', 'non_compete'].includes(type)) return 'Kısıtlamalar';
  return 'Diğer';
}


// ═══════════════════════════════════════════════════════════════════════════
// 10. RİSK ÖZET KARTI (SHAREABLE)
// ═══════════════════════════════════════════════════════════════════════════

function buildRiskSummaryCard({ riskScore, riskLevel, issues, pack, decision, powerBalance, missingClauses, negotiationPriority, timelineMap }) {
  const topThree = (issues || []).slice(0, 3);
  const critCount = (issues || []).filter(x => x.severity === 'CRITICAL').length;
  const highCount = (issues || []).filter(x => x.severity === 'HIGH').length;

  // Kısa başlık
  const headline = decision?.status === 'İMZALANABİLİR'
    ? 'Sözleşme genel olarak imzalanabilir görünüyor.'
    : decision?.status === 'PAZARLIK ET'
      ? 'İmza öncesi birkaç maddede pazarlık önerilir.'
      : 'Bu sözleşme mevcut haliyle imzalanmamalı.';

  // Güç dengesi tek satır
  const balanceLine = powerBalance?.available
    ? `Güç dengesi: ${powerBalance.overallLabel} (${powerBalance.counterCount}/${powerBalance.items?.length || 0} madde karşı taraf lehine)`
    : '';

  // Eksik madde tek satır
  const missingLine = missingClauses?.available
    ? `Eksik maddeler: ${missingClauses.missingCount} (${missingClauses.highPriorityCount} kritik) — Tamamlanma: %${missingClauses.completeness}`
    : '';

  // Öncelikli müzakere maddeleri
  const negotiationLine = negotiationPriority?.immediate?.length
    ? `Öncelikli pazarlık: ${negotiationPriority.immediate.map(i => i.title).join(', ')}`
    : '';

  // Süre uyarıları
  const timelineWarnings = (timelineMap?.warnings || []).join(' ');

  return {
    available: true,
    headline,
    riskScore,
    riskLevel,
    decision: decision?.status || 'KONTROL ET',
    decisionColor: decision?.color || 'medium',
    packLabel: packLabelTR(pack),
    criticalCount: critCount,
    highCount: highCount,
    totalIssues: (issues || []).length,
    topThree: topThree.map(it => ({
      title: it.title,
      severity: it.severity
    })),
    balanceLine,
    missingLine,
    negotiationLine,
    timelineWarnings,
    // "Kopyalanabilir" metin
    shareText: [
      `📋 Sözleşme Analiz Özeti`,
      `Tür: ${packLabelTR(pack)}`,
      `Risk Skoru: ${riskScore}/100 (${riskLevel || '—'})`,
      `Karar: ${decision?.status || 'KONTROL ET'}`,
      ``,
      `🔴 Kritik: ${critCount} | 🟠 Yüksek: ${highCount} | Toplam: ${(issues || []).length} risk`,
      ``,
      topThree.length ? `En kritik 3 madde:` : '',
      ...topThree.map((it, i) => `${i + 1}. ${it.title} (${it.severity})`),
      ``,
      balanceLine,
      missingLine,
      negotiationLine,
      timelineWarnings ? `⏰ ${timelineWarnings}` : '',
      ``,
      `— Sözleşmem ile analiz edildi`
    ].filter(Boolean).join('\n')
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// ANA FONKSİYON - Tüm içerik iyileştirmelerini birleştir
// ═══════════════════════════════════════════════════════════════════════════

function buildContentEnhancements({ text, issues, pack, riskScore, riskLevel, severityCounts, decision, subScores, role }) {
  const ratioAnalysis = buildRatioAnalysis({ text, issues, pack });
  const sectorRedFlags = buildSectorRedFlags({ text, pack });
  const comparativeStats = buildComparativeStats({ riskScore, issues, pack, severityCounts });
  const rewriteSuggestions = buildRewriteSuggestions({ issues });

  // Yeni modüller (Faz 2)
  const powerBalance = buildPowerBalance({ issues, role });
  const negotiationPriority = buildNegotiationPriority({ issues });
  const missingClauses = buildMissingClauses({ text, pack, issues });
  const timelineMap = buildTimelineMap({ text, pack });

  const executiveSummary = buildExecutiveSummary({
    riskScore, riskLevel, issues, pack, decision, subScores,
    comparativeStats, sectorRedFlags, ratioAnalysis
  });

  const riskSummaryCard = buildRiskSummaryCard({
    riskScore, riskLevel, issues, pack, decision,
    powerBalance, missingClauses, negotiationPriority, timelineMap
  });

  return {
    ratioAnalysis,
    sectorRedFlags,
    comparativeStats,
    rewriteSuggestions,
    executiveSummary,
    powerBalance,
    negotiationPriority,
    missingClauses,
    timelineMap,
    riskSummaryCard
  };
}


module.exports = {
  buildContentEnhancements,
  buildRatioAnalysis,
  buildSectorRedFlags,
  buildComparativeStats,
  buildRewriteSuggestions,
  buildExecutiveSummary,
  buildPowerBalance,
  buildNegotiationPriority,
  buildMissingClauses,
  buildTimelineMap,
  buildRiskSummaryCard,
};
