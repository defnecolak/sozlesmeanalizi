/**
 * severity: LOW | MEDIUM | HIGH | CRITICAL
 * affects: ["all"|roleId...]
 */
const RULES = [
  {
    id: "unilateral_change",
    title: "Tek taraflı şart değiştirme",
    packs: ["genel"],
    packAdjust: { etkinlik: 0.8 },
    severity: "CRITICAL",
    category: "Tek Taraflı Yetkiler",
    affects: ["all"],
    patterns: [
      "tek\\s*taraflı\\s+olarak\\s+değiştir(e|me)bilir",
      "önceden\\s+bildirim\\s+yapmaksızın\\s+değiştir(e|me)bilir",
      "şartlar(ı|ini)\\s+değiştirme\\s+hakk(ı|ına)\\s+sahiptir",
      "at\\s+its\\s+sole\\s+discretion\\s+.*\\s+modify",
      "may\\s+change\\s+the\\s+terms\\s+at\\s+any\\s+time"
    ],
    why: "Karşı taraf şartları tek başına değiştirirse, sen fark etmeden daha kötü koşullara girebilirsin.",
    redLine: "Tek taraflı değişiklik = sürpriz şart riski.",
    templates: [
      "Değişiklik için yazılı onay şartı eklet.",
      "Değişiklik olursa cezasız iptal (cayma) hakkı iste."
    ]
  },
  {
    id: "terminate_without_cause",
    title: "Gerekçe göstermeden / derhal fesih",
    packs: ["genel", "hizmet", "kira", "satis", "saas"],
    severity: "CRITICAL",
    category: "Fesih",
    affects: ["hizmet_veren", "kiraci", "satici", "all"],
    patterns: [
      "herhangi\\s+bir\\s+gerekçe\\s+göstermeksizin\\s+feshedebilir",
      "bildirim\\s+süresine\\s+uymaksızın\\s+feshedebilir",
      "derhal\\s+fesih",
      "derhal\\s+feshedebilir",
      "gerekçe\\s+göstermeksizin\\s+.*\\s+feshedebilir",
      "terminate\\s+at\\s+any\\s+time\\s+without\\s+cause",
      "immediately\\s+terminate"
    ],
    why: "Karşı taraf sebep göstermeden bitirebilirse, yaptığın iş/masraf boşa gidebilir.",
    redLine: "Derhal fesih = emeğin ve masrafın içeride kalabilir.",
    templates: [
      "Fesih için bildirim süresi eklet (örn. 14 gün).",
      "Fesih olursa o güne kadarki iş/masrafın ödeneceğini yazdır."
    ]
  },
  {
    id: "no_refund",
    title: "İade yok / ücret iadesi yapılmaz",
    packs: ["genel", "satis", "hizmet"],
    packAdjust: { etkinlik: 0.8 },
    severity: "HIGH",
    category: "Ödeme",
    affects: ["hizmet_alan", "alici", "kiraci", "all"],
    patterns: [
      "ücret\\s+iadesi\\s+yapılmaz",
      "iade\\s+edilmez",
      "refund\\s+shall\\s+not\\s+be\\s+provided",
      "non\-?refundable"
    ],
    why: "İade yoksa, hizmet kötü/eksik olsa bile paran geri gelmeyebilir.",
    redLine: "İade yok = risk tamamen sende.",
    templates: [
      "Gecikme/eksik hizmette iade veya indirim şartı eklet.",
      "Ödemeyi parça parça yap (peşin + teslim)."
    ]
  },
  {
    id: "penalty_clause",
    title: "Cezai şart / cayma bedeli",
    packs: ["genel", "satis", "hizmet", "kira"],
    packAdjust: { etkinlik: 0.55 },
    severity: "HIGH",
    category: "Cezalar",
    affects: ["all"],
    patterns: ["cezai\\s+şart", "ceza(i)?\\s+bedel", "cayma\\s+bedeli", "liquidated\\s+damages"],
    why: "Cezai şart yüksekse, küçük bir problem bile büyük ödeme çıkarabilir.",
    redLine: "Ceza yükseldikçe risk büyür.",
    templates: [
      "Cezaya üst sınır koy (örn. toplam bedelin %X'i).",
      "Ceza sadece senin hatan varsa ve ispatlanırsa uygulansın."
    ]
  },
  {
    id: "indemnity",
    title: "Geniş tazmin / indemnity",
    packs: ["genel", "hizmet", "satis"],
    severity: "CRITICAL",
    category: "Sorumluluk",
    affects: ["hizmet_veren", "satici", "all"],
    patterns: ["tazmin\\s+edecektir", "her\\s+türlü\\s+zarar(ı|dan)\\s+sorumlu", "indemnif(y|ies|ication)", "hold\\s+harmless"],
    why: "Bu madde, başkalarının hatası için bile senden tazminat isteyebilir.",
    redLine: "Geniş tazmin = kontrol edemediğin risk.",
    templates: [
      "Tazmini sadece doğrudan zararla sınırla ve üst limit koy.",
      "Üçüncü kişi kusuru ve mücbir sebebi hariç tut."
    ]
  },
  {
    id: "unlimited_liability",
    title: "Sınırsız sorumluluk / dolaylı zarar",
    packs: ["genel", "hizmet", "satis", "saas"],
    packAdjust: { etkinlik: 0.65 },
    severity: "CRITICAL",
    category: "Sorumluluk",
    affects: ["hizmet_veren", "satici", "all"],
    patterns: ["sınırsız\\s+sorumluluk", "dolaylı\\s+zarar", "kar\\s+kaybı\\s+dahil", "loss\\s+of\\s+profit", "consequential\\s+damages"],
    why: "Sorumluluk limiti yoksa, talep edilecek tutar teorik olarak çok büyüyebilir.",
    redLine: "Limit yok = ucu açık fatura.",
    templates: [
      "Sorumluluk üst sınırı iste (örn. sözleşme bedeli kadar).",
      "Dolaylı zarar/kar kaybını hariç tut."
    ]
  },
  {
    id: "auto_renew",
    title: "Otomatik yenileme",
    packs: ["saas", "kira", "genel"],
    severity: "MEDIUM",
    category: "Süre",
    affects: ["hizmet_alan", "kiraci", "alici", "all"],
    patterns: ["otomatik\\s+olarak\\s+yenilen", "kendiliğinden\\s+uzar", "auto\-?renew", "automatically\\s+renew"],
    why: "Otomatik yenileme, iptal etmezsen yeni dönem ücreti doğurabilir.",
    redLine: "Yenileme kaçarsa yeni ödeme çıkar.",
    templates: [
      "Yenileme öncesi e-posta/SMS hatırlatma iste.",
      "İptal yöntemi açık ve kolay olsun (e-posta da geçerli)."
    ]
  },
  {
    id: "cancel_deadline",
    title: "İptal için erken bildirim şartı",
    packs: ["saas", "kira", "genel"],
    severity: "MEDIUM",
    category: "Süre",
    affects: ["hizmet_alan", "kiraci", "alici", "all"],
    patterns: ["(\\d{1,3})\\s*gün\\s+önce\\s+bildir", "(\\d{1,3})\\s*gün\\s+önceden\\s+bildirim", "prior\\s+written\\s+notice\\s+of\\s+\\d{1,3}\\s+days"],
    why: "Çok erken bildirim şartı iptali zorlaştırır; süreyi kaçırırsan ücret doğabilir.",
    redLine: "Uzun bildirim = iptal kaçarsa ödeme riski.",
    templates: [
      "Bildirim süresini makul seviyeye indir (örn. 7-14 gün).",
      "E-posta ile bildirim kabul edilsin."
    ]
  },
  {
    id: "non_compete",
    title: "Rekabet yasağı",
    packs: ["hizmet", "genel"],
    severity: "CRITICAL",
    category: "Kısıtlamalar",
    affects: ["hizmet_veren", "all"],
    patterns: ["rekabet\\s+etmeme", "rekabet\\s+yasağı", "benzer\\s+faaliyet", "non\-?compete", "non\-?competition"],
    why: "Rekabet yasağı, benzer iş almanı engelleyip gelirini düşürebilir.",
    redLine: "Geniş yasak = başka iş alamama riski.",
    templates: [
      "Süreyi kısalt, bölgeyi ve kapsamı daralt.",
      "Yasak hangi işleri kapsıyor net yazılsın."
    ]
  },
  {
    id: "ip_assignment",
    title: "Fikri mülkiyetin devri / tüm hakların karşı tarafa geçmesi",
    packs: ["hizmet", "satis", "genel"],
    severity: "HIGH",
    category: "Fikri Mülkiyet",
    affects: ["hizmet_veren", "satici", "all"],
    // Not: "münhasır" kelimesi sözleşmelerde çok sık (münhasıran sorumluluk vb.) geçtiği için tek başına tetikleyici olmamalı.
    // IP devri/lisans gibi bağlamlara daha yakın kalıplar kullandık.
    patterns: [
      // TR
      "fikri\\s+mülkiyet[^\\n]{0,140}(devr|devir|devred|devredilir|temlik|assign|geçer)",
      "tüm\\s+fikri\\s+mülkiyet\\s+haklar(ı)?[^\\n]{0,120}(devr|devir|devred|temlik|assign|geçer)",
      "tüm\\s+haklar(ı|ım|ımız)?[^\\n]{0,120}(devr|devir|devred|devredilir|temlik|assign|geçer)",
      "münhasır\\w*\\s+(lisans|license|hak|kullanım|devr|devir|temlik|assign)",

      // EN
      "assigned\\s+to\\s+(the\\s+)?(client|buyer|customer|company|party)",
      "perpetual\\s+royalty\-?free\\s+(license|licence)",
      "royalty\-?free\\s+and\\s+perpetual\\s+(license|licence)"
    ],
    why: "Tüm haklar devredilirse, işi tekrar kullanma ve portföyde gösterme hakkın gidebilir.",
    redLine: "Tüm hak devri = kullanım hakkın kalmayabilir.",
    templates: [
      "Portföyde anonim paylaşım izni iste.",
      "Devir sadece teslim edilen çıktı + ödeme sonrası olsun.",
      "Münhasır (sadece karşı tarafa) yerine sınırlı lisans öner."
    ]
  },
  {
    id: "portfolio_ban",
    title: "Portföyde paylaşım yasağı",
    packs: ["hizmet", "genel"],
    severity: "MEDIUM",
    category: "Fikri Mülkiyet",
    affects: ["hizmet_veren", "all"],
    patterns: ["portföy", "referans\\s+olarak\\s+paylaşamaz", "showcase", "portfolio"],
    why: "Portföy yasağı, yeni müşteri bulmayı zorlaştırır.",
    redLine: "Referans gösteremezsin.",
    templates: [
      "Anonim/markasız örnek paylaşım izni iste.",
      "Yayın yasağı varsa süre koy (örn. 3 ay)."
    ]
  },
  {
    id: "data_sharing",
    title: "Kişisel verilerin üçüncü kişilerle paylaşımı",
    packs: ["saas", "genel"],
    packAdjust: { etkinlik: 0.85 },
    severity: "HIGH",
    category: "Veri & Gizlilik",
    affects: ["hizmet_alan", "kiraci", "alici", "all"],
    patterns: ["kişisel\\s+veriler.*üçüncü\\s+kişilerle\\s+paylaş", "share\\s+your\\s+data\\s+with\\s+third\\s+parties"],
    why: "Verilerin kimlerle paylaşıldığı net değilse, gizlilik riski artar.",
    redLine: "Belirsiz paylaşım = veri kontrolü zayıf.",
    templates: [
      "Paylaşım amacı, kimlerle paylaşıldığı ve saklama süresi yazılsın.",
      "Açık rıza veya kapatma (opt-out) seçeneği olsun."
    ]
  },

  // ---- Freelancer / hizmet sözleşmesi odaklı kurallar ----
  {
    id: "unlimited_revisions",
    title: "Sınırsız revizyon",
    packs: ["hizmet"],
    severity: "HIGH",
    category: "Kapsam & Teslimat",
    affects: ["hizmet_veren", "all"],
    patterns: ["sınırsız\\s+revizyon", "unlimited\\s+revisions", "limitsiz\\s+revizyon"],
    why: "Sınırsız revizyon, işi uzatır ve emeğini değersizleştirir.",
    redLine: "Sınırsız revizyon = süre ve gelir kaybı.",
    templates: [
      "Revizyon sayısını yazdır (örn. 2 tur).",
      "Ek revizyonlar ücretli olsun."
    ]
  },
  {
    id: "acceptance_missing",
    title: "Onay/teslim kabul süreci belirsiz",
    packs: ["hizmet"],
    severity: "MEDIUM",
    category: "Kapsam & Teslimat",
    affects: ["hizmet_veren", "all"],
    patterns: ["kabul\\s+süreci", "acceptance", "teslim\\s+kabul", "itiraz\\s+süresi"],
    why: "Kabul süreci net değilse, onay uzar ve ödeme gecikebilir.",
    redLine: "Kabul belirsiz = ödeme belirsiz.",
    templates: [
      "Teslim sonrası itiraz süresi koy (örn. 3 iş günü).",
      "Süre içinde itiraz yoksa kabul sayılır yazdır."
    ]
  },
  {
    id: "payment_after_approval_only",
    title: "Ödeme sadece onay/teslim sonrası (muğlak)",
    packs: ["hizmet"],
    severity: "HIGH",
    category: "Ödeme",
    affects: ["hizmet_veren", "all"],
    patterns: ["ödeme\\s+teslim\\s+sonrası", "ödeme\\s+onay\\s+sonrası", "payment\\s+after\\s+acceptance"],
    why: "Ödeme tamamen onaya bağlıysa, karşı taraf ödemeyi kolayca uzatabilir.",
    redLine: "Onay gecikirse paran gecikir.",
    templates: [
      "Aşamalı ödeme iste (başlangıç + teslim).",
      "Onay gecikirse otomatik kabul/ödeme tarihi eklet."
    ]
  },
  {
    id: "broad_confidentiality",
    title: "Aşırı geniş gizlilik yükümlülüğü",
    packs: ["genel", "hizmet", "saas"],
    severity: "MEDIUM",
    category: "Veri & Gizlilik",
    affects: ["hizmet_veren", "all"],
    patterns: ["gizlilik\\s+yükümlülüğü", "confidentiality", "süresiz\\s+gizlilik", "perpetual\\s+confidentiality"],
    why: "Gizlilik çok genişse, normal iletişim bile riskli hale gelebilir.",
    redLine: "Aşırı gizlilik = istemeden ihlal riski.",
    templates: [
      "Gizliliğe süre koy (örn. 2 yıl).",
      "Kamuya açık bilgi ve yasal zorunlulukları hariç tut."
    ]
  },
  // ---- Uyuşmazlık / sözleşme yönetimi ----
{
  id: "exclusive_jurisdiction",
  title: "Tek taraf lehine yetkili mahkeme / münhasır yetki",
    packs: ["genel", "kira", "satis", "hizmet", "saas"],
    packAdjust: { etkinlik: 0.7 },
  severity: "MEDIUM",
  category: "Uyuşmazlık",
  affects: ["all"],
  patterns: [
    "münhasır\\s+yetki",
    "yalnızca\\s+.*\\s+mahkemeleri\\s+yetkilidir",
    "yetkili\\s+mahkeme\\s+.*\\s+münhasır",
    "exclusive\\s+jurisdiction",
    "only\\s+the\\s+courts\\s+of\\s+"
  ],
  why: "Yetkili mahkeme uzak bir yerdeyse, hak aramak masraflı ve zor olur.",
  redLine: "Uzak/yabancı yetki: pratikte dava etmek zorlaşır.",
  templates: [
    "Yetkiyi dengeli yap (tarafların yerleşim yeri gibi).",
    "En azından makul bir şehir seç."
  ]
},
{
  id: "mandatory_arbitration",
  title: "Tahkim zorunluluğu",
    packs: ["genel", "satis", "saas", "hizmet"],
  severity: "MEDIUM",
  category: "Uyuşmazlık",
  affects: ["all"],
  patterns: [
    "tahkim\\s+yolu\\s+zorunlu",
    "tahkim\\s+şartı",
    "tahkim\\s+kurulu",
    "arbitraj",
    "arbitration\\s+shall\\s+be\\s+the\\s+exclusive",
    "binding\\s+arbitration"
  ],
  why: "Tahkim bazen hızlıdır ama masraflı olabilir; küçük işler için pahalıya gelir.",
  redLine: "Tahkim masrafı: küçük alacakta hak aramak zorlaşır.",
  templates: [
    "Tahkim yerine mahkeme/arab﻿uluculuk seçeneği eklet.",
    "Tahkim yeri, dili ve masraf paylaşımı net olsun."
  ]
},
{
  id: "notice_portal_only",
  title: "Bildirimler sadece portal/tek kanal üzerinden",
    packs: ["saas", "genel"],
  severity: "MEDIUM",
  category: "Sözleşme Yönetimi",
  affects: ["all"],
  patterns: [
    "bildirimler\\s+yalnızca\\s+.*\\s+üzerinden\\s+yapılır",
    "sadece\\s+portal\\s+üzerinden\\s+bildirim",
    "e\\-?posta\\s+ile\\s+bildirim\\s+geçersiz",
    "notices\\s+shall\\s+be\\s+given\\s+only\\s+via",
    "email\\s+notice\\s+shall\\s+not\\s+be\\s+valid"
  ],
  why: "Bildirim tek kanala bağlıysa, erişim sorunu yaşarsan hak kaybı olur.",
  redLine: "Tek kanal: iptal/fesih bildirimini kaçırabilirsin.",
  templates: [
    "E-posta gibi alternatif bildirim eklet.",
    "Bildirim alındı teyidi/otomatik onay e-postası iste."
  ]
},
{
  id: "assignment_unilateral",
  title: "Sözleşmenin tek taraflı devri (assignment)",
    packs: ["genel", "saas", "hizmet", "satis"],
  severity: "HIGH",
  category: "Sözleşme Yönetimi",
  affects: ["all"],
  patterns: [
    "hak\\s+ve\\s+yükümlülüklerini\\s+üçüncü\\s+kişilere\\s+devredebilir",
    "sözleşmeyi\\s+devredebilir",
      "sözleşmeyi\\s+.*\\s+devredebilir",
    "devir\\s+ve\\s+temlik",
    "assign\\s+this\\s+agreement",
    "may\\s+assign\\s+without\\s+consent"
  ],
  why: "Karşı taraf sözleşmeyi iznin olmadan devrederse, muhatabın değişir ve risk artar.",
  redLine: "Muhatap değişimi: yeni tarafa güvenmek zorunda kalırsın.",
  templates: [
    "Devir için yazılı onay şartı iste.",
    "Sadece grup şirketlerine + bildirim şartıyla devredilsin."
  ]
},
{
  id: "subcontractor_unrestricted",
  title: "Alt yüklenici / üçüncü kişi kullanımı sınırsız",
    packs: ["hizmet", "genel"],
    packAdjust: { etkinlik: 0.5 },
  severity: "MEDIUM",
  category: "Sözleşme Yönetimi",
  affects: ["all"],
  patterns: [
    "alt\\s+yüklenici",
    "taşeron",
    "üçüncü\\s+kişilerden\\s+hizmet\\s+alabilir",
    "subcontract(or|ing)",
    "may\\s+use\\s+third\\s+parties"
  ],
  why: "Alt yüklenici kontrolsüzse, kalite ve gizlilik sorunları çıkabilir.",
  redLine: "Kontrolsüz taşeron: veri/kalite riski.",
  templates: [
    "Alt yüklenici kullanımı için onayın olsun.",
    "Gizlilik ve sorumluluk taşerona da aynı şekilde uygulansın."
  ]
},
{
  id: "force_majeure_broad",
  title: "Mücbir sebep kapsamı aşırı geniş",
    packs: ["genel", "hizmet", "satis", "kira", "saas"],
    packAdjust: { etkinlik: 0.8 },
  severity: "MEDIUM",
  category: "Süre",
  affects: ["all"],
  patterns: [
    // Not: "mücbir sebep" ifadesi birçok sözleşmede standart başlık olarak geçer.
    // Bu kural sadece kapsamı "aşırı genişleten" sinyalleri yakalamayı hedefler.
    "altyapı\\s+arıza",
    "internet\\s+kesintisi",
    "tedarikçi\\s+sorunu",
    "piyasa\\s+koşullar(ı|i)",
    "döviz\\s+kur(u|ları)?",
    "kur\\s+fark(ı|i)",
    "enflasyon",
    "finansal\\s+kriz",
    "ekonomik\\s+kriz",
    "iş\\s+gücü\\s+yetersizliği",
    "personel\\s+yetersizliği",
    "tedarik\\s+zinciri",
    "hammadde"
  ],
  why: "Mücbir sebep çok genişse, normal aksaklıklar bile 'bahane' sayılabilir.",
  redLine: "Geniş mücbir sebep: gecikmeler normalleşir.",
  templates: [
    "Mücbir sebebi dar tanımla (kontrol dışı, öngörülemez olaylar).",
    "Uzun sürerse fesih ve iade/ödeme haklarını yazdır."
  ]
},

// ---- Ödeme / ücret detayları ----
{
  id: "unilateral_price_increase",
  title: "Ücret/fiyat tek taraflı artırılabilir",
    packs: ["saas", "hizmet", "genel"],
    packAdjust: { etkinlik: 0.8 },
  severity: "HIGH",
  category: "Ödeme",
  affects: ["hizmet_alan", "alici", "kiraci", "all"],
  patterns: [
    "ücretler\\s+.*\\s+güncellenebilir",
    "fiyat(lar)?\\s+değiştirilebilir",
    "tek\\s+taraflı\\s+zam",
    "price\\s+may\\s+change",
    "we\\s+may\\s+increase\\s+fees",
    "fees\\s+are\\s+subject\\s+to\\s+change"
  ],
  why: "Ücret tek taraflı artarsa, bütçen bozulur ve sürpriz ödeme çıkabilir.",
  redLine: "Zam hakkı: ya öde ya vazgeç.",
  templates: [
    "Artıştan önce bildirim + cezasız iptal hakkı iste.",
    "Artışa üst sınır veya endeks şartı eklet."
  ]
},
{
  id: "late_interest_and_costs",
  title: "Gecikme faizi / tahsil masrafları",
    packs: ["genel", "hizmet", "satis", "kira", "saas"],
    packAdjust: { etkinlik: 0.8 },
  severity: "MEDIUM",
  category: "Ödeme",
  affects: ["all"],
  patterns: [
    "gecikme\\s+faizi",
    "temerrüt\\s+faizi",
    "tahsil\\s+masrafları",
    "icra\\s+masrafları",
    "collection\\s+costs",
    "interest\\s+at\\s+the\\s+rate"
  ],
  why: "Faiz/masraf yüksekse, küçük gecikmede bile borç hızlı büyür.",
  redLine: "Yüksek faiz: borç şişer.",
  templates: [
    "Faiz oranı açık yazılsın ve üst sınır olsun.",
    "Masraflar makul ve belgeli olsun."
  ]
},
{
  id: "attorney_fee_shift",
  title: "Avukatlık ücreti / yargılama giderleri tek tarafa yüklenmiş",
    packs: ["genel", "kira", "satis", "hizmet", "saas"],
    packAdjust: { etkinlik: 0.8 },
  severity: "MEDIUM",
  category: "Uyuşmazlık",
  affects: ["all"],
  patterns: [
    "avukatlık\\s+ücreti\\s+.*\\s+karşı\\s+taraf",
    "yargılama\\s+giderleri\\s+.*\\s+karşı\\s+taraf",
    "tüm\\s+masraflar\\s+karşı\\s+tarafa\\s+aittir",
    "attorneys'?\\s+fees\\s+shall\\s+be\\s+paid\\s+by"
  ],
  why: "Tüm avukatlık/yargılama gideri sana yüklenirse, hak aramak pahalıya gelir.",
  redLine: "Masraf baskısı: haklı olsan bile vazgeçebilirsin.",
  templates: [
    "Giderler mahkeme kararına göre olsun veya dengeli paylaşılsın.",
    "Makul bir üst limit eklet."
  ]
},

// ---- Garanti / sorumluluk reddi ----
{
  id: "as_is_no_warranty",
  title: "Garanti reddi / 'olduğu gibi' (as-is) şartı",
    packs: ["genel", "satis"],
  severity: "HIGH",
  category: "Sorumluluk",
  affects: ["hizmet_alan", "alici", "kiraci", "all"],
  patterns: [
    "olduğu\\s+gibi",
    "hiçbir\\s+garanti\\s+verilmez",
    "garanti\\s+vermez",
    "as\\-?is",
    "no\\s+warranty",
    "merchantability",
    "fitness\\s+for\\s+a\\s+particular\\s+purpose"
  ],
  why: "'Olduğu gibi' maddesi çok genişse, eksik/hatalı işte bile hak aramak zorlaşır.",
  redLine: "As-is: sorun çıksa bile 'kabul ettin' denebilir.",
  templates: [
    "Minimum teslim/performans kriterlerini yazdır.",
    "Sorun olursa düzeltme veya iade/indirim hakkı eklet."
  ]
},

// ---------------------------------------------------------------------------
// KREDİ / BORÇ (kredi)
// ---------------------------------------------------------------------------
{
  id: "kredi_muacceliyet",
  title: "Muacceliyet / borcun tamamının erken istenmesi",
  category: "Ödeme",
  packs: ["kredi"],
  severity: "HIGH",
  patterns: [
    "muaccel",
    "borcun\s+tamam[ıi]\s+muaccel",
    "t[uü]m\s+bor[cç].{0,40}muaccel",
    "kalan\s+t[uü]m\s+taksit.{0,40}derhal\s+isten",
  ],
  why:
    "Muacceliyet varsa küçük bir gecikme/ihlalde bile borcun tamamı bir anda istenebilir; bu da nakit akışını zorlayabilir.",
  ask:
    "Muacceliyet tetikleyicileri net yazılsın (kaç gün gecikme gibi) ve mümkünse önce yazılı ihtar + makul süre (örn. 7-14 gün) tanınsın.",
  packAdjust: { kredi: 0.95 },
},
{
  id: "kredi_degisken_faiz",
  title: "Faizin tek taraflı / belirsiz değiştirilebilmesi",
  category: "Ödeme",
  packs: ["kredi"],
  severity: "MEDIUM",
  patterns: [
    "(faiz|k[aâ]r\s+pay[ıi]).{0,80}(tek\s+tarafl[ıi]|diledi[gğ]inde|her\s+zaman).{0,80}(de[gğ]i[sş]tir|g[uü]ncelle)",
    "faiz\s+oran[ıi].{0,60}de[gğ]i[sş]tirilebilir",
    "banka.{0,80}faiz.{0,40}belirler",
  ],
  why:
    "Faiz/ücretin tek taraflı değişmesi, toplam maliyeti öngörülemez hale getirir.",
  ask:
    "Faiz/masraf değişiklikleri için açık yöntem (endeks/formül), önceden bildirim ve kabul etmiyorsan fesih/erken kapama hakkı yazılsın.",
  packAdjust: { kredi: 0.95 },
},
{
  id: "kredi_kefalet_muteselsil",
  title: "Kefalet / müştereken ve müteselsil sorumluluk",
  category: "Sorumluluk",
  packs: ["kredi"],
  severity: "HIGH",
  patterns: [
    "m[uü]teselsil\s+kefil",
    "\bkefil\b",
    "m[uü][sş]tereken\s+ve\s+m[uü]teselsilen",
    "garant[oö]r",
  ],
  why:
    "Kefalet veya müteselsil sorumluluk, borçlunun ödememesi halinde senin de borcun tamamından sorumlu tutulmana yol açabilir.",
  ask:
    "Kefalet gerekiyorsa tutar/süre sınırı koy ve kefaletin hangi koşulda devreye gireceğini netleştir (önce borçluya takip gibi).",
  packAdjust: { kredi: 0.95 },
},
{
  id: "kredi_teminat_ipotek_rehin",
  title: "Teminat / ipotek / rehin / blokaj",
  category: "Sorumluluk",
  packs: ["kredi"],
  severity: "MEDIUM",
  patterns: ["ipotek", "rehin", "teminat", "blokaj", "temlik"],
  why:
    "Teminat hükümleri, varlıkların üzerinde ek yük oluşturabilir ve tahsilat riskini artırabilir.",
  ask:
    "Teminat kapsamını daralt (hangi varlık, hangi değer), teminatın hangi koşulda paraya çevrileceğini açık yaz ve teminat iadesi şartlarını ekle.",
  packAdjust: { kredi: 0.9 },
},
{
  id: "kredi_tahsil_masraf_avukat",
  title: "Tahsil / takip masrafları ve avukatlık ücretinin borçluya yüklenmesi",
  category: "Ödeme",
  packs: ["kredi"],
  severity: "MEDIUM",
  patterns: [
    "tahsil\s+masraf",
    "takip\s+masraf",
    "icra\s+masraf",
    "avukatl[ıi]k\s+u[uü]cret",
    "yarg[ıi]lama\s+gider",
  ],
  why:
    "Gecikme halinde ana borcun üstüne masraf/ücret eklenebilir; toplam maliyet hızla artar.",
  ask:
    "Masraflar 'makul ve belgelendirilebilir' olsun; mümkünse üst sınır veya oran koy.",
  packAdjust: { kredi: 0.9 },
},

// ---------------------------------------------------------------------------
// SİGORTA / POLİÇE (sigorta)
// ---------------------------------------------------------------------------
{
  id: "sigorta_genis_istisna",
  title: "Kapsam dışı / istisna hükümleri geniş",
  category: "Sözleşme Yönetimi",
  packs: ["sigorta"],
  severity: "MEDIUM",
  patterns: ["kapsam\s+d[ıi][sş][ıi]", "teminat\s+d[ıi][sş][ıi]", "istisna", "\bhari[cç]\b"],
  why:
    "İstisnalar çok genişse, beklediğin teminat pratikte devreye girmeyebilir.",
  ask:
    "En kritik riskler için istisnaların daraltılmasını iste; 'teminat kapsamı' maddesini net örneklerle yazdır.",
  packAdjust: { sigorta: 0.95 },
},
{
  id: "sigorta_ihbar_suresi_kisa",
  title: "Hasar/ihbar süresi çok kısa olabilir",
  category: "Sözleşme Yönetimi",
  packs: ["sigorta"],
  severity: "HIGH",
  patterns: [
    "(hasar|riziko|ihbar|bildirim).{0,60}(24|48|72)\s*saat",
    "(hasar|riziko|ihbar|bildirim).{0,60}\b(1|2|3)\s*g[uü]n\b",
  ],
  why:
    "Çok kısa ihbar süresi, geç bildirimi gerekçe gösterip tazminatı reddetme riskini artırır.",
  ask:
    "Bildirim süresi makul olsun (örn. 7-15 gün) ve 'haklı sebep' varsa gecikmenin kabul edileceği açık yazılsın.",
  packAdjust: { sigorta: 0.95 },
},
{
  id: "sigorta_muafiyet_katilim",
  title: "Muafiyet / katılım payı var",
  category: "Ödeme",
  packs: ["sigorta"],
  severity: "MEDIUM",
  patterns: ["muafiyet", "kat[ıi]l[ıi]m\s+pay[ıi]", "m[uü][sş]terek\s+sigorta"],
  why:
    "Muafiyet, hasarın belirli kısmını senin karşılaman demektir; beklenen korumayı azaltır.",
  ask:
    "Muafiyet tutarı/oranı açık yazılsın ve mümkünse düşürülsün; muafiyetin hangi hallerde uygulanacağı netleştirilsin.",
  packAdjust: { sigorta: 0.95 },
},
{
  id: "sigorta_fesih_tek_taraf",
  title: "Sigortacının tek taraflı fesih/iptal yetkisi",
  category: "Sözleşme Yönetimi",
  packs: ["sigorta"],
  severity: "HIGH",
  patterns: [
    "(sigortac[ıi]|[sş]irket).{0,80}(tek\s+tarafl[ıi]|diledi[gğ]inde).{0,80}(fesih|iptal)",
    "poli[cç]e.{0,60}(tek\s+tarafl[ıi]).{0,60}(sonland[ıi]r|fesih|iptal)",
  ],
  why:
    "Tek taraflı fesih, ihtiyaç anında teminatsız kalma riskini artırır.",
  ask:
    "Fesih ancak sınırlı ve objektif sebeplerle olsun; önceden bildirim ve prim iadesi şartları yazılsın.",
  packAdjust: { sigorta: 0.95 },
},
{
  id: "sigorta_prim_artisi",
  title: "Prim/ücretin yenilemede belirsiz artabilmesi",
  category: "Ödeme",
  packs: ["sigorta"],
  severity: "MEDIUM",
  patterns: ["prim.{0,40}(art[ıi]r|de[gğ]i[sş]tir)", "yenileme.{0,60}prim"],
  why:
    "Yenilemede prim artışı öngörülemezse bütçe planlamak zorlaşır.",
  ask:
    "Prim değişim kriterleri (hasarsızlık, enflasyon vb.) açık yazılsın; sürpriz artışlarda fesih hakkın olsun.",
  packAdjust: { sigorta: 0.9 },
},

// ---------------------------------------------------------------------------
// ABONELİK / TAAHHÜT (abonelik)
// ---------------------------------------------------------------------------
{
  id: "abonelik_cayma_bedeli",
  title: "Cayma bedeli / erken fesih bedeli",
  category: "Cezalar",
  packs: ["abonelik"],
  severity: "HIGH",
  patterns: ["cayma\s+bedeli", "erken\s+fesih\s+bedeli", "taahh[uü]t.{0,40}cayma"],
  why:
    "Taahhüt bitmeden ayrılırsan ciddi bir bedel çıkabilir; toplam maliyet beklenenden yüksek olur.",
  ask:
    "Cayma bedeli hesabı net yazılsın (kalan indirimler gibi) ve mümkünse üst sınır konulsun.",
  packAdjust: { abonelik: 0.85 },
},
{
  id: "abonelik_otomatik_yenileme",
  title: "Otomatik yenileme / süre uzaması",
  category: "Sözleşme Yönetimi",
  packs: ["abonelik"],
  severity: "MEDIUM",
  patterns: ["otomatik.{0,20}yenilen", "aksi\s+bildirilmedik[cç]e.{0,60}uzar", "yenileme\s+d[oö]nemi"],
  why:
    "Otomatik yenileme, istemeden yeni bir dönem/taahhüde girmene yol açabilir.",
  ask:
    "Yenileme için açık onay (opt-in) iste veya en azından kolay iptal + net hatırlatma süresi (örn. 15-30 gün) olsun.",
  packAdjust: { abonelik: 0.9 },
},
{
  id: "abonelik_fiyat_tek_taraf",
  title: "Ücret/tarifenin tek taraflı değiştirilebilmesi",
  category: "Ödeme",
  packs: ["abonelik"],
  severity: "MEDIUM",
  patterns: [
    "(u[uü]cret|fiyat|tarife).{0,80}(tek\s+tarafl[ıi]|diledi[gğ]inde).{0,80}(de[gğ]i[sş]tir|g[uü]ncelle)",
    "(u[uü]cret|fiyat|tarife).{0,60}de[gğ]i[sş]tirilebilir",
  ],
  why:
    "Tek taraflı ücret değişikliği, taahhüt boyunca maliyeti öngörülemez yapabilir.",
  ask:
    "Ücret değişikliği olursa cezasız fesih/taahhüt bozma hakkı yazılsın; bildirim süresi net olsun.",
  packAdjust: { abonelik: 0.9 },
},
{
  id: "abonelik_adil_kullanim_kisit",
  title: "Hizmetin tek taraflı kısıtlanması (kota / hız düşürme vb.)",
  category: "Sözleşme Yönetimi",
  packs: ["abonelik"],
  severity: "MEDIUM",
  patterns: ["adil\s+kullan[ıi]m", "(h[ıi]z|kota).{0,60}(d[uü][sş][uü]r[uü]lebilir|s[ıi]n[ıi]rland[ıi]r[ıi]labilir)"],
  why:
    "Hizmet kalitesi tek taraflı düşürülebiliyorsa, fiilen aldığın hizmet değişebilir.",
  ask:
    "Kısıtlama şartları net olsun; ölçütler (kota, hız) açık yazılsın; aşımda alternatifler (paket yükseltme) sunulsun.",
  packAdjust: { abonelik: 0.9 },
},
{
  id: "abonelik_fatura_itiraz_suresi",
  title: "Fatura itiraz süresi kısa olabilir",
  category: "Sözleşme Yönetimi",
  packs: ["abonelik"],
  severity: "MEDIUM",
  patterns: ["fatura.{0,60}itiraz.{0,20}\b(7|10|15)\s*g[uü]n\b"],
  why:
    "İtiraz süresi çok kısaysa, fark etmediğin bir hatalı fatura kesinleşebilir.",
  ask:
    "İtiraz süresi makul olsun (örn. 30 gün) ve itirazın inceleme süreci açık yazılsın.",
  packAdjust: { abonelik: 0.9 },
},

// ---------------------------------------------------------------------------
// ARAÇ / RENT A CAR (arac)
// ---------------------------------------------------------------------------
{
  id: "arac_hasar_deger_kaybi",
  title: "Hasar / değer kaybı ve ek masraflar geniş",
  category: "Sorumluluk",
  packs: ["arac"],
  severity: "HIGH",
  patterns: [
    "de[gğ]er\s+kayb[ıi]",
    "hasar.{0,80}(tazmin|bedel|u[uü]cret)",
    "servis\s+bedeli",
    "cekici|[cç]ekici",
    "ikame\s+ara[cç]",
  ],
  why:
    "Hasar/ek masraflar geniş yazılırsa küçük bir olayda bile yüksek tutarlar çıkabilir (değer kaybı, çekici, ikame araç vb.).",
  ask:
    "Masraf kalemleri tek tek yazılsın, belgelendirme şartı olsun ve mümkünse üst sınır/muafiyet netleştirilsin.",
  packAdjust: { arac: 0.95 },
},
{
  id: "arac_km_limit_asim",
  title: "Kilometre limiti ve aşım ücreti",
  category: "Ödeme",
  packs: ["arac"],
  severity: "MEDIUM",
  patterns: ["(km|kilometre).{0,60}(limit|s[ıi]n[ıi]r).{0,60}(a[sş][ıi]m|fazla).{0,60}(u[uü]cret|bedel)"],
  why:
    "KM limiti düşükse veya aşım ücreti yüksekse toplam maliyet beklenenden fazla olabilir.",
  ask:
    "KM limiti ihtiyacına uygun olsun; aşım ücretleri açık yazılsın ve makul seviyede olsun.",
  packAdjust: { arac: 0.95 },
},
{
  id: "arac_depozito_iade_yok",
  title: "Depozito/kaporanın iadesi kısıtlı olabilir",
  category: "Ödeme",
  packs: ["arac"],
  severity: "MEDIUM",
  patterns: ["depozito.{0,40}iade\s+edilmez", "kapora.{0,40}iade\s+edilmez", "depozito.{0,60}kesinti"],
  why:
    "Depozito iadesi belirsizse gereksiz kesintiler yaşanabilir.",
  ask:
    "Depozito iade süresi (örn. 7-14 gün) ve hangi hallerde ne kadar kesinti yapılacağı net yazılsın.",
  packAdjust: { arac: 0.9 },
},
{
  id: "arac_gps_izleme",
  title: "Araçta konum takibi / izleme",
  category: "Sözleşme Yönetimi",
  packs: ["arac"],
  severity: "MEDIUM",
  patterns: ["\bgps\b", "konum\s+takip", "takip\s+sistemi", "telemetri"],
  why:
    "Konum takibi kişisel veri/mahremiyet açısından önemli olabilir; ayrıca kullanım kısıtları (bölge dışı vb.) doğurabilir.",
  ask:
    "Hangi verilerin toplandığı, saklama süresi ve amaç açık yazılsın; gereksiz izleme kaldırılabilsin.",
  packAdjust: { arac: 0.9 },
},
{
  id: "arac_sigorta_kapsam_sinirli",
  title: "Sigorta/kasko kapsamı sınırlı veya muafiyetli olabilir",
  category: "Sorumluluk",
  packs: ["arac"],
  severity: "MEDIUM",
  patterns: ["(kasko|sigorta).{0,80}(kapsam\s+d[ıi][sş][ıi]|hari[cç]|muafiyet)"],
  why:
    "Kasko/sigorta kapsamı dar veya muafiyet yüksekse hasarın önemli kısmı sana kalabilir.",
  ask:
    "Kapsam, muafiyet ve istisnalar net yazılsın; mümkünse muafiyet düşürülsün.",
  packAdjust: { arac: 0.95 },
},

// ---------------------------------------------------------------------------
// SEYAHAT / TUR / OTEL (seyahat)
// ---------------------------------------------------------------------------
{
  id: "seyahat_iptal_iade_yok",
  title: "İptal/iade kısıtlı veya iadesiz",
  category: "Cezalar",
  packs: ["seyahat"],
  severity: "HIGH",
  patterns: [
    "(iptal|vazge[cç]me|cayma).{0,80}(iade\s+yap[ıi]lmaz|u[uü]cret\s+iadesi\s+yok|iade\s+edilmez)",
    "no\s+refund",
  ],
  why:
    "İptal halinde iade yoksa plan değişikliğinde ciddi kayıp yaşanabilir.",
  ask:
    "İptal koşulları kademeli olsun (tarihe göre); en azından vergiler/harçlar gibi kalemler iade edilsin.",
  packAdjust: { seyahat: 0.9 },
},
{
  id: "seyahat_program_degisebilir",
  title: "Program/otel/güzergah değişikliği tek taraflı",
  category: "Sözleşme Yönetimi",
  packs: ["seyahat"],
  severity: "MEDIUM",
  patterns: ["(program|g[uü]zergah|otel).{0,80}(de[gğ]i[sş]tirilebilir|de[gğ]i[sş]iklik\s+yapabilir|muadil)"],
  why:
    "Tek taraflı program/otel değişiklikleri, beklenti ve kaliteyi düşürebilir.",
  ask:
    "Değişiklik olursa muadil standardı (yıldız, konum vb.) yazılsın ve önemli değişiklikte ücretsiz iptal hakkın olsun.",
  packAdjust: { seyahat: 0.9 },
},
{
  id: "seyahat_ek_ucretler_haric",
  title: "Ek ücretler / vergiler / harçlar dahil değil",
  category: "Ödeme",
  packs: ["seyahat"],
  severity: "MEDIUM",
  patterns: ["(ek\s+u[uü]cret|vergi|har[cç]|servis\s+bedeli).{0,60}(dahil\s+de[gğ]il|hari[cç])"],
  why:
    "Toplam fiyatı sonradan yükselten 'hariç' kalemler sürpriz maliyet doğurabilir.",
  ask:
    "Toplam fiyata dahil/hariç kalemler madde madde listelensin; hariç olanların yaklaşık tutarı yazılsın.",
  packAdjust: { seyahat: 0.9 },
},
{
  id: "seyahat_pasaport_vize_sorumluluk",
  title: "Pasaport/vize sorumluluğu tamamen katılımcıya bırakılmış",
  category: "Sözleşme Yönetimi",
  packs: ["seyahat"],
  severity: "MEDIUM",
  patterns: ["(pasaport|vize).{0,80}sorumluluk", "(vize|pasaport).{0,80}(tamamen|m[uü][sş]teriye|kat[ıi]l[ıi]mc[ıi]ya)"],
  why:
    "Vize/pasaport sürecinde eksik bilgilendirme olursa hak kaybı yaşayabilirsin.",
  ask:
    "Gerekli belgeler ve süreler yazılsın; acente/otelin bilgilendirme yükümlülüğü netleştirilsin.",
  packAdjust: { seyahat: 0.85 },
},

// ---------------------------------------------------------------------------
// EĞİTİM / KURS / ATÖLYE (egitim)
// ---------------------------------------------------------------------------
{
  id: "egitim_iade_yok",
  title: "Ücret iadesi yok / çok kısıtlı",
  category: "Ödeme",
  packs: ["egitim"],
  severity: "HIGH",
  patterns: ["(iade|u[uü]cret\s+iadesi).{0,60}(yap[ıi]lmaz|edilmez|yoktur|m[uü]mk[uü]n\s+de[gğ]ildir)"],
  why:
    "Program değişikliği veya memnuniyetsizlikte iade yoksa maddi kayıp artar.",
  ask:
    "En azından belirli bir süre/ilk dersler içinde cayma-iade opsiyonu veya kısmi iade yazılsın.",
  packAdjust: { egitim: 0.9 },
},
{
  id: "egitim_program_degisebilir",
  title: "Program/içerik/eğitmen değişikliği tek taraflı",
  category: "Sözleşme Yönetimi",
  packs: ["egitim"],
  severity: "MEDIUM",
  patterns: ["(program|i[cç]erik|e[gğ]itmen|tarih|saat).{0,80}(de[gğ]i[sş]tirilebilir|de[gğ]i[sş]iklik\s+yapabilir)"],
  why:
    "Tek taraflı değişiklikler, aldığın hizmetin kapsamını ve değerini etkileyebilir.",
  ask:
    "Büyük değişikliklerde ücretsiz iptal/iade hakkın olsun; değişiklikler için önceden bildirim zorunlu olsun.",
  packAdjust: { egitim: 0.9 },
},
{
  id: "egitim_devamsizlik_hak_kaybi",
  title: "Devamsızlıkta hak kaybı / telafi yok",
  category: "Sözleşme Yönetimi",
  packs: ["egitim"],
  severity: "MEDIUM",
  patterns: ["(devams[ıi]zl[ıi]k|kat[ıi]lmama).{0,80}(hak\s+kayb[ıi]|telafi\s+yok|iade\s+yok)"],
  why:
    "Tek bir kaçırılan derste tüm hakkın yanması adil olmayabilir.",
  ask:
    "Telafi dersi/kayıt paylaşımı gibi seçenekler iste; en azından belirli sayıda telafi hakkı tanımlansın.",
  packAdjust: { egitim: 0.85 },
},
{
  id: "egitim_kurum_fesih",
  title: "Kurumun tek taraflı fesih/çıkarma yetkisi",
  category: "Sözleşme Yönetimi",
  packs: ["egitim"],
  severity: "MEDIUM",
  patterns: ["(kurum|e[gğ]itim\s+kurumu|sa[gğ]lay[ıi]c[ıi]).{0,80}(tek\s+tarafl[ıi]|diledi[gğ]inde).{0,80}(fesih|sonland[ıi]r|kayd[ıi]n[ıi]\s+sil)"],
  why:
    "Tek taraflı fesih, ödediğin ücretin yanmasına veya eğitimin yarıda kalmasına yol açabilir.",
  ask:
    "Fesih sebepleri objektif olsun; fesih halinde kullanılmayan dönemin iadesi yazılsın.",
  packAdjust: { egitim: 0.85 },
}
];

const SEVERITY_WEIGHT = { LOW: 5, MEDIUM: 10, HIGH: 18, CRITICAL: 25 };
const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

module.exports = { RULES, SEVERITY_WEIGHT, SEVERITY_RANK };
