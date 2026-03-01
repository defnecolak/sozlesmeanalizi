'use strict';

const { cancelPercent } = require('./eventSimulator');

const SEVERITY_ORDER = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

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

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function formatMoney(amount, currency = 'EUR') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const cur = String(currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n);
  } catch {
    const sym = cur === 'TRY' ? '₺' : cur === 'USD' ? '$' : '€';
    return `${sym}${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
  }
}

function severityValue(sev) {
  return SEVERITY_ORDER[String(sev || 'LOW').toUpperCase()] || 0;
}

function idealClauseFor(issue, pack) {
  const id = String(issue?.id || '');
  const cat = foldTR(issue?.category || '');

  const byId = {
    no_refund: 'Haklı fesih, ayıplı ifa veya karşı tarafın iptali halinde ödenen tutarların iadesi açıkça düzenlenmeli; iade takvimi en geç 7-14 gün içinde tanımlanmalı.',
    unlimited_liability: 'Toplam sorumluluk, ödenen veya ödenecek toplam bedelle sınırlanmalı; dolaylı zarar, kâr kaybı ve itibar kaybı kapsam dışında bırakılmalı.',
    indemnity: 'Tazmin yükümlülüğü yalnızca doğrudan, ispatlanabilir ve tarafın kendi kusurundan kaynaklanan zararlarla sınırlandırılmalı.',
    terminate_without_cause: 'Sebepsiz fesih hakkı varsa makul bildirim süresi ve fesih tarihine kadar doğmuş ücretlerin ödeneceği açıkça yazılmalı.',
    unilateral_change: 'Sözleşme değişiklikleri ancak karşılıklı yazılı onayla geçerli olmalı; tek taraflı değişiklik karşı tarafa cezasız fesih hakkı vermeli.',
    auto_renewal: 'Otomatik yenileme olacaksa en az 30 gün önceden açık bildirim yapılmalı ve kolay iptal imkanı verilmeli.',
    unilateral_price_increase: 'Ücret artışı ancak önceden açık bildirimle ve objektif kritere bağlı olarak yapılmalı; kabul edilmezse cezasız fesih hakkı tanınmalı.',
    broad_penalty: 'Cezai şart makul bir üst sınırla sınırlandırılmalı; yalnızca açık ihlal halinde ve ölçülü şekilde uygulanmalı.',
    assignment_unilateral: 'Devir ve alt yüklenici kullanımı karşı tarafın yazılı onayına bağlanmalı; sorumluluk zinciri açıkça gösterilmeli.',
    ip_assignment: 'Fikri hak devri gerekiyorsa kapsam, süre, bölge ve kullanım amacı açıkça yazılmalı; tam ve sınırsız devir yerine lisans tercih edilmeli.',
  };

  if (byId[id]) return byId[id];

  if (cat.includes('odeme') || cat.includes('iade')) {
    return 'Ödeme koşulları, vade, iade ve mahsup kuralları açık ve iki taraf için öngörülebilir olmalı; tek taraflı yorum alanı bırakılmamalı.';
  }
  if (cat.includes('fesih')) {
    return 'Fesih halinde bildirim süresi, o tarihe kadar doğmuş hak ve yükümlülükler ile varsa iade/mahsup mekanizması açıkça yazılmalı.';
  }
  if (cat.includes('sorumluluk')) {
    return 'Sorumluluk yalnızca doğrudan ve ispatlanabilir zararlarla sınırlandırılmalı; makul bir üst limit belirlenmeli.';
  }
  if (cat.includes('kapsam') || cat.includes('teslim')) {
    return 'Kapsam, teslim kriterleri, revizyon sayısı ve kabul mekanizması yazılı ve ölçülebilir olmalı.';
  }
  if (cat.includes('uyusmazlik') || cat.includes('yargi')) {
    return 'Uyuşmazlık çözümü, uygulanacak hukuk ve yetkili mahkeme dengeli ve açık şekilde belirlenmeli.';
  }
  if (pack === 'etkinlik') {
    return 'Etkinlik tarihi, kişi sayısı, iptal/erteleme ve tedarikçi sorumlulukları tek tek netleşmeli; sürpriz maliyet çıkaran ifadeler sınırlandırılmalı.';
  }
  return 'Madde, kapsamı ve taraf yükümlülükleri bakımından daha açık, dengeli ve ölçülü şekilde yeniden yazılmalı.';
}

function buildRedlinePlaybook({ issues = [], pack = 'genel' } = {}) {
  const ranked = [...issues]
    .sort((a, b) => {
      const sev = severityValue(b.severity) - severityValue(a.severity);
      if (sev) return sev;
      const pts = Number(b.scorePoints || 0) - Number(a.scorePoints || 0);
      if (pts) return pts;
      return Number(a.minIndex || 0) - Number(b.minIndex || 0);
    })
    .slice(0, 6);

  return ranked.map((it) => {
    const ask = Array.isArray(it.templates) && it.templates.length
      ? String(it.templates[0])
      : (it.redLine ? String(it.redLine) : 'Bu maddeyi daha dengeli hale getiren kısa bir revize talep edilmesi uygun olur.');
    return {
      clause: it.clause || 'İlgili madde',
      title: it.title,
      severity: it.severity,
      reason: it.why || '',
      ask,
      idealClause: idealClauseFor(it, pack),
      moneyImpact: it.moneyImpact || '',
    };
  });
}

function scoreToBand(points) {
  const p = Number(points || 0);
  if (p >= 65) return { label: 'yüksek', color: 'high' };
  if (p >= 35) return { label: 'orta', color: 'medium' };
  return { label: 'düşük', color: 'low' };
}

function categoryBucket(category) {
  const c = foldTR(category);
  if (/odeme|iade|ceza|iptal|yenileme|abonelik|fiyat/.test(c)) return 'financial';
  if (/sorumluluk|tazmin|mulk|devir|gizlilik|veri/.test(c)) return 'liability';
  if (/fesih|kapsam|teslim|degisiklik|değişiklik/.test(c)) return 'flexibility';
  if (/uyusmazlik|yargi|tutarlilik|belirsizlik/.test(c)) return 'ambiguity';
  return 'general';
}

function saturatingScore(points, k) {
  const p = Math.max(0, Number(points || 0));
  return Math.round(100 * (1 - Math.exp(-p / k)));
}

function buildSubscores({ issues = [], softWarnings = [], correctness = null } = {}) {
  const raw = {
    financial: 0,
    liability: 0,
    flexibility: 0,
    ambiguity: 0,
    correctness: 0,
  };

  for (const it of issues) {
    const pts = Math.max(0, Number(it.scorePoints || 0));
    const bucket = categoryBucket(it.category);
    if (bucket === 'general') {
      raw.financial += pts * 0.25;
      raw.liability += pts * 0.25;
      raw.flexibility += pts * 0.25;
      raw.ambiguity += pts * 0.25;
    } else {
      raw[bucket] += pts;
    }
  }

  for (const sw of softWarnings) {
    const pts = Math.max(0, Number(sw.points || 0));
    const cat = categoryBucket(sw.category);
    if (String(sw.category || '') === 'Tutarlılık' || String(sw.id || '').startsWith('pack_')) {
      raw.correctness += Math.max(4, pts || 4);
      raw.ambiguity += Math.max(2, pts * 0.5 || 2);
    } else if (cat === 'financial' || cat === 'liability' || cat === 'flexibility' || cat === 'ambiguity') {
      raw[cat] += Math.max(2, pts || 2);
    } else {
      raw.ambiguity += Math.max(2, pts || 2);
    }
  }

  if (correctness && correctness.status === 'DÜZELTİLMELİ') raw.correctness += 14;
  if (correctness && correctness.status === 'GÖZDEN GEÇİR') raw.correctness += 8;

  const items = [
    {
      key: 'financial',
      label: 'Finansal risk',
      score: saturatingScore(raw.financial, 26),
      summary: raw.financial >= 18 ? 'Bedel, iade, ceza veya ödeme yapısı bütçe üzerinde belirgin baskı kuruyor.' : 'Bedel ve ödeme tarafında sınırlı ama takip edilmesi gereken sinyaller var.'
    },
    {
      key: 'liability',
      label: 'Sorumluluk riski',
      score: saturatingScore(raw.liability, 22),
      summary: raw.liability >= 16 ? 'Sorumluluk/tazmin yükü geniş tutulmuş olabilir; üst sınır ve kapsam netleşmeli.' : 'Sorumluluk dili tamamen rahat değil ama kontrol edilebilir görünüyor.'
    },
    {
      key: 'flexibility',
      label: 'Esneklik riski',
      score: saturatingScore(raw.flexibility, 22),
      summary: raw.flexibility >= 16 ? 'Fesih, revizyon, değişiklik veya teslim mekanizması seni köşeye sıkıştırabilir.' : 'Esneklik alanı tamamen kapalı değil; yine de birkaç nokta pazarlık isteyebilir.'
    },
    {
      key: 'ambiguity',
      label: 'Belirsizlik riski',
      score: saturatingScore(raw.ambiguity, 18),
      summary: raw.ambiguity >= 14 ? 'Muğlak veya eksik kalan ifadeler sonradan yorum farkı doğurabilir.' : 'Metin nispeten anlaşılır; yine de bazı boşluklar var.'
    },
    {
      key: 'correctness',
      label: 'Doğruluk / tutarlılık',
      score: saturatingScore(raw.correctness, 14),
      summary: raw.correctness >= 12 ? 'Sözleşmenin konusu, taraf bilgileri veya şablon alanlarında bariz kontrol ihtiyacı var.' : 'Temel tutarlılık görünümü fena değil ama son kontrol yine önemli.'
    }
  ];

  return items;
}

function buildDecisionEngine({ riskScore = 0, correctness = null, subScores = [], issues = [], mitigation = null, reviewVerdict = null } = {}) {
  const corr = String(correctness?.status || '');
  const mitigationPoints = Number(mitigation?.points || 0);
  const highSeverity = (issues || []).filter((x) => ['CRITICAL', 'HIGH'].includes(String(x.severity || ''))).length;
  const strongest = [...subScores].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];

  let status = 'İMZALANABİLİR';
  let color = 'low';
  let summary = 'Bu metin kusursuz görünmüyor ama ana yükümlülükler daha yönetilebilir seviyede.';

  if (corr === 'DÜZELTİLMELİ') {
    status = 'ÖNCE DÜZELT';
    color = 'high';
    summary = 'Metnin kendisinde konu/taraf/boş alan gibi temel doğruluk sorunları var; bunlar düzelmeden imzaya gitmek doğru olmaz.';
  } else if (riskScore >= 70 || highSeverity >= 4) {
    status = 'BU HALİYLE GERİ GÖNDER';
    color = 'high';
    summary = 'Bu haliyle ticari yük ve yorum riski yüksek. İmza öncesi ciddi revizyon istemen daha mantıklı.';
  } else if (riskScore >= 38 || highSeverity >= 2 || corr === 'GÖZDEN GEÇİR') {
    status = 'PAZARLIK ET';
    color = 'medium';
    summary = 'Metin tamamen kötü görünmüyor; ama birkaç madde pazarlık edilmeden imzalanırsa gereksiz risk yaratabilir.';
  }

  if (status !== 'ÖNCE DÜZELT' && mitigationPoints >= 6 && riskScore < 45) {
    summary += ' Ayrıca metinde riski kısmen dengeleyen hükümler de var; bu yüzden en kötü senaryo gibi okunmamalı.';
  }

  const reasons = [];
  if (strongest) reasons.push(`${strongest.label} tarafı öne çıkıyor.`);
  if (corr && corr !== 'UYUMLU') reasons.push('Doğruluk / tutarlılık tarafında son kontrol gerektiren başlıklar var.');
  if (reviewVerdict?.actions?.length) reasons.push(...reviewVerdict.actions.slice(0, 2));

  const nextSteps = [];
  if (status === 'ÖNCE DÜZELT') {
    nextSteps.push('Önce konu, taraf, boş alan ve rakam tutarsızlıklarını revize ettir.');
    nextSteps.push('Aynı metin üzerinden sonra risk pazarlığına dön.');
  } else if (status === 'BU HALİYLE GERİ GÖNDER') {
    nextSteps.push('Önce en ağır 2–3 madde için yazılı revize iste.');
    nextSteps.push('Karşı taraf yumuşatmıyorsa bu haliyle imzalamamayı değerlendir.');
  } else if (status === 'PAZARLIK ET') {
    nextSteps.push('Bütçe, sorumluluk ve fesih maddelerini kısa bir revize metniyle geri gönder.');
    nextSteps.push('Mutlaka yazılı teyit al; telefonda konuşup bırakma.');
  } else {
    nextSteps.push('Son bir kez tarih, tutar ve taraf bilgilerini gözle kontrol et.');
    nextSteps.push('Mümkünse ana maddeler için e-posta teyidi al.');
  }

  return { status, color, summary, reasons: reasons.slice(0, 4), nextSteps: nextSteps.slice(0, 3) };
}

function extractBiggestMoney(text) {
  const t = String(text || '');
  const re = /(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)\s*(₺|TL|TRY|€|EUR|USD|\$)/g;
  let m;
  let best = null;
  while ((m = re.exec(t))) {
    const raw = String(m[1]).replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (!best || n > best.amount) best = { amount: n, currency: String(m[2] || '').toUpperCase() };
  }
  return best;
}

function extractFirstPercent(text) {
  const m = String(text || '').match(/%\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extractDaysWindow(text) {
  const m = foldTR(text).match(/(\d{1,3})\s*gun/);
  const n = m ? Number(m[1]) : null;
  return Number.isFinite(n) ? n : null;
}

function buildWhatIfScenarios({ pack = 'genel', text = '', issues = [], simulation = null, marketReview = null } = {}) {
  const p = String(pack || 'genel').toLowerCase();
  const items = [];
  const issueIds = new Set((issues || []).map((x) => String(x.id || '')));
  const biggestMoney = extractBiggestMoney(text);
  const firstPct = extractFirstPercent(text);
  const firstDays = extractDaysWindow(text);

  if (p === 'etkinlik' && simulation?.event?.available) {
    const ev = simulation.event;
    const pct60 = cancelPercent(ev.cancellationTable || [], 60);
    const pct30 = cancelPercent(ev.cancellationTable || [], 30);
    if (Number.isFinite(pct60)) {
      const total = Number(ev.total?.amount || 0);
      items.push({
        title: 'Etkinlikten 60 gün önce iptal',
        outcome: `${pct60}% civarı bir iptal bedeli tetiklenebilir${total ? ` (${formatMoney(total * (pct60 / 100), ev.total?.currency)})` : ''}.`,
        impact: pct60 >= 50 ? 'Yüksek maliyet' : 'Orta maliyet',
        why: 'Etkinlik sözleşmelerinde tarih yaklaştıkça mekanın hazırlık ve blokaj maliyeti yükselir.'
      });
    }
    if (Number.isFinite(pct30)) {
      items.push({
        title: 'Garanti kişiden daha az katılım olursa',
        outcome: 'Gerçek katılım düşse bile çoğu zaman minimum garanti kişi sayısı üzerinden faturalama devam eder.',
        impact: 'Minimum ödeme riski',
        why: 'Bu sözleşmeler genelde hazırlığı garanti sayı üzerinden yapar; düşüş her zaman iade doğurmaz.'
      });
    }
  }

  if (p === 'kredi') {
    items.push({
      title: 'Bir taksit gecikirse',
      outcome: issueIds.has('acceleration') || issueIds.has('muacceliyet')
        ? 'Muacceliyet devreye girerse kalan borcun tamamı bir anda istenebilir.'
        : 'Gecikme faizi ve masraf kalemleri toplam borcu beklenenden hızlı büyütebilir.',
      impact: 'Nakit akışı baskısı',
      why: 'Kredi metinlerinde tek gecikmenin tüm tabloyu büyütmesi sık görülür.'
    });
    if (firstPct) {
      items.push({
        title: 'Temerrüt faizi işlerse',
        outcome: `%${firstPct} civarı bir faiz/ceza dili varsa toplam yük her ay hissedilir şekilde artabilir.`,
        impact: 'Bileşik maliyet',
        why: 'Aylık oran küçük görünse de masraf + faiz birleşince tablo sertleşir.'
      });
    }
  }

  if (p === 'abonelik' || p === 'saas') {
    items.push({
      title: 'Fesih penceresi kaçırılırsa',
      outcome: issueIds.has('auto_renewal')
        ? 'Sözleşme yeni dönem için otomatik yenilenebilir ve çıkış maliyeti doğabilir.'
        : 'İptal süresi kısaysa yenileme istemeden yeni döneme taşınma riski oluşur.',
      impact: 'Ek dönem maliyeti',
      why: 'Abonelik ve SaaS metinlerinde asıl sürpriz çoğu zaman yenileme penceresinin kaçırılmasıdır.'
    });
    if (issueIds.has('unilateral_price_increase')) {
      items.push({
        title: 'Fiyat artışı gelirse',
        outcome: 'Önceden net itiraz/çıkış hakkı yoksa hizmeti sürdürmek için artışı kabul etmek zorunda kalabilirsin.',
        impact: 'Bütçe oynaklığı',
        why: 'Tek taraflı fiyat güncellemesi, özellikle uzun vadeli kullanımda toplam maliyeti büyütür.'
      });
    }
  }

  if (p === 'kira') {
    items.push({
      title: 'Süre dolmadan çıkmak istersen',
      outcome: 'Erken çıkışta depozito, kalan kira veya yeniden kiraya verene kadar sorumluluk tartışması çıkabilir.',
      impact: 'Çıkış maliyeti',
      why: 'Kira sözleşmelerinde asıl risk çoğu zaman erken tahliye senaryosunda görünür.'
    });
  }

  if (p === 'arac') {
    items.push({
      title: 'Araç hasarlı veya geç teslim edilirse',
      outcome: 'Depozito kesintisi, değer kaybı veya ek gün ücreti aynı anda istenebilir.',
      impact: 'Birleşik ücret riski',
      why: 'Araç metinlerinde kilometre, hasar ve teslim saati birlikte çalışır.'
    });
  }

  if (p === 'seyahat') {
    items.push({
      title: 'Seyahati iptal etmek zorunda kalırsan',
      outcome: 'Bilet/otel/iç hizmetler farklı iade rejimlerine sahip olabilir; bir kısmı iadesiz kalabilir.',
      impact: 'Parçalı iade riski',
      why: 'Tek bir rezervasyon gibi görünse de alt hizmetlerin iade kuralları farklı olabilir.'
    });
  }

  if (p === 'egitim') {
    items.push({
      title: 'Programa başladıktan sonra ayrılırsan',
      outcome: 'Ücret iadesi çok sınırlı olabilir; materyal ve kayıt bedeli kesintisi kalabilir.',
      impact: 'Kısmi iade',
      why: 'Eğitim sözleşmelerinde başlangıç sonrası iade çoğu zaman dar tutulur.'
    });
  }

  if (p === 'sigorta') {
    items.push({
      title: 'Hasar gerçekleşirse',
      outcome: 'Muafiyet, istisna veya ihbar süresi nedeniyle beklediğin kapsamın tamamı çalışmayabilir.',
      impact: 'Eksik teminat riski',
      why: 'Sigorta metinlerinde asıl fark, ödeme anında değil hasar anında ortaya çıkar.'
    });
  }

  if (p === 'hizmet' || p === 'influencer') {
    items.push({
      title: 'Kapsam sonradan büyürse',
      outcome: issueIds.has('unlimited_revisions')
        ? 'Sınırsız revizyon benzeri dil varsa aynı bedelle daha fazla iş çıkması riski yükselir.'
        : 'Kapsam yeterince net değilse ek işin ücretsizmiş gibi yorumlanması mümkün olabilir.',
      impact: 'Efor / süre kaybı',
      why: 'Hizmet sözleşmelerinde en pahalı sürpriz genelde ücretsiz ek iş olur.'
    });
  }

  if (p === 'satis') {
    items.push({
      title: 'Ayıplı mal / geç teslim olursa',
      outcome: 'İade, değişim veya indirim mekanizması net değilse çözüm tamamen yazışmalara kalabilir.',
      impact: 'Tahsilat ve teslim baskısı',
      why: 'Satış sözleşmelerinde teslim anı sonrası hakların ne kadar açık yazıldığı belirleyicidir.'
    });
  }

  if (p === 'gizlilik') {
    items.push({
      title: 'Bilgi yanlışlıkla üçüncü kişiye giderse',
      outcome: 'Gizlilik metni istisna ve sorumluluk sınırı içermiyorsa ihlal çok geniş yorumlanabilir.',
      impact: 'İhlal / tazmin baskısı',
      why: 'Gizlilik sözleşmelerinde sorun çoğu zaman bilgi sızdığında kapsamın ne kadar geniş yorumlandığıdır.'
    });
  }

  if (!items.length && biggestMoney) {
    items.push({
      title: 'Sözleşme çalışırsa ana yük nerede oluşur?',
      outcome: `Metindeki en belirgin parasal kalem yaklaşık ${formatMoney(biggestMoney.amount, biggestMoney.currency)} seviyesinde; asıl risk bu tutarın çevresinde oluşuyor olabilir.`,
      impact: 'Genel bütçe baskısı',
      why: 'Rakam görünüyorsa ilk kontrol, bu tutarın hangi şartlarda artabileceğidir.'
    });
  }

  return {
    available: items.length > 0,
    items: items.slice(0, 4)
  };
}

module.exports = {
  buildRedlinePlaybook,
  buildSubscores,
  buildDecisionEngine,
  buildWhatIfScenarios,
};
