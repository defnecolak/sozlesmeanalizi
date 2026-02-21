// Smoke test (public launch)
// Usage:
//   node scripts/smoke.mjs
//   BASE_URL=https://your-domain.com node scripts/smoke.mjs
// Notes:
//   - Server must be running.
//   - Works on Node 18+.

import PDFDocument from "pdfkit";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SMOKE_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000);

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? SMOKE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function fail(msg, extra) {
  console.error("\n[FAIL]", msg);
  if (extra) console.error(extra);
  process.exit(1);
}

function ok(msg) {
  console.log("[OK] ", msg);
}

async function fetchText(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  const text = await res.text();
  return { res, text };
}

async function fetchJson(url, opts) {
  const { res, text } = await fetchText(url, opts);
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { res, text, json };
}

async function makeTextPdfBuffer(text) {
  // PDFKit ile RAM'de basit bir "text PDF" üret.
  // Not: Bu taranmış PDF değildir; extraction hattını gerçekçi test eder.
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];

    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Metadata (opsiyonel)
    doc.info.Title = "Avukatım Smoke Test";
    doc.info.Author = "Avukatım";

    doc.fontSize(14).text("AVUKATIM • SMOKE TEST PDF", { align: "center" });
    doc.moveDown(0.75);
    doc.fontSize(11).text(text, { width: 520, lineGap: 2 });
    doc.end();
  });
}

async function main() {
  console.log("\nAvukatım smoke test");
  console.log("BASE_URL:", BASE_URL);

  // 1) Health
  {
    const { res, json, text } = await fetchJson(`${BASE_URL}/health`);
    if (!res.ok) fail("/health HTTP " + res.status, text);
    if (!json || json.ok !== true) fail("/health JSON bekleniyordu", text);
    ok("/health OK");
  }

  // 2) App page renders
  {
    const { res, text } = await fetchText(`${BASE_URL}/uygulama`);
    if (!res.ok) fail("/uygulama HTTP " + res.status, text.slice(0, 300));
    if (!text.includes("Sözleşme Analizi")) {
      fail("/uygulama beklenen HTML içeriği yok", text.slice(0, 500));
    }
    ok("/uygulama OK (HTML render)");
  }

  // 3) Status (cookie-based wallet)
  let status = null;
  {
    const { res, json, text } = await fetchJson(`${BASE_URL}/api/status`);
    if (!res.ok) fail("/api/status HTTP " + res.status, text);
    if (!json || json.ok !== true || !json.status) fail("/api/status JSON hatalı", text);
    status = json.status;
    ok(`/api/status OK (billingMode=${status.billingMode}, freeLeft=${status.freeLeft}, credits=${status.credits})`);
  }

  // 4) Analyze demo (should always work unless server misconfigured)
  let demoAnalysis = null;
  let demoText = null;
  {
    const body = JSON.stringify({ role: "genel", pack: "genel" });
    const { res, json, text } = await fetchJson(`${BASE_URL}/api/analyze-demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });
    if (!res.ok) fail("/api/analyze-demo HTTP " + res.status, text);
    if (!json || json.ok !== true || !json.analysis || !json.text) fail("/api/analyze-demo JSON hatalı", text);
    demoAnalysis = json.analysis;
    demoText = json.text;
    ok(`/api/analyze-demo OK (riskScore=${demoAnalysis?.summary?.riskScore ?? "?"})`);
  }

  // 5) Analyze file upload (may be gated by credits; in that case we only warn)
  let fileAnalysis = null;
  let fileText = null;
  let fileExtracted = null;
  {
    // Not: Sunucu en az 220 karakter bekliyor (çok kısa metinlerde kalite/yanlış pozitif artıyor).
    // Bu nedenle smoke test için biraz daha uzun bir örnek kullanıyoruz.
    const sample = `MADDE 1 - KAPSAM\n1.1 Hizmet veren gerekli gördüğünde şartları tek taraflı değiştirebilir.\n1.2 Hizmet alan bu değişiklikleri kabul etmiş sayılır.\n\nMADDE 2 - ÜCRET VE ÖDEME\n2.1 Ücret iadesi yapılmaz.\n2.2 Ödeme gecikirse aylık %2,5 temerrüt faizi uygulanır.\n\nMADDE 3 - FESİH\n3.1 Karşı taraf herhangi bir gerekçe göstermeden derhal feshedebilir.\n3.2 Fesih halinde yapılan iş/masrafın ödeneceği ayrıca düzenlenmelidir.\n`;

    // TXT yerine runtime'da küçük bir "text PDF" üretip upload ediyoruz.
    // Böylece PDF extraction hattı da smoke test ile kapsanmış olur.
    const pdfBuf = await makeTextPdfBuffer(sample);
    if (pdfBuf.byteLength < 1500) {
      fail("Smoke PDF beklenenden küçük (" + pdfBuf.byteLength + " bytes). PDF üretimi bozulmuş olabilir.");
    }
    if (pdfBuf.byteLength > 400000) {
      fail("Smoke PDF beklenenden büyük (" + pdfBuf.byteLength + " bytes). Güvenlik için iptal edildi.");
    }

    const fd = new FormData();
    fd.append("role", "hizmet_veren");
    fd.append("pack", "hizmet");
    fd.append("file", new Blob([pdfBuf], { type: "application/pdf" }), "smoke-text.pdf");

    const { res, json, text } = await fetchJson(`${BASE_URL}/api/analyze-file`, {
      method: "POST",
      body: fd
    });

    if (res.status === 402) {
      // Paywall/credits gate expected in some scenarios
      console.warn("⚠️ /api/analyze-file gated (402). Bu normal olabilir: kredin yoksa analiz engellenir.");
      if (json && json.status) {
        console.warn("   status:", json.status);
      }
    } else {
      if (!res.ok) fail("/api/analyze-file HTTP " + res.status, text);
      if (!json || json.ok !== true || !json.analysis || !json.text) fail("/api/analyze-file JSON hatalı", text);
      fileAnalysis = json.analysis;
      fileText = json.text;
      fileExtracted = json.extracted || null;
      ok(`/api/analyze-file OK (riskScore=${fileAnalysis?.summary?.riskScore ?? "?"})`);
    }
  }

  // 6) PDF report (uses demo analysis; should produce a PDF)
  {
    const payload = {
      analysis: demoAnalysis,
      text: demoText,
      extracted: { fileName: "demo.pdf" }
    };

    const res = await fetchWithTimeout(`${BASE_URL}/api/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const t = await res.text();
      fail("/api/report HTTP " + res.status, t);
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("pdf")) {
      const t = await res.text();
      fail("/api/report PDF dönmedi (content-type=" + ct + ")", t.slice(0, 300));
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < 1500) {
      fail("/api/report PDF çok küçük (" + buf.byteLength + " bytes)");
    }

    ok(`/api/report OK (PDF ${buf.byteLength} bytes)`);
  }

  // 7) Optional: verify pricing page
  {
    const { res, text } = await fetchText(`${BASE_URL}/fiyatlandirma`);
    if (!res.ok) fail("/fiyatlandirma HTTP " + res.status, text.slice(0, 300));
    ok("/fiyatlandirma OK");
  }

  console.log("\nSMOKE TESTLERİ BAŞARILI");
}

main().catch((e) => fail("beklenmeyen hata", e));
