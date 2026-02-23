'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');

let helmet;
try {
  helmet = require('helmet');
} catch (e) {
  // helmet yoksa app yine de çalışsın
  helmet = null;
}

// .env sadece local için (Render’da zaten ENV’leri panelden veriyorsun)
try {
  require('dotenv').config();
} catch (_) {}

// --------------------
// ENV / Sabitler
// --------------------
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// Render: PORT zorunlu (10000 gibi). Host: 0.0.0.0 olmalı.
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const APP_NAME = process.env.APP_NAME || 'Sözleşmem';

// Render deploy commit hash varsa versiyon gibi göster
const APP_VERSION =
  process.env.APP_VERSION ||
  (process.env.RENDER_GIT_COMMIT ? String(process.env.RENDER_GIT_COMMIT).slice(0, 7) : '');

// --------------------
// App
// --------------------
const app = express();

// Render/Proxy arkasındasın → req.ip doğru gelsin + secure cookies doğru çalışsın
app.set('trust proxy', 1);

// Express header sızdırma
app.disable('x-powered-by');

// Request ID (log/trace için)
app.use((req, res, next) => {
  const rid = req.get('x-request-id') || crypto.randomUUID();
  res.locals.requestId = rid;
  res.setHeader('x-request-id', rid);
  next();
});

// Health endpoint’ler (Render Health Check Path = /healthz)
app.get('/healthz', (req, res) => res.status(200).send('ok'));
app.get('/health', (req, res) => res.status(200).send('ok'));

// Güvenlik header’ları (helmet varsa)
if (helmet) {
  app.use(
    helmet({
      // CSP’yi yanlış ayarlamak ödeme sayfasını bozabiliyor.
      // Şimdilik kapalı tutuyoruz; istersen sonra route bazlı CSP ekleriz.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
}

// Body limitleri (DoS / dev payload engeli)
app.use(express.json({ limit: process.env.JSON_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: false, limit: process.env.FORM_LIMIT || '1mb' }));

// Basit IP rate limit (dependency yok, memory-based)
// İstersen sonra Redis’e taşıyıp daha “production-grade” yaparız.
function ipRateLimit({ windowMs, max, key = 'global' }) {
  const hits = new Map();

  function cleanup(now) {
    // basit temizlik: map çok büyümesin
    if (hits.size < 5000) return;
    for (const [k, v] of hits.entries()) {
      if (v.resetAt <= now) hits.delete(k);
    }
  }

  return function (req, res, next) {
    const now = Date.now();
    cleanup(now);

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const bucketKey = `${key}:${ip}`;

    const cur = hits.get(bucketKey);
    if (!cur || cur.resetAt <= now) {
      hits.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return next();
    }

    cur.count += 1;
    if (cur.count > max) {
      const retryAfterSec = Math.ceil((cur.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ ok: false, error: 'Çok fazla istek. Lütfen biraz bekle.' });
    }

    return next();
  };
}

// Genel limit
app.use(ipRateLimit({ windowMs: 60_000, max: 300, key: 'site' }));
// API limit (biraz daha sıkı)
app.use('/api', ipRateLimit({ windowMs: 60_000, max: 120, key: 'api' }));
// Dosya analiz endpoint’i (en agresif)
app.use('/api/analyze-file', ipRateLimit({ windowMs: 60_000, max: 20, key: 'analyze-file' }));

// Views (EJS)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Tüm sayfalara otomatik locals
app.use((req, res, next) => {
  res.locals.appName = APP_NAME;
  res.locals.appVersion = APP_VERSION;
  next();
});

// Static (src/public varsa)
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PROD ? '7d' : 0,
  etag: true,
}));

// --------------------
// Routes
// --------------------
let routes;
try {
  routes = require('./routes');
} catch (err) {
  // Routes import patlarsa bile health endpointler zaten yukarıda çalışıyor.
  // Render en azından "up" görür, sen loglardan hatayı yakalarsın.
  console.error('[BOOT] routes load failed:', {
    name: err?.name,
    message: err?.message,
    stack: IS_PROD ? undefined : err?.stack,
  });
  routes = null;
}

if (routes) {
  app.use('/', routes);
} else {
  app.get('*', (req, res) => {
    res.status(500).send('Uygulama başlatılamadı (routes yüklenemedi). Logları kontrol et.');
  });
}

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  // 404.ejs varsa kullan
  try {
    return res.status(404).render('404');
  } catch {
    return res.status(404).send('Sayfa bulunamadı');
  }
});

// Global error handler (metin sızıntısı yapmayacak şekilde)
app.use((err, req, res, next) => {
  const rid = res.locals.requestId;

  console.error('[unhandled_error]', {
    rid,
    path: req.originalUrl,
    method: req.method,
    name: err?.name,
    code: err?.code,
    message: err?.message,
    stack: IS_PROD ? undefined : err?.stack,
  });

  if (res.headersSent) return next(err);

  if (req.path.startsWith('/api')) {
    return res.status(500).json({ ok: false, error: 'Sunucu hatası', requestId: rid });
  }
  return res.status(500).send(`Sunucu hatası (requestId: ${rid})`);
});

// --------------------
// LISTEN (SADECE 1 KEZ!)
// --------------------
const server = app.listen(PORT, HOST, () => {
  // içeride 0.0.0.0 bağlanınca dışarıdan erişilebilir; log için localhost gösterelim
  const shownHost = (HOST === '0.0.0.0' || HOST === '::') ? 'localhost' : HOST;
  console.log(`✅ ${APP_NAME} çalışıyor: http://${shownHost}:${PORT}`);
});

// Basit timeout’lar (DoS dayanımı)
try {
  server.requestTimeout = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 60_000);
  server.headersTimeout = Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 65_000);
  server.keepAliveTimeout = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 5_000);
} catch {}

// Graceful shutdown (Render SIGTERM yollar)
function shutdown(signal) {
  console.log(`[SHUTDOWN] ${signal} alındı, kapatılıyor...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));