import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { analyzeContract } = require('../src/services/analyzer');
const { PACK_OPTIONS } = require('../src/services/contractMeta');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const BALANCED = {
  genel: `Taraflar arasında hizmetin kapsamı yazılı olarak belirlenmiştir. Değişiklikler karşılıklı yazılı onay ile yapılır. Sorumluluk toplam sözleşme bedeli ile sınırlıdır. Dolaylı zarar ve kar kaybı hariçtir. Fesihte 14 gün yazılı bildirim ve tamamlanan iş için orantılı ödeme yapılır.`,
  hizmet: `Hizmet veren proje kapsamındaki teslimleri 2 revizyon ile sunar. Ek revizyon ücretlidir. Teslimden sonra 3 iş günü içinde itiraz yoksa kabul edilmiş sayılır. Sorumluluk toplam sözleşme bedeli ile sınırlıdır. Fesihte tamamlanan iş ve belgeli masraflar ödenir.`,
  influencer: `Marka iş birliği kapsamında 2 post ve 3 story paylaşılacaktır. Kullanım hakkı 6 ay ile sınırlıdır. İçerik değişiklikleri yazılı onay ile yapılır. İptalde tamamlanan içerikler için orantılı ödeme yapılır.`,
  etkinlik: `Düğün tarihi 28 Ağustos 2026'dır. Garanti kişi sayısı 300'dür. İptal halinde 60 gün öncesine kadar kapora iade edilmez ancak tarih değişikliği veya erteleme mümkündür. Sorumluluk doğrudan ve ispatlı zararlarla sınırlıdır; dolaylı zararlar hariçtir.`,
  kira: `Kira artışı TÜFE oranı ile sınırlıdır. Depozito hasarsız teslimde iade edilir. Tahliye için yazılı bildirim süresi 30 gündür.`,
  satis: `Satıcı ayıplı mal halinde onarım, değişim veya iade seçeneklerini kabul eder. Garanti kapsamı yazılıdır. Sorumluluk sözleşme bedeli ile sınırlıdır.`,
  saas: `Abonelik aylık yenilenir ancak yenilemeden 14 gün önce e-posta ile bildirim yapılır. Müşteri e-posta ile iptal edebilir. Hizmet kesintisinde service credit uygulanır. Sorumluluk toplam 12 aylık ücretle sınırlıdır.`,
  is: `İşveren aylık ücret, SGK ve izin haklarını açıkça belirtir. Fesihte kanuni ihbar ve kıdem hükümleri uygulanır. Rekabet yasağı 6 ay ve belirli müşteri listesi ile sınırlıdır.`,
  kredi: `Borçlu temerrüde düşerse önce 7 gün ek süre ve yazılı ihtar verilir. Temerrüt faizi aylık %2 ile sınırlıdır. Teminat borç kapanınca kaldırılır.`,
  egitim: `Kurs programı ve eğitmen listesi açıktır. Devamsızlık halinde telafi dersi imkanı vardır. İptalde programa göre kısmi iade veya başka döneme erteleme yapılabilir.`,
  gizlilik: `Taraflar gizli bilgileri üçüncü kişilerle paylaşmayacaktır. Kamuya açık bilgiler, daha önce bilinen bilgiler ve yasal zorunluluk halleri istisnadır.`,
  abonelik: `Üyelik otomatik yenilenir ancak 7 gün önce hatırlatma gönderilir. Müşteri e-posta ile iptal edebilir. Fiyat değişikliği önceden bildirilir ve müşteri isterse cezasız çıkabilir.`,
  arac: `Araç tesliminde tutanak ve fotoğraf alınır. Km aşım ücreti açıkça yazılıdır. Kasko dahildir ve depozito hasarsız iade edilir.`,
  seyahat: `Tur programı değişirse eşdeğer otel veya tarih değişikliği sunulur. İptalde rezervasyon tarihine göre kısmi iade yapılır. Ek ücretler önceden listelenmiştir.`,
  sigorta: `Poliçede teminatlar ve istisnalar açıkça listelenmiştir. Hasar ihbar süresi 10 gündür. Muafiyet oranı %5 ile sınırlıdır.`
};

