'use strict';

const { cancelPercent } = require('./eventSimulator');

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.min(b, Math.max(a, x));
}

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function fmtMoney(amount, currency) {
  if (!Number.isFinite(Number(amount))) return '—';
  const cur = currency || '';
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

function coerceDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const d = new Date(`${value.trim()}T00:00:00Z`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function verdictForRange(value, low, high) {
  if (!Number.isFinite(Number(value))) return { verdict: 'belirsiz', tone: 'muted' };
  const v = Number(value);
  if (v < low) return { verdict: 'düşük / esnek', tone: 'ok' };
  if (v <= high) return { verdict: 'makul', tone: 'ok' };
  if (v <= high * 1.3) return { verdict: 'sert', tone: 'warn' };
  return { verdict: 'agresif', tone: 'bad' };
}

function push(checks, label, value, verdict, detail, tone) {
  checks.push({ label, value, verdict, detail, tone: tone || (verdict === 'agresif' ? 'bad' : verdict === 'sert' ? 'warn' : verdict === 'belirsiz' ? 'muted' : 'ok') });
}

function statusFromChecks(checks = []) {
  let bad = 0;
  let warn = 0;
  for (const c of checks) {
    if (c.tone === 'bad') bad += 1;
    else if (c.tone === 'warn') warn += 1;
  }
  if (bad >= 2 || (bad >= 1 && warn >= 2)) return { status: 'SERT', color: 'high' };
  if (bad >= 1 || warn >= 2) return { status: 'KONTROL ET', color: 'medium' };
  return { status: 'MAKUL', color: 'low' };
}

function hasAny(text, needles = []) {
  const s = norm(text);
  return needles.some((n) => s.includes(norm(n)));
}

function extractFirstPercentNear(text, keywordRe) {
  const t = String(text || '');
  const re = new RegExp(`(?:${keywordRe.source})[^%\n\r]{0,80}%\s*(\\d+(?:[.,]\\d+)?)`, keywordRe.flags.includes('i') ? 'i' : '');
  const m = t.match(re);
  if (!m) return null;
  const n = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extractFirstDaysNear(text, keywordRe) {
  const t = norm(text);
  const re = new RegExp(`(?:${keywordRe.source})[^\n\r\d]{0,80}(\\d{1,3})\\s*gun`, 'i');
  const m = t.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractFirstMonthsNear(text, keywordRe) {
  const t = norm(text);
  const re = new RegExp(`(?:${keywordRe.source})[^\n\r\d]{0,80}(\\d{1,3})\\s*ay`, 'i');
  const m = t.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseAmount(s) {
  const cleaned = String(s || '').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractMoneyNear(text, keywords = []) {
  const t = String(text || '');
  const out = [];
  for (const kw of keywords) {
    const re = new RegExp(`${kw}[^\n\r\d]{0,40}(\\d{1,3}(?:[\.\s]\\d{3})*(?:,\\d{2})?|\\d+(?:,\\d{2})?)\\s*(₺|TL|TRY|€|EUR|USD|\\$)`, 'ig');
    let m;
    while ((m = re.exec(t))) {
      out.push({ amount: parseAmount(m[1]), currency: String(m[2] || '').toUpperCase() });
    }
  }
  return out.filter((x) => Number.isFinite(x.amount));
}

function extractMonthlyInterest(text) {
  const t = String(text || '');
  let m = t.match(/ayl[iı]k\s+net\s*%\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) m = t.match(/(?:temerr[uü]t|gecikme|faiz)[^%\n\r]{0,40}%\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extractDurationMonths(text) {
  const s = norm(text);
  let m = s.match(/(\d{1,3})\s*ay\b/);
  if (m) return Number(m[1]);
  m = s.match(/(\d{1,2})\s*yil\b/);
  if (m) return Number(m[1]) * 12;
  return null;
}

function buildEventMarketReview(ctx) {
  const eventMeta = ctx?.event;
  if (!eventMeta || !eventMeta.available) return { available: false };

  const now = new Date();
  const eventDate = coerceDate(eventMeta.eventDate);
  const daysUntil = eventDate ? daysBetween(now, eventDate) : null;
  const total = eventMeta.total?.amount ?? null;
  const currency = eventMeta.total?.currency ?? eventMeta.total?.currency;

  let firstPayment = null;
  if (Array.isArray(eventMeta.paymentSchedule) && eventMeta.paymentSchedule.length) {
    const sorted = [...eventMeta.paymentSchedule]
      .filter((p) => p && p.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (sorted.length) firstPayment = Number(sorted[0].amount || 0) || null;
  }

  const depositPct = (Number.isFinite(Number(firstPayment)) && Number.isFinite(Number(total)) && Number(total) > 0)
    ? (Number(firstPayment) / Number(total)) * 100
    : null;

  const pct90 = cancelPercent(eventMeta.cancellationTable, 90);
  const pct60 = cancelPercent(eventMeta.cancellationTable, 60);
  const pct30 = cancelPercent(eventMeta.cancellationTable, 30);
  const pct14 = cancelPercent(eventMeta.cancellationTable, 14);

  const cancelBench = {
    90: { low: 0, high: 35 },
    60: { low: 10, high: 50 },
    30: { low: 20, high: 70 },
    14: { low: 35, high: 100 }
  };

  const checks = [];
  const perPerson = Number.isFinite(Number(eventMeta.perPersonVatIncl))
    ? Number(eventMeta.perPersonVatIncl)
    : (Number.isFinite(Number(eventMeta.perPersonFromTotal)) ? Number(eventMeta.perPersonFromTotal) : null);

  if (Number.isFinite(Number(total))) {
    push(checks, 'Toplam bedel', fmtMoney(total, currency), 'bilgi', 'Tek başına pahalı/ucuz kararı vermez; benzer tarih ve segmentte 2–3 teklif ile kıyaslamak gerekir.', 'muted');
  }
  if (Number.isFinite(Number(perPerson))) {
    push(checks, 'Kişi başı fiyat (yaklaşık)', fmtMoney(perPerson, currency), 'bilgi', 'Bu sadece bölme hesabıdır; menü, içecek, DJ, servis, KDV ve saat uzatımı dahil/dahil değil olabilir.', 'muted');
  }
  if (Number.isFinite(Number(firstPayment))) {
    const v = verdictForRange(depositPct, 10, 50);
    push(checks, 'İlk ödeme / kapora', `${fmtMoney(firstPayment, currency)} (${fmtPercent(depositPct)})`, v.verdict, 'Etkinlik sözleşmelerinde kapora normaldir. Asıl soru: iptal olursa bu tutar ne kadar iade edilir?', v.tone);
  }

  const addCancel = (days, pct) => {
    if (!Number.isFinite(Number(pct))) return;
    const b = cancelBench[days];
    const v = verdictForRange(pct, b.low, b.high);
    push(checks, `İptal bedeli (${days} gün kala)`, fmtPercent(pct), v.verdict, 'Aynı yüzde, farklı gün pencerelerinde çok farklı ağırlık taşır. Tarih yaklaşırken artış normal; erken dönem sertliği daha kritik.', v.tone);
  };
  addCancel(90, pct90);
  addCancel(60, pct60);
  addCancel(30, pct30);
  addCancel(14, pct14);

  if (Number.isFinite(Number(daysUntil))) {
    push(checks, 'Etkinliğe kalan süre', `${daysUntil} gün`, 'bilgi', 'Piyasa kıyası yaparken aynı tarihe ve sezon yoğunluğuna göre bakmak gerekir.', 'muted');
  }

  const interestMonthly = clamp(eventMeta.interestMonthly, 0, 100);
  if (Number.isFinite(Number(interestMonthly))) {
    const v = verdictForRange(interestMonthly, 0.5, 2.5);
    push(checks, 'Gecikme/temerrüt faizi (aylık)', fmtPercent(interestMonthly), v.verdict, 'Aylık oranlar küçük görünse de bileşik etki yaratır. Faiz + masraf + avukatlık dili varsa ayrıca netleştirmek gerekir.', v.tone);
  }

  const status = statusFromChecks(checks);
  return {
    available: true,
    status: status.status,
    color: status.color,
    summary: 'Bu bölüm etkinlik sözleşmesindeki rakamları kabaca piyasa ve pratik açısından mantık kontrolünden geçirir. Kesin piyasa verisi değildir.',
    checks,
    caveats: [
      'Piyasa; şehir, gün, sezon, mekan segmenti ve paket içeriğine göre ciddi değişir.',
      'En güvenli kıyas, aynı tarihte ve benzer içerikte 2–3 teklif toplamaktır.'
    ]
  };
}

function buildGenericChecklist(packKey) {
  const byPack = {
    kira: [
      'Benzer bölgedeki emsal kira ilanlarıyla aylık bedeli kıyasla.',
      'Depozitonun kaç aylık kira denkliğinde olduğuna bak.',
      'Aidat, bakım ve tahliye yükümlülükleri kira dışında sürpriz maliyet yaratıyor mu kontrol et.'
    ],
    hizmet: [
      'Aynı kapsam ve teslim kriterleriyle 2–3 teklif topla.',
      'Ödeme kilometre taşları teslim çıktılarıyla uyumlu mu bak.',
      'Geç teslim cezası ile toplam bedel arasındaki oranı kıyasla.'
    ],
    influencer: [
      'İçerik adedi, yayın tarihi ve kullanım hakkı benzer kampanyalarla kıyaslanmalı.',
      'Markanın sınırsız kullanım talebi varsa bedelin buna göre yükselmesi beklenir.',
      'Rekabet yasağı ve münhasırlık süresi pazarlığın ana noktasıdır.'
    ],
    satis: [
      'Benzer ürün/hizmette garanti süresi ve iade şartlarını kıyasla.',
      'Teslim ve ayıp sorumluluğu hangi noktada devrediliyor bak.',
      'Ek kurulum/servis/taşıma masrafları ayrıca yazılmış mı kontrol et.'
    ],
    saas: [
      'Otomatik yenileme, fiyat artışı ve SLA seviyelerini rakip planlarla kıyasla.',
      'Düşük giriş fiyatı varsa kullanım artışında toplam maliyetin nasıl değiştiğine bak.',
      'Veri taşıma ve çıkış (offboarding) maliyeti açık mı kontrol et.'
    ],
    abonelik: [
      'Taahhüt süresi ve cayma bedeli rakip aboneliklerle kıyaslanmalı.',
      'Otomatik yenileme ve fiyat artışı için ne kadar ön bildirim verildiğine bak.',
      'İptal kanalı gerçekten kolay mı (tek tık/eposta) kontrol et.'
    ],
    is: [
      'Benzer roller için maaş, yan haklar ve bonus yapısını kıyasla.',
      'Rekabet yasağı varsa süre ve coğrafi alanı emsal rollere göre daralt.',
      'Fesih ve fazla mesai hükümlerinin İş Kanunu çizgisinden ne kadar saptığına bak.'
    ],
    kredi: [
      'Aylık faiz, temerrüt ve masraf kalemlerini birlikte kıyasla.',
      'Muacceliyet hangi gecikmede devreye giriyor; emsal ürünlere göre sert mi bak.',
      'Kefalet ve teminat dili, borç tutarını aşacak şekilde geniş mi kontrol et.'
    ],
    egitim: [
      'İade ve telafi dersi şartlarını benzer kurslarla kıyasla.',
      'Program/eğitmen değişirse eşdeğer hizmet veya kısmi iade var mı bak.',
      'Toplam ders saati ve sertifika koşulu net mi kontrol et.'
    ],
    gizlilik: [
      'Gizlilik süresi ve cezai şart benzer NDA örnekleriyle kıyaslanmalı.',
      'Gizli bilgi istisnaları (kamuya açık bilgi, yasal zorunluluk) mutlaka olmalı.',
      'Süresiz ve sınırsız yasaklar varsa bedel/iş kapsamı ile dengeli mi bak.'
    ],
    arac: [
      'Km limiti ve aşım bedelini rakip kiralama teklifleriyle kıyasla.',
      'Depozito, muafiyet ve değer kaybı kesintileri teslim sonrası sürpriz yaratabilir.',
      'İade anındaki temizlik/çizik/hasar tanımı fotoğraflı tutanakla desteklenmeli.'
    ],
    seyahat: [
      'İptal ve iade pencerelerini benzer tur/otel koşullarıyla kıyasla.',
      'Program değişikliği halinde eşdeğer hizmet veya iade var mı bak.',
      'Hariç kalemler (vize, transfer, yakıt, resort fee) toplam maliyeti büyütebilir.'
    ],
    sigorta: [
      'Muafiyet, istisna ve ihbar süresi emsal poliçelerle kıyaslanmalı.',
      'Teminat başlığı var diye koruma var sanma; istisnalar çoğu hasarı boşaltabilir.',
      'Hasar anında hangi belgeler isteniyor ve ne kadar sürede bildirim gerekiyor kontrol et.'
    ],
    genel: [
      'Aynı işlem için 2–3 alternatif teklif ve örnek sözleşme ile kıyaslama yap.',
      'Toplam maliyet ve ek yükleri (ceza, faiz, masraf, kur farkı) ayrı ayrı kontrol et.',
      'İptal/çıkış senaryolarının yazılı ve rakamsal olarak net olup olmadığına bak.'
    ]
  };

  const bullets = byPack[packKey] || byPack.genel;
  return {
    available: true,
    status: 'KONTROL ET',
    color: 'medium',
    summary: 'Bu tür sözleşmeler için hızlı piyasa ve mantık kontrol listesi:',
    checks: bullets.map((b) => ({ label: 'Kontrol', value: b, verdict: 'bilgi', tone: 'muted' })),
    caveats: ['Bu bölüm emsal veri tabanı değil; hızlı kıyas ve pazarlık listesi olarak düşünülmeli.']
  };
}

function buildPackSmartReview(packKey, ctx) {
  const pack = String(packKey || 'genel').toLowerCase();
  const text = String(ctx?.text || '');
  const issues = Array.isArray(ctx?.issues) ? ctx.issues : [];
  const issueIds = new Set(issues.map((i) => String(i.id || '')));
  const checks = [];
  const s = norm(text);

  // shared extracts
  const lateInterest = extractMonthlyInterest(text);
  const cancelPct = extractFirstPercentNear(text, /(cayma|cezai\s+sart|cezai\s+şart|erken\s+fesih|iptal)/i);
  const noticeDays = extractFirstDaysNear(text, /(bildirim|ihbar|onceden|önceden|yenileme|iptal|fesih)/i);
  const durationMonths = extractDurationMonths(text);
  const hasCap = hasAny(text, ['azami tutar', 'üst sınır', 'ust sinir', 'cap', 'limit']);
  const excludesIndirect = hasAny(text, ['dolayli zarar haric', 'dolaylı zarar hariç', 'indirect damages exclude', 'kar kaybi haric', 'kar kaybı hariç']);
  const hasExit = hasAny(text, ['cezasiz iptal', 'cezasız iptal', 'fesih hakki', 'fesih hakkı', 'iptal hakki', 'iptal hakkı']);
  const hasNotice = noticeDays != null && noticeDays >= 7;

  switch (pack) {
    case 'kira': {
      const rents = extractMoneyNear(text, ['kira\\s+bedeli']);
      const deps = extractMoneyNear(text, ['depozito', 'guvence', 'teminat']);
      if (rents.length && deps.length && rents[0].currency === deps[0].currency && rents[0].amount > 0) {
        const months = deps[0].amount / rents[0].amount;
        const v = verdictForRange(months, 1, 2);
        push(checks, 'Depozito / kira oranı', `${months.toFixed(1).replace('.', ',')} aylık kira`, v.verdict, 'Konut/işyeri pratiğinde 1–2 aylık depozito daha sık görülür; daha yukarısı pazarlık konusu olabilir.', v.tone);
      }
      push(checks, 'Yıllık artış mantığı', hasAny(s, ['tufe', 'ufe', 'yenileme donemi', 'yenileme dönemi']) ? 'belirtilmiş' : 'belirsiz', hasAny(s, ['tufe', 'ufe']) ? 'makul' : 'belirsiz', 'Artış yöntemi net değilse sonraki dönemde ciddi sürpriz yaratabilir.', hasAny(s, ['tufe', 'ufe']) ? 'ok' : 'muted');
      if (noticeDays != null) {
        const v = verdictForRange(noticeDays, 15, 30);
        push(checks, 'Fesih / bildirim süresi', `${noticeDays} gün`, v.verdict, 'Çok kısa bildirim süresi kiracı için operasyonel baskı yaratabilir.', v.tone);
      }
      break;
    }

    case 'hizmet':
    case 'influencer': {
      if (cancelPct != null) {
        const v = verdictForRange(cancelPct, 10, 30);
        push(checks, 'Cayma / ceza oranı', fmtPercent(cancelPct), v.verdict, 'Proje/hizmet sözleşmelerinde ceza oranı kadar, hangi durumda devreye girdiği de önemlidir.', v.tone);
      }
      push(checks, 'Sorumluluk üst sınırı', hasCap ? 'var' : 'yok / zayıf', hasCap ? 'makul' : 'sert', 'Cap olmaması, proje bedelini aşan talepler için kapıyı açık bırakabilir.', hasCap ? 'ok' : 'warn');
      if (lateInterest != null) {
        const v = verdictForRange(lateInterest, 0.5, 2.0);
        push(checks, 'Gecikme faizi (aylık)', fmtPercent(lateInterest), v.verdict, 'Özellikle küçük alacaklarda faiz + tahsil masrafı kombinasyonu ağırlaşabilir.', v.tone);
      }
      if (pack === 'influencer') {
        const exMonths = extractFirstMonthsNear(text, /(rekabet|munhasir|münhasır|exclusive|munsahır)/i);
        if (exMonths != null) {
          const v = verdictForRange(exMonths, 1, 6);
          push(checks, 'Münhasırlık / rekabet süresi', `${exMonths} ay`, v.verdict, 'İçerik kampanyalarında 1–6 ay daha sık; daha uzun süreler bedeli etkileyebilir.', v.tone);
        }
      }
      break;
    }

    case 'satis': {
      const warrantyMonths = extractFirstMonthsNear(text, /(garanti|servis|destek)/i);
      if (warrantyMonths != null) {
        const v = verdictForRange(warrantyMonths, 6, 24);
        push(checks, 'Garanti / destek süresi', `${warrantyMonths} ay`, v.verdict, 'Daha kısa süre varsa bedel buna göre yeniden düşünülmeli.', v.tone);
      }
      const returnDays = extractFirstDaysNear(text, /(iade|degisim|değişim|ayıp|ayip)/i);
      if (returnDays != null) {
        const v = verdictForRange(returnDays, 7, 14);
        push(checks, 'İade / itiraz süresi', `${returnDays} gün`, v.verdict, '3 gün gibi kısa pencereler kullanıcı tarafı için sert olabilir.', v.tone);
      }
      break;
    }

    case 'saas':
    case 'abonelik': {
      const renewDays = extractFirstDaysNear(text, /(yenileme|otomatik\s+yenileme|renewal)/i);
      if (renewDays != null) {
        const v = verdictForRange(renewDays, 15, 30);
        push(checks, 'Yenileme ön bildirimi', `${renewDays} gün`, v.verdict, 'Yenileme bildirimi kısa ise unutma riski yükselir.', v.tone);
      } else {
        push(checks, 'Yenileme ön bildirimi', 'belirsiz', 'belirsiz', 'Otomatik yenileme varsa ne kadar önceden bildirileceği net olmalı.', 'muted');
      }
      const priceDays = extractFirstDaysNear(text, /(fiyat|ucret|ücret|artis|artış|price)/i);
      if (priceDays != null) {
        const v = verdictForRange(priceDays, 15, 30);
        push(checks, 'Fiyat artışı bildirimi', `${priceDays} gün`, v.verdict, 'Fiyat değişiyorsa kullanıcıya anlamlı önceden bildirim verilmeli.', v.tone);
      }
      if (cancelPct != null) {
        const v = verdictForRange(cancelPct, 0, 25);
        push(checks, 'Erken fesih / cayma bedeli', fmtPercent(cancelPct), v.verdict, 'Taahhütlü planlarda ceza normal olabilir; oran ve kalan süre ile orantılı olmalı.', v.tone);
      }
      break;
    }

    case 'is': {
      const ncMonths = extractFirstMonthsNear(text, /(rekabet|non\s*compete|munhasir|münhasır)/i);
      if (ncMonths != null) {
        const v = verdictForRange(ncMonths, 3, 12);
        push(checks, 'Rekabet / kısıtlama süresi', `${ncMonths} ay`, v.verdict, 'Özellikle işten çıkış sonrası süre ve alan birlikte değerlendirilmelidir.', v.tone);
      }
      if (noticeDays != null) {
        const v = verdictForRange(noticeDays, 7, 30);
        push(checks, 'Bildirim / fesih süresi', `${noticeDays} gün`, v.verdict, 'Aşırı kısa süreler çalışan veya işveren tarafında sürpriz yaratabilir.', v.tone);
      }
      push(checks, 'Fazla mesai dili', hasAny(s, ['fazla mesai ucrete dahildir', 'fazla mesai ücrete dahildir', 'karsiliksiz']) ? 'sert' : 'nötr', hasAny(s, ['fazla mesai ucrete dahildir', 'fazla mesai ücrete dahildir', 'karsiliksiz']) ? 'sert' : 'bilgi', 'Fazla mesainin peşinen ücrete dahil sayılması çoğu zaman pazarlık konusudur.', hasAny(s, ['fazla mesai ucrete dahildir', 'fazla mesai ücrete dahildir', 'karsiliksiz']) ? 'warn' : 'muted');
      break;
    }

    case 'kredi': {
      if (lateInterest != null) {
        const v = verdictForRange(lateInterest, 1.0, 2.5);
        push(checks, 'Faiz / temerrüt oranı (aylık)', fmtPercent(lateInterest), v.verdict, 'Aylık oran küçük görünse de uzun vadede maliyeti çok büyütebilir.', v.tone);
      }
      push(checks, 'Muacceliyet', issueIds.has('kredi_muacceliyet') ? 'var' : 'görünmüyor', issueIds.has('kredi_muacceliyet') ? 'sert' : 'makul', '1–2 taksit gecikmesinde tüm borcun muaccel hale gelmesi sert sonuç doğurur.', issueIds.has('kredi_muacceliyet') ? 'warn' : 'ok');
      push(checks, 'Kefalet / müteselsil dil', issueIds.has('kredi_kefalet_muteselsil') ? 'geniş' : 'sınırlı / yok', issueIds.has('kredi_kefalet_muteselsil') ? 'sert' : 'makul', 'Kefalet varsa azami tutar ve süre sınırı aranmalı.', issueIds.has('kredi_kefalet_muteselsil') ? 'warn' : 'ok');
      break;
    }

    case 'egitim': {
      push(checks, 'İade / cayma imkanı', issueIds.has('egitim_iade_yok') ? 'zayıf' : 'var / daha dengeli', issueIds.has('egitim_iade_yok') ? 'sert' : 'makul', 'Eğitim başlamadan veya ilk derslerde kısmi iade imkanı bulunması kullanıcı lehinedir.', issueIds.has('egitim_iade_yok') ? 'warn' : 'ok');
      push(checks, 'Telafi / eşdeğer hizmet', hasAny(s, ['telafi', 'make up', 'esdeger', 'eşdeğer']) ? 'var' : 'belirsiz', hasAny(s, ['telafi', 'make up', 'esdeger', 'eşdeğer']) ? 'makul' : 'belirsiz', 'Program/eğitmen değişirse telafi veya eşdeğer hizmet önemli bir denge unsurudur.', hasAny(s, ['telafi', 'make up', 'esdeger', 'eşdeğer']) ? 'ok' : 'muted');
      if (durationMonths != null) push(checks, 'Program süresi', `${durationMonths} ay`, 'bilgi', 'Toplam süreyi fiyat ve ders sıklığıyla birlikte değerlendirmek gerekir.', 'muted');
      break;
    }

    case 'gizlilik': {
      if (durationMonths != null) {
        const v = verdictForRange(durationMonths, 12, 36);
        push(checks, 'Gizlilik süresi', `${durationMonths} ay`, v.verdict, 'Süresiz yasak yerine makul süre + sır türüne göre ayrım daha dengelidir.', v.tone);
      }
      push(checks, 'İstisnalar', hasAny(s, ['kamuya acik', 'kamuya açık', 'yasal zorunluluk', 'public domain', 'mahkeme']) ? 'var' : 'zayıf', hasAny(s, ['kamuya acik', 'kamuya açık', 'yasal zorunluluk', 'public domain', 'mahkeme']) ? 'makul' : 'sert', 'NDA’da istisna yoksa sır olmayan bilgi bile gereksiz risk yaratabilir.', hasAny(s, ['kamuya acik', 'kamuya açık', 'yasal zorunluluk', 'public domain', 'mahkeme']) ? 'ok' : 'warn');
      push(checks, 'Cezai şart üst sınırı', hasCap ? 'var' : 'yok / belirsiz', hasCap ? 'makul' : 'sert', 'NDA cezası varsa üst sınır/cap olması pazarlıkta önemlidir.', hasCap ? 'ok' : 'warn');
      break;
    }

    case 'arac': {
      const kmLimit = (() => {
        const m = s.match(/(\d{3,5})\s*km/);
        return m ? Number(m[1]) : null;
      })();
      if (kmLimit != null) {
        const v = verdictForRange(kmLimit, 1000, 3000);
        push(checks, 'Km limiti', `${kmLimit.toLocaleString('tr-TR')} km`, v.verdict, 'Düşük limitler aşım ücretini erken devreye sokabilir; dönemsel/aylık olduğu net olmalı.', v.tone);
      }
      const muafPct = extractFirstPercentNear(text, /(muafiyet|katilim\s+payi|katılım\s+payı)/i);
      if (muafPct != null) {
        const v = verdictForRange(muafPct, 0, 5);
        push(checks, 'Muafiyet / katılım payı', fmtPercent(muafPct), v.verdict, 'Hasar anında cebinden çıkacak tutarı belirleyen ana metrik budur.', v.tone);
      }
      push(checks, 'Hasar / değer kaybı dili', issueIds.has('arac_hasar_deger_kaybi') ? 'geniş' : 'nötr', issueIds.has('arac_hasar_deger_kaybi') ? 'sert' : 'bilgi', 'Teslim tutanağı ve fotoğraflı kayıt yoksa iade anında tartışma çıkar.', issueIds.has('arac_hasar_deger_kaybi') ? 'warn' : 'muted');
      break;
    }

    case 'seyahat': {
      if (cancelPct != null) {
        const v = verdictForRange(cancelPct, 10, 35);
        push(checks, 'İptal / iade kesintisi', fmtPercent(cancelPct), v.verdict, 'Tur/otel rezervasyonlarında iade penceresi en kritik kalemlerden biridir.', v.tone);
      }
      push(checks, 'Program değişikliği dengesi', hasAny(s, ['esdeger', 'eşdeğer', 'muadil', 'iade']) ? 'denge var' : 'zayıf', hasAny(s, ['esdeger', 'eşdeğer', 'muadil', 'iade']) ? 'makul' : 'sert', 'Program/otel değişirse muadil hizmet veya iade seçeneği aranmalı.', hasAny(s, ['esdeger', 'eşdeğer', 'muadil', 'iade']) ? 'ok' : 'warn');
      break;
    }

    case 'sigorta': {
      const claimDays = extractFirstDaysNear(text, /(hasar\s+ihbari|ihbar|bildirim)/i);
      if (claimDays != null) {
        const v = verdictForRange(claimDays, 5, 15);
        push(checks, 'Hasar ihbar süresi', `${claimDays} gün`, v.verdict, '2 gün gibi kısa süreler gerçek hayatta hak kaybı doğurabilir.', v.tone);
      }
      const muafPct = extractFirstPercentNear(text, /(muafiyet|katilim\s+payi|katılım\s+payı)/i);
      if (muafPct != null) {
        const v = verdictForRange(muafPct, 0, 5);
        push(checks, 'Muafiyet oranı', fmtPercent(muafPct), v.verdict, 'Muafiyet düşük görünse de istisna listesi genişse koruma yine daralabilir.', v.tone);
      }
      push(checks, 'İstisna genişliği', issueIds.has('sigorta_genis_istisna') ? 'geniş' : 'daha sınırlı', issueIds.has('sigorta_genis_istisna') ? 'sert' : 'makul', 'Pek çok poliçede sorun teminatta değil, istisnalardadır.', issueIds.has('sigorta_genis_istisna') ? 'warn' : 'ok');
      break;
    }

    default: {
      if (cancelPct != null) {
        const v = verdictForRange(cancelPct, 10, 30);
        push(checks, 'Ceza / cayma oranı', fmtPercent(cancelPct), v.verdict, 'Tek başına yüzde yetmez; hangi olayda uygulandığına da bak.', v.tone);
      }
      if (lateInterest != null) {
        const v = verdictForRange(lateInterest, 0.5, 2.0);
        push(checks, 'Faiz / gecikme oranı', fmtPercent(lateInterest), v.verdict, 'Faiz + tahsil/masraf kombinasyonunu ayrıca kontrol etmek gerekir.', v.tone);
      }
      push(checks, 'Sorumluluk üst sınırı', hasCap ? 'var' : 'belirsiz', hasCap ? 'makul' : 'kontrol et', 'Cap/azami tutar hükmü yoksa küçük sözleşme büyük tazminat kapısına dönebilir.', hasCap ? 'ok' : 'warn');
      break;
    }
  }

  if (!checks.length) return buildGenericChecklist(pack);

  if (excludesIndirect) {
    push(checks, 'Dolaylı zarar istisnası', 'var', 'dengeleyici', 'Kar kaybı / dolaylı zarar hariç tutulmuşsa sorumluluk dili biraz yumuşamış olabilir.', 'ok');
  }
  if (hasExit && (pack === 'saas' || pack === 'abonelik' || pack === 'hizmet' || pack === 'influencer' || pack === 'etkinlik')) {
    push(checks, 'Çıkış / fesih hakkı', 'var', 'dengeleyici', 'Ceza veya bildirimle çıkış imkanı olması tek taraflı sıkışmayı azaltır.', 'ok');
  }
  if (hasNotice && (pack === 'saas' || pack === 'abonelik' || pack === 'hizmet' || pack === 'is')) {
    push(checks, 'Önceden bildirim', `${noticeDays} gün`, 'dengeleyici', 'Ön bildirim varsa fiyat/yenileme/fesih sürprizi bir miktar azalır.', 'ok');
  }

  const status = statusFromChecks(checks);
  return {
    available: true,
    status: status.status,
    color: status.color,
    summary: 'Bu bölüm kesin piyasa verisi sunmaz; sözleşmedeki rakam ve süreleri kabaca “piyasaya yakın mı / sert mi / belirsiz mi?” diye yorumlar.',
    checks,
    caveats: [
      'Piyasa şartları sektör, tarih, segment ve karşı tarafın marka gücüne göre değişir.',
      'Amaç “tek doğru fiyat” bulmak değil; pazarlık için mantık kontrolü yapmaktır.'
    ]
  };
}

function marketReviewForPack(packKey, ctx = {}) {
  const pack = String(packKey || 'genel').toLowerCase();
  if (pack === 'etkinlik') {
    const eventReview = buildEventMarketReview(ctx);
    if (eventReview?.available) return eventReview;
  }
  const review = buildPackSmartReview(pack, ctx);
  return review?.available ? review : buildGenericChecklist(pack);
}

module.exports = {
  marketReviewForPack
};
