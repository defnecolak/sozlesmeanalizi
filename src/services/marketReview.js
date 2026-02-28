'use strict';

const { cancelPercent } = require('./eventSimulator');

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.min(b, Math.max(a, x));
}

function fmtMoney(amount, currency) {
  if (!Number.isFinite(Number(amount))) return '—';
  const cur = currency || '';
  // Keep formatting simple (server has no locale certainty)
  const x = Math.round(Number(amount) * 100) / 100;
  return `${x.toLocaleString('tr-TR')}${cur ? ' ' + cur : ''}`;
}

function fmtPercent(p) {
  if (!Number.isFinite(Number(p))) return '—';
  const x = Math.round(Number(p) * 10) / 10;
  return `%${x.toLocaleString('tr-TR')}`;
}

function daysBetween(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return null;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function verdictForRange(value, low, high) {
  if (!Number.isFinite(Number(value))) return { verdict: 'belirsiz', tone: 'muted' };
  const v = Number(value);
  if (v < low) return { verdict: 'piyasaya göre düşük', tone: 'ok' };
  if (v <= high) return { verdict: 'piyasaya yakın', tone: 'ok' };
  if (v <= high * 1.3) return { verdict: 'sert', tone: 'warn' };
  return { verdict: 'piyasanın üstünde', tone: 'bad' };
}

function buildEventMarketReview(eventMeta) {
  if (!eventMeta || !eventMeta.available) {
    return { available: false };
  }

  const now = new Date();
  const eventDate = eventMeta.eventDate instanceof Date ? eventMeta.eventDate : null;
  const daysUntil = eventDate ? daysBetween(now, eventDate) : null;

  const total = eventMeta.total?.amount ?? null;
  const currency = eventMeta.total?.currency ?? eventMeta.total?.currency;

  // Payment schedule derived numbers
  let firstPayment = null;
  if (Array.isArray(eventMeta.paymentSchedule) && eventMeta.paymentSchedule.length) {
    const sorted = [...eventMeta.paymentSchedule].filter(p => p && p.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (sorted.length) firstPayment = Number(sorted[0].amount || 0) || null;
  }

  const depositPct = (Number.isFinite(Number(firstPayment)) && Number.isFinite(Number(total)) && Number(total) > 0)
    ? (Number(firstPayment) / Number(total)) * 100
    : null;

  // Cancellation percent snapshots (we don't assume 'today' is cancellation day)
  const pct90 = cancelPercent(eventMeta.cancellationTable, 90);
  const pct60 = cancelPercent(eventMeta.cancellationTable, 60);
  const pct30 = cancelPercent(eventMeta.cancellationTable, 30);
  const pct14 = cancelPercent(eventMeta.cancellationTable, 14);

  // Benchmarks are intentionally broad. This is a *sanity check*, not a price database.
  const cancelBench = {
    90: { low: 0, high: 35 },
    60: { low: 10, high: 50 },
    30: { low: 20, high: 70 },
    14: { low: 35, high: 100 }
  };

  const checks = [];

  // Per person – purely informational (market varies wildly)
  const perPerson = Number.isFinite(Number(eventMeta.perPersonVatIncl)) ? Number(eventMeta.perPersonVatIncl)
    : (Number.isFinite(Number(eventMeta.perPersonFromTotal)) ? Number(eventMeta.perPersonFromTotal) : null);

  if (Number.isFinite(Number(total))) {
    checks.push({
      label: 'Toplam bedel',
      value: fmtMoney(total, currency),
      verdict: 'bilgi',
      detail: 'Piyasa karşılaştırması için aynı tarihte/aynı segmentte 2–3 teklif toplamak en sağlıklı yöntem.'
    });
  }

  if (Number.isFinite(Number(perPerson))) {
    checks.push({
      label: 'Kişi başı fiyat (tahmini)',
      value: fmtMoney(perPerson, currency),
      verdict: 'bilgi',
      detail: 'Paket içeriği (menü, içecek, DJ, fotoğraf, servis, KDV) değiştikçe piyasa aralığı dramatik değişir. Burada sadece bölme hesabı var.'
    });
  }

  if (Number.isFinite(Number(firstPayment))) {
    const v = verdictForRange(depositPct, 10, 50);
    checks.push({
      label: 'İlk ödeme / kapora',
      value: `${fmtMoney(firstPayment, currency)} (${fmtPercent(depositPct)})`,
      verdict: v.verdict,
      detail: 'Etkinlik sözleşmelerinde kapora genelde toplamın bir kısmıdır. %50 üstü erken aşamada sıkı sayılabilir; ama sezon ve mekâna göre değişir.'
    });
  }

  const addCancel = (days, pct) => {
    if (!Number.isFinite(Number(pct))) return;
    const b = cancelBench[days];
    const v = verdictForRange(pct, b.low, b.high);
    checks.push({
      label: `İptal/cayma bedeli (${days} gün kala)`,
      value: fmtPercent(pct),
      verdict: v.verdict,
      detail: 'Yaklaştıkça oranların artması normaldir. Asıl kritik nokta: *ne zaman* hangi oran devreye giriyor ve ödenmiş taksitlere nasıl uygulanıyor.'
    });
  };

  addCancel(90, pct90);
  addCancel(60, pct60);
  addCancel(30, pct30);
  addCancel(14, pct14);

  if (Number.isFinite(Number(daysUntil))) {
    checks.push({
      label: 'Etkinliğe kalan süre',
      value: `${daysUntil} gün`,
      verdict: 'bilgi',
      detail: 'Piyasa kıyasını yaparken “kaç gün kala iptal” şartlarına özellikle bak. Aynı oran, farklı zaman penceresinde çok farklı anlama gelir.'
    });
  }

  // Interest / late fee (optional field)
  const interestMonthly = clamp(eventMeta.interestMonthly, 0, 100);
  if (Number.isFinite(Number(interestMonthly))) {
    const v = verdictForRange(interestMonthly, 0.5, 2.5);
    checks.push({
      label: 'Gecikme/temerrüt faizi (aylık)',
      value: fmtPercent(interestMonthly),
      verdict: v.verdict,
      detail: 'Aylık oranlar bileşik etki yaratır. Sözleşmede “faiz + masraf + avukatlık” gibi ek kalemler varsa ayrıca netleştirilmesi iyi olur.'
    });
  }

  return {
    available: true,
    summary: 'Bu bölüm, sözleşmedeki rakamları “piyasa açısından” kabaca bir mantık kontrolünden geçirir. Kesin piyasa verisi değildir.',
    checks,
    caveats: [
      'Piyasa; şehir, tarih, gün, sezon, mekan segmenti ve paket içeriğine göre çok değişir.',
      'En sağlıklı kıyas: aynı tarihte benzer 2–3 teklif + sözleşmedeki iptal ve ödeme takvimi kıyaslaması.'
    ]
  };
}

function buildGenericChecklist(packKey) {
  const byPack = {
    kira: [
      'Aynı bölgede benzer ilanlardan kira aralığına bak (metrekare/konum/yaş).',
      'Depozito genelde 1–2 kira civarında olur; 3+ ise pazarlık konusu olabilir.',
      'Aidat, demirbaş, bakım ve tahliye şartlarını netleştir.'
    ],
    hizmet: [
      'Aynı hizmet için 2–3 teklif al; kapsam ve teslimat kriterleri birebir aynı olsun.',
      'Gecikme cezası ile toplam bedel arasındaki oranı kontrol et (sınırsız ceza riskli).',
      'Ödeme planı ile teslim kilometre taşları uyumlu mu bak.'
    ],
    satis: [
      'Benzer ürün/hizmet fiyatlarını (aynı garanti/servis şartlarıyla) kıyasla.',
      'İade/garanti/servis sürelerini rakiplerle kıyasla.',
      'Teslim/hasar riski hangi anda kime geçiyor netleştir.'
    ],
    abonelik: [
      'İptal/taahhüt/otomatik yenileme şartlarını rakiplerle kıyasla.',
      'Fiyat artışı maddesi var mı; varsa frekansı ve üst sınırı var mı bak.',
      'Kapsam dışı ücretler (kurulum, kullanım aşımı) var mı kontrol et.'
    ],
    gizlilik: [
      'Gizli bilgi tanımı çok geniş mi; süre ve istisnalar (kamuya açık bilgi) var mı bak.',
      'Ceza şartı varsa üst sınır (cap) istemek piyasa pratiğidir.',
      'Yetkili mahkeme ve delil şartları makul mü kontrol et.'
    ],
    ortaklik: [
      'Benzer ortaklıklarda pay, vesting ve çıkış şartlarını emsal örneklerle kıyasla.',
      'Yönetim/oy hakları ile finansal yükümlülükler dengeli mi bak.',
      'Uyuşmazlık çözümü ve ayrılma senaryolarını netleştir.'
    ],
    is: [
      'Ücret, fazla mesai, yan haklar ve prim/bonus koşullarını benzer rollerde kıyasla.',
      'Rekabet yasağı ve cezaları varsa süre/alan makul mü kontrol et.',
      'Performans hedefleri ölçülebilir mi; fesih şartları adil mi bak.'
    ]
  };

  const bullets = byPack[packKey] || [
    'Benzer sözleşme örnekleri ve 2–3 alternatif teklif ile koşulları kıyasla.',
    'Toplam maliyet ve ek ücret kalemlerini (ceza, faiz, masraf) ayrı ayrı kontrol et.',
    'İptal/çıkış senaryolarını yazılı netleştir.'
  ];

  return {
    available: true,
    summary: 'Bu tür sözleşmelerde piyasa kıyası için hızlı kontrol listesi:',
    checks: bullets.map((b) => ({ label: 'Kontrol', value: b, verdict: 'bilgi' })),
    caveats: ['Bu liste genel amaçlıdır; sektöre göre değişir.']
  };
}

function marketReviewForPack(packKey, meta) {
  if (packKey === 'etkinlik') return buildEventMarketReview(meta);
  return buildGenericChecklist(packKey);
}

module.exports = {
  marketReviewForPack
};