const AGGRESSIVE = {
  genel: `Karşı taraf şartları tek taraflı olarak değiştirebilir. Gerekçe göstermeksizin derhal feshedebilir. Ücret iadesi yapılmaz. Dolaylı zarar ve kar kaybı dahil her türlü zarardan sınırsız sorumluluk kabul edilir.`,
  hizmet: `Sınırsız revizyon talep edilebilir. Ödeme sadece müşteri onayından sonra yapılır. Herhangi bir gerekçe göstermeksizin derhal feshedebilir. Tüm fikri mülkiyet hakları münhasıran devredilir.`,
  influencer: `Marka tüm içerikleri süresiz ve münhasıran kullanır. İçerikler onaysız değiştirilebilir. Performans düşük görülürse ücret iadesiz iptal edilir.`,
  etkinlik: `Cayma bedeli %50'dir. Son 14 günde ücretin tamamı cezai şart olarak tahsil edilir. Garanti kişi sayısı düşürülemez. Davetliler ve üçüncü kişilerden doğan tüm doğrudan ve dolaylı zararlardan müşteri sorumludur.`,
  kira: `Kiraya veren dilediği zaman kira bedelini tek taraflı artırabilir. Depozito iade edilmez. Bildirimsiz tahliye hakkı saklıdır.`,
  satis: `Satıcı ayıplı maldan sorumlu değildir. Ürün olduğu gibi teslim edilir ve hiçbir garanti verilmez. Tüm risk teslim anında alıcıya geçer.`,
  saas: `Abonelik otomatik yenilenir. Fiyatlar tek taraflı değiştirilebilir. Hizmet olduğu gibi sunulur, hiçbir garanti verilmez. Kesinti halinde iade veya hizmet kredisi yoktur.`,
  is: `İşveren gerekçe göstermeksizin derhal feshedebilir. Çalışan 2 yıl rekabet etmeme yükümlülüğünü kabul eder. Fazla mesai ücrete dahildir.`,
  kredi: `Bir taksidin gecikmesi halinde tüm borç muaccel olur. Aylık %5 temerrüt faizi uygulanır. Borçlu ve kefil müteselsilen sorumludur, avukatlık ve tahsil masrafları ayrıca ödenir.`,
  egitim: `Kurs ücreti iade edilmez. Program ve eğitmen tek taraflı değiştirilebilir. Kurum gerekçe göstermeksizin kaydı iptal edebilir.`,
  gizlilik: `Gizli bilgi çok geniş tanımlanmıştır ve hiçbir istisna yoktur. İhlal halinde sınırsız tazminat ödenir.`,
  abonelik: `Üyelik otomatik yenilenir ve iptal edilmediği sürece devam eder. Cayma bedeli uygulanır. Fiyatlar tek taraflı artırılabilir.`,
  arac: `Hasar, değer kaybı ve tüm masraflar kullanıcıya aittir. Depozito iade edilmez. Km aşımı yüksek ceza doğurur. GPS ile izleme yapılır.`,
  seyahat: `Tur iptalinde iade yapılmaz. Program ve otel tek taraflı değiştirilebilir. Vize ve ek ücretler tamamen müşteriye aittir.`,
  sigorta: `Şirket poliçeyi tek taraflı feshedebilir. Teminat istisnaları çok geniştir. Muafiyet yüksek tutulur ve hasar ihbar süresi 24 saattir.`
};

let checked = 0;
for (const pack of PACK_OPTIONS.map((x) => x.id)) {
  const balanced = analyzeContract(BALANCED[pack] || BALANCED.genel, { pack, role: 'genel' });
  const aggressive = analyzeContract(AGGRESSIVE[pack] || AGGRESSIVE.genel, { pack, role: 'genel' });
  assert(Number.isFinite(balanced.summary.riskScore), `${pack}: balanced riskScore invalid`);
  assert(Number.isFinite(aggressive.summary.riskScore), `${pack}: aggressive riskScore invalid`);
  assert(aggressive.summary.riskScore >= balanced.summary.riskScore, `${pack}: aggressive should score >= balanced (${aggressive.summary.riskScore} < ${balanced.summary.riskScore})`);
  checked += 1;
}

console.log(`✅ Scoring sanity passed (${checked} sözleşme türü)`);
