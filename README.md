# Sözleşmem (PRO / Launch-ready)
PDF/DOCX/TXT yükle → metni çıkar → (gerekirse OCR) → risk analizi → PDF rapor.

> Hukuk danışmanlığı değildir. Bilgilendirme amaçlı “risk sinyali” üretir.

## Öne çıkanlar
- ✅ Madde bazlı analiz (MADDE 5, 5.1, 18.2 gibi bölümler)
- ✅ Role göre skor: Genel / Hizmet Alan / Hizmet Veren / Kiracı / Ev Sahibi / Alıcı / Satıcı
- ✅ Top 3 risk özeti + filtre (Kategori / Seviye)
- ✅ Metin içinde highlight (alıntıda eşleşen kelime vurgulu)
- ✅ “Kırmızı Çizgi” + “Revize Şablonları”
- ✅ PDF rapor (Unicode/TR font gömülü)
- ✅ OCR fallback (opsiyonel): `pdftoppm` + `tesseract`
- ✅ Launch dokunuşları: rate limit, health endpoint, gizlilik/sorumluluk/şartlar/iade sayfaları, Dockerfile
- ✅ Paywall hazır (opsiyonel): PDF rapor için anahtar

## Kurulum
Node.js 18+ gerekli.

```bash
cd avukatim
npm install
cp .env.example .env

# (Opsiyonel) KVKK/Politika sayfaları için
# LEGAL_ENTITY_NAME=Şirket/Ad Soyad
# LEGAL_ENTITY_ADDRESS=Adres
# POLICY_LAST_UPDATED=2026-02-16
npm run dev
```

- Landing: http://localhost:3000
- Uygulama: http://localhost:3000/uygulama

### Sık hata: "Cannot find module 'iyzipay'"
Bu hata genelde yeni zip'i açtıktan sonra **npm install** çalıştırılmadığında veya klasörde eski `node_modules` kaldığında çıkar.

Çözüm (Windows PowerShell):
```bash
# klasörde
rmdir /s /q node_modules 2>nul
del package-lock.json 2>nul
npm install
```

Sonra tekrar:
```bash
npm run dev
```

## OCR Kurulumu
OCR sadece `ENABLE_OCR=true` iken ve PDF’ten çıkan metin kısa ise devreye girer.

### macOS
```bash
brew install tesseract poppler
```

### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr tesseract-ocr-tur tesseract-ocr-eng poppler-utils
```

### Windows
- Tesseract + Türkçe dil dosyası
- Poppler (pdftoppm)

`.env` ile tam yolu verebilirsin:
- `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe`
- `PDFTOPPM_CMD=C:\poppler\Library\bin\pdftoppm.exe`

## Paywall (opsiyonel)
`.env`:
- `PAYWALL_MODE=off` (default)
- `PREMIUM_KEY=demo123`

`PAYWALL_MODE=on` yaparsan PDF rapor indirmek için anahtar gerekir.

## Test
```bash
npm test
```

## Lisans
MIT

## Sözleşme Türleri
Uygulamada sözleşme türü seçerek (örn. Genel / Hizmet / Düğün- Etkinlik / Kira / Satış / SaaS / İş / Kredi / Eğitim / Gizlilik / Abonelik / Araç Kiralama / Seyahat / Sigorta)
o türe özel risk kurallarını da devreye alırsın.

## 1 ücretsiz + kredi modeli
`BILLING_MODE=credits` yaparsan her cihaz için ilk `FREE_TRIAL_ANALYSES` analiz ücretsiz olur. Sonrasında kredi gerekir. Krediler `CREDIT_CODES` ile kod girilerek eklenir.

## Ödeme — hesap yok, cihaz bazlı kredi

Bu proje hesap istemeden (device_id cookie) çalışır.

### Ödeme (iyzico Checkout Form)
Launch için pratik senaryo: iyzico Checkout Form **ayrı bir ödeme sayfasında** (`/odeme`) çalışır.
Bu sayede iyzico scriptleri uygulama ekranından ayrılır (izolasyon / daha küçük saldırı yüzeyi).
Ödeme bitince iyzico sunucuna callback atar ve kredi otomatik yüklenir.

1) `.env`
- `PAYMENTS_PROVIDER=iyzico`
- `IYZICO_ENV=sandbox` (prod için `live`)
- `IYZICO_API_KEY=...`
- `IYZICO_SECRET_KEY=...`
- `APP_BASE_URL=https://senin-domainin.com`  _(callback için şart)_
- `IYZICO_PACKS=[{"label":"1 Kredi • 49₺","credits":1,"price":49,"currency":"TRY"}, ...]`

2) Uygulamada “Satın Al” seçince ödeme sayfası (`/odeme`) açılır. Paket seçip e-posta/ad-soyad girerek `/api/iyzico/initiate` çağrısı yapılır ve checkout formu orada gösterilir.
3) Ödeme tamamlanınca iyzico, `APP_BASE_URL/api/iyzico/callback?cid=...` adresine `token` gönderir. Sunucu ödeme sonucunu doğrular ve krediyi yazar.

> Not: Localhost'ta callback çalışmaz (iyzico dışarıdan erişemez). Local test için ngrok gibi bir tünel açıp `APP_BASE_URL` olarak onu ver.

