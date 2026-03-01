(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NegotiationCopy = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ROLE_INTRO = {
    hizmet_alan: 'hizmet alan taraf olarak',
    hizmet_veren: 'hizmet veren taraf olarak',
    kiraci: 'kiracı olarak',
    ev_sahibi: 'ev sahibi olarak',
    alici: 'alıcı olarak',
    satici: 'satıcı olarak',
    genel: 'taraf olarak'
  };

  const CATEGORY_LABELS = {
    'ödeme': 'Ödeme ve bedel',
    'ödeme ve iade': 'Ödeme ve iade',
    'iptal / iade': 'İptal ve iade',
    'fesih': 'Fesih ve sona erme',
    'sorumluluk': 'Sorumluluk ve tazmin',
    'gizlilik / veri': 'Gizlilik ve veri',
    'kapsam / teslim': 'Kapsam ve teslim',
    'yargı / uyuşmazlık': 'Uyuşmazlık ve yetki',
    'mülkiyet / devir': 'Hak devri ve kullanım',
    'yenileme / abonelik': 'Yenileme ve abonelik',
    'tutarlılık': 'Doğruluk ve tutarlılık'
  };

  const PACK_COUNTERPARTIES = {
    genel: {
      viewer: 'karşı taraf',
      opposite: 'karşı taraf'
    },
    hizmet: {
      buyer: 'hizmet veren taraf',
      seller: 'müşteri tarafı'
    },
    influencer: {
      buyer: 'marka / ajans tarafı',
      seller: 'içerik üreticisi tarafı'
    },
    etkinlik: {
      buyer: 'mekân / organizasyon tarafı',
      seller: 'davet sahibi tarafı'
    },
    kira: {
      buyer: 'ev sahibi / yönetim tarafı',
      seller: 'kiracı tarafı'
    },
    satis: {
      buyer: 'satıcı tarafı',
      seller: 'alıcı tarafı'
    },
    saas: {
      buyer: 'sağlayıcı / satış ekibi',
      seller: 'müşteri / satın alma ekibi'
    },
    is: {
      buyer: 'işveren tarafı',
      seller: 'çalışan tarafı'
    },
    kredi: {
      buyer: 'banka / finansman sağlayıcı',
      seller: 'borçlu taraf'
    },
    egitim: {
      buyer: 'eğitim kurumu',
      seller: 'katılımcı taraf'
    },
    gizlilik: {
      buyer: 'karşı taraf',
      seller: 'karşı taraf'
    },
    abonelik: {
      buyer: 'sağlayıcı taraf',
      seller: 'abone / müşteri tarafı'
    },
    arac: {
      buyer: 'araç kiralama şirketi',
      seller: 'kiralayan taraf'
    },
    seyahat: {
      buyer: 'tur / acente tarafı',
      seller: 'katılımcı taraf'
    },
    sigorta: {
      buyer: 'sigorta şirketi',
      seller: 'sigortalı taraf'
    }
  };

  const PACK_STRATEGY = {
    genel: 'formal',
    hizmet: 'collaborative',
    influencer: 'soft',
    etkinlik: 'soft',
    kira: 'formal',
    satis: 'formal',
    saas: 'procurement',
    is: 'formal',
    kredi: 'firm',
    egitim: 'collaborative',
    gizlilik: 'formal',
    abonelik: 'formal',
    arac: 'formal',
    seyahat: 'soft',
    sigorta: 'firm'
  };

  const PACK_SUBJECT = {
    genel: 'sözleşme metni',
    hizmet: 'hizmet ilişkisi',
    influencer: 'iş birliği metni',
    etkinlik: 'etkinlik sözleşmesi',
    kira: 'kira ilişkisi',
    satis: 'satış ilişkisi',
    saas: 'yazılım / abonelik ilişkisi',
    is: 'çalışma ilişkisi',
    kredi: 'kredi / borç ilişkisi',
    egitim: 'eğitim ilişkisi',
    gizlilik: 'gizlilik metni',
    abonelik: 'abonelik ilişkisi',
    arac: 'araç kiralama ilişkisi',
    seyahat: 'seyahat / tur ilişkisi',
    sigorta: 'sigorta ilişkisi'
  };

  const PACK_SUBJECT_ACC = {
    genel: 'Sözleşme metnini',
    hizmet: 'Hizmet ilişkisini',
    influencer: 'İş birliği metnini',
    etkinlik: 'Etkinlik sözleşmesini',
    kira: 'Kira ilişkisini',
    satis: 'Satış ilişkisini',
    saas: 'Yazılım / abonelik ilişkisini',
    is: 'Çalışma ilişkisini',
    kredi: 'Kredi / borç ilişkisini',
    egitim: 'Eğitim ilişkisini',
    gizlilik: 'Gizlilik metnini',
    abonelik: 'Abonelik ilişkisini',
    arac: 'Araç kiralama ilişkisini',
    seyahat: 'Seyahat / tur ilişkisini',
    sigorta: 'Sigorta ilişkisini'
  };

  const STYLE_TEMPLATES = {
    soft: {
      introLead: 'Sözleşmeyi dikkatle gözden geçirdim.',
      introNeed: 'Sürecin sorunsuz ilerlemesi ve sonradan yorum farkı doğmaması için aşağıdaki maddeleri daha net görmek isterim.',
      lead(ref, subject) {
        if (/^madde\s+/i.test(ref)) return `${ref} özelinde, ${subject} içinde daha dengeli ve öngörülebilir bir ifade rica ederim.`;
        return `${ref} başlığında, ${subject} bakımından daha net bir düzenleme rica ederim.`;
      },
      bridge(rolePhrase) {
        return `Bunu ${rolePhrase} gereksiz gerilim yaratmadan ama açık şekilde netleştirmek istiyorum.`;
      },
      close(counterparty) {
        return `Uygun görürseniz ilgili maddeleri bu çerçevede revize edip güncel metni paylaşabilir misiniz?${counterparty ? ` Böylece ${counterparty} ile süreci daha rahat netleştirebiliriz.` : ''}`.trim();
      }
    },
    collaborative: {
      introLead: 'Metni dikkatle inceledim.',
      introNeed: 'İfa, teslim ve iletişim akışının baştan berraklaşması için aşağıdaki maddeleri birlikte netleştirmemizin faydalı olacağını düşünüyorum.',
      lead(ref, subject) {
        if (/^madde\s+/i.test(ref)) return `${ref} bakımından, ${subject} içinde daha uygulanabilir bir ifade ile ilerlemek isterim.`;
        return `${ref} başlığında, ${subject} açısından daha uygulanabilir bir düzenleme öneriyorum.`;
      },
      bridge(rolePhrase) {
        return `Bunu ${rolePhrase} iş birliğini bozmadan, beklentileri yazılı hale getirmek için istiyorum.`;
      },
      close(counterparty) {
        return `Uygunsa ilgili maddeleri bu doğrultuda netleştirip yeniden paylaşabilir misiniz?${counterparty ? ` Böylece ${counterparty} ile aynı beklenti setinde ilerleyebiliriz.` : ''}`.trim();
      }
    },
    procurement: {
      introLead: 'Metni operasyon, hizmet seviyesi ve yükümlülük dağılımı açısından inceledim.',
      introNeed: 'Ölçülebilir, denetlenebilir ve yazılı sınırları net bir metinle ilerlemek için aşağıdaki maddelerin revize edilmesini rica ederim.',
      lead(ref, subject) {
        if (/^madde\s+/i.test(ref)) return `${ref} bakımından, ${subject} içinde daha açık, ölçülebilir ve denetlenebilir bir ifade rica ediyorum.`;
        return `${ref} başlığında, ${subject} açısından daha açık ve ölçülebilir bir düzenleme rica ediyorum.`;
      },
      bridge(rolePhrase) {
        return `Bunu ${rolePhrase} operasyonel ve hukuki sınırların baştan netleşmesi için talep ediyorum.`;
      },
      close(counterparty) {
        return `Uygun olursa ilgili maddeleri bu çerçevede açık biçimde revize edip yeniden paylaşabilir misiniz?${counterparty ? ` Böylece ${counterparty} ile hizmet seviyesi ve sorumluluk sınırları netleşmiş olur.` : ''}`.trim();
      }
    },
    firm: {
      introLead: 'Metni mali yük, sorumluluk alanı ve temerrüt sonuçları bakımından inceledim.',
      introNeed: 'Benim açımdan aşırı yük doğurabilecek hükümleri açık ve sınırları belirli hale getirmek için aşağıdaki maddelerin revize edilmesini rica ediyorum.',
      lead(ref, subject) {
        if (/^madde\s+/i.test(ref)) return `${ref} bakımından, ${subject} içinde daha açık ve sınırları belirli bir düzenleme rica ediyorum.`;
        return `${ref} başlığında, ${subject} açısından daha açık ve sınırları belirli bir hüküm talep ediyorum.`;
      },
      bridge(rolePhrase) {
        return `Bunu ${rolePhrase} öngörülemeyen mali riskleri sınırlandırmak için istiyorum.`;
      },
      close(counterparty) {
        return `Uygun olursa ilgili maddeleri bu çerçevede revize edip yeniden paylaşabilir misiniz?${counterparty ? ` Böylece ${counterparty} ile yükümlülük sınırları daha net hale gelir.` : ''}`.trim();
      }
    },
    formal: {
      introLead: 'Sözleşmeyi dikkatle gözden geçirdim.',
      introNeed: 'İmza öncesinde aşağıdaki maddeleri daha açık ve dengeli hale getirebilirsek benim açımdan süreç daha sağlıklı ilerler.',
      lead(ref, subject) {
        if (/^madde\s+/i.test(ref)) return `${ref} bakımından, ${subject} içinde daha dengeli bir ifade rica ediyorum.`;
        return `${ref} başlığında, ${subject} açısından daha net bir düzenleme rica ediyorum.`;
      },
      bridge(rolePhrase) {
        return `Bunu ${rolePhrase} sonradan yorum farkı doğmaması için istiyorum.`;
      },
      close(counterparty) {
        return `Uygunsa ilgili maddeleri bu çerçevede revize edip yeniden paylaşabilir misiniz?${counterparty ? ` Böylece ${counterparty} ile metni daha net bir zeminde sonuçlandırabiliriz.` : ''}`.trim();
      }
    }
  };


  const STYLE_ORDER = ['soft', 'collaborative', 'formal', 'procurement', 'firm'];
  const SCALE_STYLE = { butik: -1, kurumsal: 1, kamu: 2, duzenlemeli: 2, standart: 0 };
  const RELATIONSHIP_STYLE = { tek_seferlik: 0, surekli: 0, deneme: -1 };
  const SENSITIVITY_STYLE = { yumusak: -1, dengeli: 0, sert: 1 };

  const SPECIAL_REQUESTS = [
    [/^değişiklik için yazılı onay şartı eklet$/i, 'Değişikliklerin ancak karşılıklı yazılı onayla geçerli olmasını rica ediyorum.'],
    [/^değişiklik olursa cezasız iptal.*hakkı iste$/i, 'Şartlarda tek taraflı bir değişiklik yapılırsa, bu durumda cezasız fesih veya cayma hakkımın korunmasını rica ediyorum.'],
    [/^fesih için bildirim süresi eklet/i, 'Fesih için makul bir bildirim süresi eklenmesini rica ediyorum.'],
    [/^fesih olursa o güne kadarki iş\/masrafın ödeneceğini yazdır$/i, 'Fesih halinde, o tarihe kadar doğan hakediş ve masraflarımın ödeneceğinin açıkça yazılmasını rica ediyorum.'],
    [/^gecikme\/eksik hizmette iade veya indirim şartı eklet$/i, 'Gecikme, ayıplı ifa veya eksik hizmet halinde iade veya indirim mekanizmasının açıkça düzenlenmesini rica ediyorum.'],
    [/^ödemeyi parça parça yap/i, 'Ödemenin tek seferde değil, aşamalı ve teslim veya ifaya bağlı şekilde planlanmasını rica ediyorum.'],
    [/^cezaya üst sınır koy/i, 'Cezai şart için açık ve makul bir üst sınır belirlenmesini rica ediyorum.'],
    [/^ceza sadece senin hatan varsa ve ispatlanırsa uygulansın$/i, 'Cezai şartın yalnızca bana atfedilebilen ve ispatlanabilir bir ihlal halinde uygulanmasını rica ediyorum.'],
    [/^tazmini sadece doğrudan zararla sınırla ve üst limit koy$/i, 'Tazmin sorumluluğunun yalnızca doğrudan ve ispatlanabilir zararlarla sınırlanmasını ve ayrıca makul bir üst limit belirlenmesini rica ediyorum.'],
    [/^üçüncü kişi kusuru ve mücbir sebebi hariç tut$/i, 'Üçüncü kişilerin kusuru ile mücbir sebep halleri bakımından sorumluluğumun sınırlandırılmasını rica ediyorum.'],
    [/^sorumluluk üst sınırı iste/i, 'Toplam sorumluluk için sözleşme bedeliyle orantılı, açık bir üst sınır eklenmesini rica ediyorum.'],
    [/^dolaylı zarar\/kar kaybını hariç tut$/i, 'Dolaylı zarar ve kâr kaybının sorumluluk kapsamı dışında bırakılmasını rica ediyorum.'],
    [/^yenileme öncesi e-posta\/sms hatırlatma iste$/i, 'Yenileme tarihinden önce açık bir e-posta veya SMS hatırlatması yapılmasını rica ediyorum.'],
    [/^iptal yöntemi açık ve kolay olsun.*$/i, 'İptal yönteminin açık, pratik ve e-posta üzerinden de kullanılabilir olmasını rica ediyorum.'],
    [/^bildirim süresini makul seviyeye indir.*$/i, 'Bildirim süresinin daha makul bir seviyeye çekilmesini rica ediyorum.'],
    [/^e-posta ile bildirim kabul edilsin$/i, 'Bildirimlerin e-posta ile de geçerli kabul edilmesini rica ediyorum.'],
    [/^süreyi kısalt, bölgeyi ve kapsamı daralt$/i, 'Süre, coğrafi alan ve kapsam bakımından kısıtlamanın daraltılmasını rica ediyorum.'],
    [/^yasak hangi işleri kapsıyor net yazılsın$/i, 'Kısıtlamanın hangi faaliyetleri kapsadığının açıkça yazılmasını rica ediyorum.'],
    [/^portföyde anonim paylaşım izni iste$/i, 'Portföyde anonim ve marka belirtmeden örnek paylaşabilmeme izin verilmesini rica ediyorum.'],
    [/^devir sadece teslim edilen çıktı \+ ödeme sonrası olsun$/i, 'Hak devrinin yalnızca teslim edilen çıktı bakımından ve ödemenin tamamlanmasından sonra doğmasını rica ediyorum.'],
    [/^münhasır.*yerine sınırlı lisans öner$/i, 'Münhasır devir yerine, amacı ve süresi belirli sınırlı bir lisans modeliyle ilerlenmesini rica ediyorum.'],
    [/^paylaşım amacı, kimlerle paylaşıldığı ve saklama süresi yazılsın$/i, 'Veri paylaşımının amacı, alıcı taraflar ve saklama süresinin açıkça yazılmasını rica ediyorum.'],
    [/^açık rıza veya kapatma.*seçeneği olsun$/i, 'Açık rıza veya devre dışı bırakma seçeneğinin net şekilde tanımlanmasını rica ediyorum.'],
    [/^revizyon sayısını yazdır/i, 'Revizyon sayısının açıkça yazılmasını rica ediyorum.'],
    [/^ek revizyonlar ücretli olsun$/i, 'Belirlenen revizyon sayısını aşan taleplerin ayrıca ücretlendirilmesini rica ediyorum.'],
    [/^teslim sonrası itiraz süresi koy.*$/i, 'Teslimden sonra makul bir itiraz süresi belirlenmesini rica ediyorum.'],
    [/^süre içinde itiraz yoksa kabul sayılır yazdır$/i, 'Belirlenen süre içinde itiraz gelmezse teslimin kabul edilmiş sayılmasını rica ediyorum.'],
    [/^aşamalı ödeme iste$/i, 'Ödemenin tek bir onay anına bağlanmak yerine aşamalı şekilde planlanmasını rica ediyorum.'],
    [/^onay gecikirse otomatik kabul\/ödeme tarihi eklet$/i, 'Onayın gecikmesi halinde otomatik kabul veya net bir ödeme tarihi öngörülmesini rica ediyorum.'],
    [/^gizliliğe süre koy.*$/i, 'Gizlilik yükümlülüğü için makul bir süre sınırı belirlenmesini rica ediyorum.'],
    [/^kamuya açık bilgi ve yasal zorunlulukları hariç tut$/i, 'Kamuya açık bilgiler ile yasal zorunluluk kaynaklı açıklamaların istisna olarak yazılmasını rica ediyorum.'],
    [/^yetkili mahkeme\/uygulanacak hukuk maddesini net ve dengeli yazdır$/i, 'Yetkili mahkeme ve uygulanacak hukuk maddesinin dengeli ve açık şekilde düzenlenmesini rica ediyorum.'],
    [/^sorumluluk sadece doğrudan ve ispatlı zararlarla sınırlı olsun; dolaylı zarar\/kar kaybı hariç tutulsun$/i, 'Sorumluluğun yalnızca doğrudan ve ispatlanabilir zararlarla sınırlanmasını, dolaylı zarar ve kâr kaybının ise kapsam dışında bırakılmasını rica ediyorum.'],
    [/^davetli\/taşeron kaynaklı zararlar için.*üst sınır.*$/i, 'Davetli veya taşeron kaynaklı zararlar bakımından makul bir üst sınır ve gerekiyorsa sigorta veya teminat mekanizması eklenmesini rica ediyorum.'],
    [/^müteselsil sorumluluk varsa.*daraltılmasını rica ediyorum$/i, 'Müteselsil sorumluluğun yalnızca kendi kusurumla sınırlı olacak şekilde daraltılmasını rica ediyorum.']
  ];

  function normalizeSpace(s) {
    return String(s || '').replace(/[\s\n\r\t]+/g, ' ').trim();
  }

  function ensureSentence(s) {
    const t = normalizeSpace(s);
    if (!t) return '';
    return /[.!?…]$/.test(t) ? t : `${t}.`;
  }

  function lowerFirst(s) {
    const t = String(s || '');
    if (!t) return '';
    return t.charAt(0).toLocaleLowerCase('tr-TR') + t.slice(1);
  }

  function upperFirst(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    return t.charAt(0).toLocaleUpperCase('tr-TR') + t.slice(1);
  }

  function cleanTemplate(t) {
    return normalizeSpace(String(t || '').replace(/^\s*[-*•]\s+/, '').replace(/[.!?…]+$/g, ''));
  }

  function isMoneyUnknown(moneyImpact) {
    const s = String(moneyImpact || '').toLowerCase().trim();
    if (!s) return true;
    return s.includes('değişken') || s.includes('hesaplanamad') || s.includes('net hesap');
  }

  function clauseLabel(issue) {
    const raw = issue && issue.clause ? String(issue.clause).trim() : '';
    if (!raw) return '';
    return raw.replace(/^[\s(]+|[\s)]+$/g, '').trim();
  }

  function refLabel(issue) {
    return clauseLabel(issue) || `“${String(issue?.title || 'ilgili madde').trim()}”`;
  }

  function firstPersonify(text) {
    let s = normalizeSpace(text);
    if (!s) return '';

    const replacements = [
      [/\bsenin\b/gi, 'benim'],
      [/\bsana\b/gi, 'bana'],
      [/\bsenden\b/gi, 'benden'],
      [/\bseni\b/gi, 'beni'],
      [/\bsen\b/gi, 'ben'],
      [/\bparan\b/gi, 'ödediğim bedel'],
      [/\bgelirin\b/gi, 'gelirim'],
      [/\bemeğin\b/gi, 'harcadığım emek'],
      [/\bemeğini\b/gi, 'harcadığım emeği'],
      [/\byaptığın iş\/masraf\b/gi, 'harcadığım emek ve yaptığım masraf'],
      [/\byaptığın\b/gi, 'yaptığım'],
      [/\brisk tamamen sende\b/gi, 'risk tamamen bende kalıyor'],
      [/\bgirebilirsin\b/gi, 'karşılaşabilirim'],
      [/\bkalabilirsin\b/gi, 'karşı karşıya kalabilirim'],
      [/\balamazsın\b/gi, 'alamayabilirim'],
      [/\bgösteremezsin\b/gi, 'gösteremeyebilirim'],
      [/\bgecikir\b/gi, 'gecikebilir'],
      [/\bzorunda kalırsın\b/gi, 'zorunda kalabilirim']
    ];

    replacements.forEach(([re, val]) => {
      s = s.replace(re, val);
    });

    s = s.replace(/\s+,/g, ',').replace(/\s+\./g, '.');
    return upperFirst(ensureSentence(s));
  }

  function toneForPack(pack) {
    const key = String(pack || 'genel').toLowerCase();
    return STYLE_TEMPLATES[PACK_STRATEGY[key] || 'formal'];
  }

  function roleSide(role) {
    const r = String(role || 'genel').toLowerCase();
    if (r === 'hizmet_veren' || r === 'ev_sahibi' || r === 'satici') return 'seller';
    if (r === 'hizmet_alan' || r === 'kiraci' || r === 'alici') return 'buyer';
    return 'viewer';
  }

  function counterpartyFor(pack, role) {
    const key = String(pack || 'genel').toLowerCase();
    const sides = PACK_COUNTERPARTIES[key] || PACK_COUNTERPARTIES.genel;
    const side = roleSide(role);
    if (side === 'seller') return sides.seller || sides.opposite || sides.viewer || 'karşı taraf';
    if (side === 'buyer') return sides.buyer || sides.opposite || sides.viewer || 'karşı taraf';
    return sides.viewer || sides.buyer || sides.opposite || 'karşı taraf';
  }

  function resolveToneKey(pack, sensitivity, counterpartyContext) {
    const baseKey = PACK_STRATEGY[String(pack || 'genel').toLowerCase()] || 'formal';
    let idx = Math.max(0, STYLE_ORDER.indexOf(baseKey));
    const ctx = counterpartyContext || {};
    idx += Number(SCALE_STYLE[String(ctx.scale || 'standart')] || 0);
    idx += Number(RELATIONSHIP_STYLE[String(ctx.relationship || 'surekli')] || 0);
    idx += Number(SENSITIVITY_STYLE[String(sensitivity || 'dengeli')] || 0);
    idx = Math.max(0, Math.min(STYLE_ORDER.length - 1, idx));
    return STYLE_ORDER[idx];
  }

  function toneForContext(pack, role, extra) {
    const e = extra || {};
    const counterpartyContext = e.counterpartyContext || {};
    const toneKey = resolveToneKey(pack, e.sensitivity, counterpartyContext);
    const tone = STYLE_TEMPLATES[toneKey] || toneForPack(pack);
    const baseCounterparty = counterpartyFor(pack, role);
    const detectedCounterparty = counterpartyContext.scaleLabel
      ? `${counterpartyContext.scaleLabel.toLocaleLowerCase('tr-TR')} ${baseCounterparty}`
      : baseCounterparty;
    return {
      tone,
      toneKey,
      subject: PACK_SUBJECT[String(pack || 'genel').toLowerCase()] || PACK_SUBJECT.genel,
      counterparty: detectedCounterparty,
      counterpartyContext
    };
  }

  function defaultWhy(issue) {
    const category = String(issue?.category || '').toLowerCase();
    if (category.includes('ödeme')) return 'Bu haliyle mali yükün tek tarafa kayma riski oluşuyor.';
    if (category.includes('sorumluluk')) return 'Bu haliyle sorumluluk alanı gereğinden geniş kalıyor.';
    if (category.includes('fesih')) return 'Bu haliyle sözleşme tek taraflı ve dengesiz biçimde sona erdirilebilir.';
    if (category.includes('gizlilik') || category.includes('veri')) return 'Bu haliyle veri ve gizlilik yükü fazla açık kalıyor.';
    if (category.includes('kapsam')) return 'Bu haliyle işin kapsamı ve teslim sınırları yeterince net görünmüyor.';
    if (category.includes('tutarlılık')) return 'Bu haliyle metin içinde doğruluk ve tutarlılık riski görünüyor.';
    return 'Bu haliyle benim açımdan gereksiz risk ve belirsizlik doğuruyor.';
  }

  function categoryLabel(category) {
    const raw = normalizeSpace(category);
    if (!raw) return 'Gözden Geçirilmesi Gereken Maddeler';
    const key = raw.toLocaleLowerCase('tr-TR');
    return CATEGORY_LABELS[key] || upperFirst(raw);
  }

  function polishTemplate(t) {
    const raw = cleanTemplate(t);
    if (!raw) return '';
    for (const [re, out] of SPECIAL_REQUESTS) {
      if (re.test(raw)) return out;
    }

    const firstPerson = firstPersonify(raw).replace(/[.!?…]+$/g, '');
    if (/rica ediyorum$/i.test(firstPerson)) return ensureSentence(firstPerson);
    if (/olsun$/i.test(raw)) return ensureSentence(`${firstPerson.replace(/olsun$/i, 'olmasını')} rica ediyorum`);
    if (/yazılsın$/i.test(raw)) return ensureSentence(`${firstPerson.replace(/yazılsın$/i, 'yazılmasını')} rica ediyorum`);
    if (/kabul edilsin$/i.test(raw)) return ensureSentence(`${firstPerson.replace(/kabul edilsin$/i, 'kabul edilmesini')} rica ediyorum`);
    if (/hariç tut$/i.test(raw)) return ensureSentence(`${firstPerson.replace(/hariç tut$/i, 'hariç tutulmasını')} rica ediyorum`);
    if (/daralt$/i.test(raw)) return ensureSentence(`${firstPerson.replace(/daralt$/i, 'daraltılmasını')} rica ediyorum`);
    if (/sınırla$/i.test(raw)) return ensureSentence(`${firstPerson.replace(/sınırla$/i, 'sınırlandırılmasını')} rica ediyorum`);
    if (/eklet$/i.test(raw)) return ensureSentence(`${firstPerson.replace(/eklet$/i, 'eklenmesini')} rica ediyorum`);
    if (/yazdır$/i.test(raw)) return ensureSentence(`${firstPerson.replace(/yazdır$/i, 'açıkça yazılmasını')} rica ediyorum`);
    if (/koy$/i.test(raw)) return ensureSentence(`${firstPerson.replace(/koy$/i, 'belirlenmesini')} rica ediyorum`);
    return ensureSentence(`Önerim, ${lowerFirst(raw)}`);
  }

  function finishAsk(sentence, style) {
    const s = ensureSentence(sentence);
    if (!s) return '';
    if (style === 'soft') return s.replace(/rica ediyorum\.$/i, 'rica ederim.');
    if (style === 'collaborative') return s.replace(/rica ediyorum\.$/i, 'rica ederim.');
    return s;
  }

  function buildAskParagraph(issue, ctx) {
    const asks = Array.from(new Set((Array.isArray(issue?.templates) ? issue.templates : []).map(polishTemplate).filter(Boolean))).slice(0, 3);
    if (!asks.length) {
      return 'Bu hükmün daha net, ölçülü ve dengeli olacak şekilde revize edilmesini rica ediyorum.';
    }
    const style = ctx?.toneKey || 'formal';
    const polished = asks.map((x) => finishAsk(x, style));
    if (polished.length === 1) return polished[0];
    if (polished.length === 2) return `${polished[0]} Ayrıca ${lowerFirst(polished[1])}`;
    return `${polished[0]} Ayrıca ${lowerFirst(polished[1])} Bunun yanında ${lowerFirst(polished[2])}`;
  }

  function issueLead(issue, ctx) {
    const ref = refLabel(issue);
    return ctx.tone.lead(ref, ctx.subject);
  }

  function buildIssueText(issue, opts) {
    const o = opts || {};
    const role = String(o.role || 'genel');
    const pack = String(o.pack || 'genel');
    const includeGreeting = !!o.includeGreeting;
    const includeClosing = !!o.includeClosing;
    const why = firstPersonify(issue?.why || defaultWhy(issue));
    const money = String(issue?.moneyImpact || '').trim();
    const rolePhrase = ROLE_INTRO[role] || ROLE_INTRO.genel;
    const ctx = toneForContext(pack, role, { sensitivity: o.sensitivity, counterpartyContext: o.counterpartyContext });

    const parts = [];
    if (includeGreeting) parts.push('Merhaba,');

    parts.push(`${issueLead(issue, ctx)} ${ctx.tone.bridge(rolePhrase)}`);
    parts.push(why);
    if (money && !isMoneyUnknown(money)) {
      parts.push(`Bu düzenlemenin yaklaşık parasal etkisi ${ensureSentence(money).replace(/[.!?…]+$/, '')} olabilir.`);
    }
    parts.push(buildAskParagraph(issue, ctx));

    if (includeClosing) {
      parts.push(ctx.tone.close(ctx.counterparty));
      parts.push('Teşekkürler.');
    }

    return parts.filter(Boolean).join('\n\n').trim();
  }

  function groupIssues(issues) {
    const groups = [];
    const map = new Map();
    (issues || []).forEach((issue) => {
      const key = String(issue?.category || 'genel').trim() || 'genel';
      if (!map.has(key)) {
        const g = { key, label: categoryLabel(key), items: [] };
        map.set(key, g);
        groups.push(g);
      }
      map.get(key).items.push(issue);
    });
    return groups;
  }

  function buildDoc(issues, opts) {
    const arr = Array.isArray(issues) ? issues.filter(Boolean) : [];
    const o = opts || {};
    const role = String(o.role || 'genel');
    const pack = String(o.pack || 'genel');
    const rolePhrase = ROLE_INTRO[role] || ROLE_INTRO.genel;
    const ctx = toneForContext(pack, role, { sensitivity: o.sensitivity, counterpartyContext: o.counterpartyContext });

    if (!arr.length) {
      return [
        'Merhaba,',
        '',
        `Sözleşmeyi ${rolePhrase} gözden geçirdim. Şu aşamada ayrıca revize talebim bulunmuyor.`,
        '',
        'Teşekkürler.'
      ].join('\n');
    }

    const head = [
      'Merhaba,',
      '',
      `${PACK_SUBJECT_ACC[String(pack || 'genel').toLowerCase()] || 'Sözleşme metnini'} ${rolePhrase} değerlendirdim. ${ctx.tone.introNeed}`,
      ctx.counterparty ? `${upperFirst(ctx.counterparty)} ile metni gereksiz sürtüşme yaratmadan ama yeterince net bir zeminde sonuçlandırmak istiyorum.` : '',
      ''
    ].filter(Boolean).join('\n');

    const grouped = groupIssues(arr);
    const body = grouped.map((group) => {
      const lines = [group.label];
      group.items.forEach((issue) => {
        const block = buildIssueText(issue, { role, pack, sensitivity: o.sensitivity, counterpartyContext: o.counterpartyContext, includeGreeting: false, includeClosing: false });
        lines.push(block);
      });
      return lines.join('\n\n');
    }).join('\n\n');

    const tail = ['', ctx.tone.close(ctx.counterparty), 'Teşekkürler.'].join('\n');
    return `${head}${body}${tail}`.trim();
  }

  function buildSubjectLine(opts) {
    const o = opts || {};
    const pack = String(o.pack || 'genel');
    const ctx = toneForContext(pack, String(o.role || 'genel'), { sensitivity: o.sensitivity, counterpartyContext: o.counterpartyContext });
    const subject = PACK_SUBJECT_ACC[String(pack).toLowerCase()] || 'Sözleşme metnini';
    return `${subject} hakkında revize talebi${ctx.counterparty ? ` — ${ctx.counterparty}` : ''}`;
  }

  return {
    cleanTemplate,
    buildIssueText,
    buildDoc,
    clauseLabel,
    refLabel,
    firstPersonify,
    buildSubjectLine,
    polishTemplate,
    isMoneyUnknown,
    categoryLabel,
    toneForContext,
    counterpartyFor,
  };
});
