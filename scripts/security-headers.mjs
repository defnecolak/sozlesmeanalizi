// Basit güvenlik header smoke testi (cross-platform)
// Kullanım:
//   BASE_URL=http://localhost:3000 node scripts/security-headers.mjs

const BASE_URL = (process.env.BASE_URL || process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

function ok(msg) { console.log(`\x1b[32m✔\x1b[0m ${msg}`); }
function warn(msg) { console.log(`\x1b[33m⚠\x1b[0m ${msg}`); }
function bad(msg) { console.log(`\x1b[31m✘\x1b[0m ${msg}`); process.exitCode = 1; }

async function fetchHead(path) {
  const url = `${BASE_URL}${path}`;
  const resp = await fetch(url, { method: "GET", redirect: "manual" });
  return { url, resp };
}

function hasHeader(resp, name) {
  return resp.headers.get(name) != null;
}

function header(resp, name) {
  return resp.headers.get(name);
}

(async () => {
  console.log(`BASE_URL=${BASE_URL}`);

  // 1) Ana sayfa
  {
    const { url, resp } = await fetchHead("/");
    if (!resp.ok && resp.status !== 302) bad(`GET ${url} -> ${resp.status}`);
    else ok(`GET ${url} -> ${resp.status}`);
  }

  // 2) Uygulama sayfası (cookie + CSP)
  {
    const { url, resp } = await fetchHead("/uygulama");
    if (!resp.ok) bad(`GET ${url} -> ${resp.status}`);
    else ok(`GET ${url} -> ${resp.status}`);

    // Core headers
    const must = [
      "content-security-policy",
      "x-content-type-options",
      "x-frame-options",
      "referrer-policy"
    ];

    for (const h of must) {
      if (hasHeader(resp, h)) ok(`${h} var`);
      else bad(`${h} eksik`);
    }

    // CSP should include nonce-based script-src
    const csp = header(resp, "content-security-policy") || "";
    if (/script-src[^;]*nonce-/.test(csp)) ok("CSP nonce aktif");
    else warn("CSP nonce tespit edilemedi (CSP zayıf olabilir)");

    // Cookie flags
    const sc = header(resp, "set-cookie") || "";
    if (sc.includes("device_id=")) ok("device_id cookie set ediliyor");
    else warn("device_id cookie görünmedi (ilk istek olabilir)");

    if (sc.includes("HttpOnly")) ok("cookie HttpOnly");
    else warn("cookie HttpOnly değil (XSS riskini artırır)");

    if (/SameSite=Lax/i.test(sc)) ok("cookie SameSite=Lax");
    else warn("cookie SameSite yok/Lax değil");
  }

  // 3) API health
  {
    const { url, resp } = await fetchHead("/health");
    if (!resp.ok) bad(`GET ${url} -> ${resp.status}`);
    else ok(`GET ${url} -> ${resp.status}`);
  }

  console.log("\nBitti. Eğer kırmızı (✘) yoksa temel header kontrolü OK.");
})();