### Upload antivirüs taraması (opsiyonel)
Varsayılan kapalıdır (maliyet/altyapı gerektirebilir).

`.env`:
- `ANTIVIRUS_MODE=off` (default)
- `ANTIVIRUS_MODE=clamav` (clamav kuruluysa)

Docker kullananlar için: `Dockerfile` içinde `INSTALL_CLAMAV=1` build arg ile kurulum açılabilir.

### Ödeme (Lemon Squeezy)
Bu proje hesap istemeden (device_id cookie) çalışır. Lemon Squeezy ile kredi satmak için:
1. Lemon Squeezy'de 10/25 gibi kredi paketleri için ürün/variant oluştur.
2. Her paket için checkout linkini al.
3. `.env` içinde `PAYMENTS_PROVIDER=lemonsqueezy` ve `LS_CHECKOUT_PACKS=[...]` ayarla.
4. Lemon Squeezy panelinde webhook oluştur:
   - URL: `https://SENIN_DOMAIN/api/webhook/lemonsqueezy`
   - Events (minimum): `order_created`, `order_refunded`
   - Signing secret: `.env` → `LEMONSQUEEZY_WEBHOOK_SECRET`

Uygulama checkout linkine otomatik olarak `checkout[custom][device_id]` ve `checkout[custom][credits]` ekler.
Lemon Squeezy bu custom datayı webhook payload'unda `meta.custom_data` altında gönderir.

### Kredi kurtarma (hesap yok)
Satın alma butonuna bastığınızda uygulama size bir **kurtarma kodu** gösterir (örn. `A8F3-6K2M-P9QD`).
Bu kodu not edin. Çerezler silinir veya cihaz değişirse, bu kodu “Krediyi Kurtar” bölümüne girerek aynı cüzdandaki kredilere yeniden bağlanabilirsiniz.

## Public Launch için "son adımlar"

### 0) En kritik konu: kredi verisi kalıcı olmalı
Bu proje kredi/restore bilgisini **dosyada** tutar: `data/store.json`.

Local'de sorun yok. Ama Render gibi ortamlarda dosya sistemi **deploy'da sıfırlanabilir**.
Public launch'ta kullanıcı kredilerinin kaybolmaması için:

- Render'da bir **Persistent Disk** ekle (örn. 1GB)
- Disk'i `/var/data` gibi bir yola mount et
- Environment'a şunu koy: `DATA_DIR=/var/data`

> Alternatif (daha ileri seviye): Store'u Postgres/Redis'e taşımak.

### 1) GitHub'a push
```bash
git init
git add .
git commit -m "initial"

# GitHub'da boş repo açtıktan sonra:
git remote add origin https://github.com/<kullanici>/<repo>.git
git branch -M main
git push -u origin main
```

### 2) Render'a deploy
Render panel:
- **New > Web Service**
- Repo'yu seç
- Runtime: **Node**
- Build Command: `npm install`
- Start Command: `npm start`

Gerekli env örneği:
- `APP_NAME=Sözleşmem`
- `APP_BASE_URL=https://<render-url-ya-da-domain>`
- `SUPPORT_EMAIL=destek@...`
- `BILLING_MODE=credits`
- `FREE_TRIAL_ANALYSES=1`
- `PAYMENTS_PROVIDER=iyzico`
- `IYZICO_ENV=sandbox` (canlı için `live`)
- `IYZICO_API_KEY=...`
- `IYZICO_SECRET_KEY=...`
- `IYZICO_PACKS=[{"label":"1 Kredi • 49₺","credits":1,"price":49,"currency":"TRY"},{"label":"5 Kredi • 169₺","credits":5,"price":169,"currency":"TRY"},{"label":"10 Kredi • 299₺","credits":10,"price":299,"currency":"TRY"},{"label":"20 Kredi • 499₺","credits":20,"price":499,"currency":"TRY"}]`
- `DATA_DIR=/var/data` (persistent disk mount ettiysen)

> Render sana bir URL verir.
Notlar:
- Render'da **Health Check Path** istersen `/healthz` yapabilirsin (bu projede `/health` ve `/healthz` ikisi de var).
- Deploy sırasında `FORCE_HTTPS=true` açtıysan, health endpointleri yine 200 döner (redirect yok).
 iyzico merchant başvurusunda "site adresi" olarak bunu kullanabilirsin.

### 3) Smoke test (canlıya çıkmadan önce)
Sunucu çalışırken:

```bash
npm run smoke
```

Alternatif (Windows):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke.ps1
```

### 4) Canlıya geçiş kontrol listesi
- ✅ `/health` 200 dönüyor mu?
- ✅ `/uygulama` açılıyor mu?
- ✅ PDF rapor indiriliyor mu? (Türkçe karakterler düzgün mü?)
- ✅ iyzico sandbox ödeme akışı (paket seç → ödeme → kredi artıyor)
- ✅ Çerezleri sil → "Krediyi Kurtar" ile restore token çalışıyor
- ✅ `DATA_DIR` ile kredi kaydı deploy sonrası kaybolmuyor
- ✅ Sorumluluk/Gizlilik/KVKK/Kullanım Şartları/İade sayfaları erişilebilir
