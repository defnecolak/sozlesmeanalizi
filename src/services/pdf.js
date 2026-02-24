const PDFDocument = require("pdfkit");
const path = require("path");

function sevTR(sev) {
  switch (sev) {
    case "CRITICAL": return "KRİTİK";
    case "HIGH": return "YÜKSEK";
    case "MEDIUM": return "ORTA";
    case "LOW": return "DÜŞÜK";
    default: return sev;
  }
}

function buildPdfReport({ analysis, text, appName, extracted, options }) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const opt = options || {};

  const fontRegular = path.join(__dirname, "..", "assets", "fonts", "DejaVuSans.ttf");
  const fontBold = path.join(__dirname, "..", "assets", "fonts", "DejaVuSans-Bold.ttf");
  doc.registerFont("DejaVu", fontRegular);
  doc.registerFont("DejaVuBold", fontBold);

  doc.font("DejaVu");
  doc.info.Title = "Sözleşme Risk Raporu";

  // Header
  doc.font("DejaVuBold").fontSize(18).text(appName || "Avukatım");
  doc.moveDown(0.2);
  doc.font("DejaVu").fontSize(10).fillColor("#444").text("Bu rapor bilgilendirme amaçlıdır; hukuk danışmanlığı değildir.");
  doc.fillColor("#000");
  doc.moveDown();

  const s = analysis?.summary || {};
  const m = analysis?.meta || {};
  const ex = extracted || {};

  // Summary
  doc.font("DejaVuBold").fontSize(14).text("Özet", { underline: true });
  doc.moveDown(0.4);
  doc.font("DejaVu").fontSize(11);

  if (ex.fileName) doc.text(`Dosya: ${ex.fileName}`);
  doc.text(`Rol: ${roleLabel(s.role)}`);
  doc.text(`Risk Skoru: ${s.riskScore}/100 (Seviye: ${s.riskLevel || "-"})`);
  if (s.quality?.label) doc.text(`Metin Kalitesi: ${s.quality.label}`);

  doc.fontSize(10).fillColor("#444").text(`Analiz zamanı: ${m.analyzedAt || "-"}`);
  doc.fillColor("#000").fontSize(11);
  doc.moveDown();

  // Skor açıklaması (explainability)
  const exScore = s?.scoreExplain || null;
  doc.font("DejaVuBold").fontSize(14).text("Skor Açıklaması", { underline: true });
  doc.moveDown(0.35);
  doc.font("DejaVu").fontSize(11);
  if (exScore?.meaning) {
    doc.text(exScore.meaning);
    doc.moveDown(0.25);
  }
  if (Array.isArray(exScore?.factors) && exScore.factors.length) {
    exScore.factors.slice(0, 4).forEach((l) => doc.text(`• ${truncate(String(l), 260)}`));
    doc.moveDown(0.25);
  }

  if (Array.isArray(exScore?.topDrivers) && exScore.topDrivers.length) {
    doc.font("DejaVuBold").fontSize(11).text("Skoru en çok artıran 3 madde:");
    doc.font("DejaVu").fontSize(11);
    exScore.topDrivers.slice(0, 3).forEach((d, idx) => {
      doc.text(`${idx + 1}. ${d.title} (${sevTR(d.severity || "")})`);
    });
    if (Number.isFinite(Number(exScore.withoutTopDriversScore))) {
      doc.moveDown(0.15);
      doc.fontSize(10).fillColor("#444").text(`Bu 3 madde olmasa skor yaklaşık ${exScore.withoutTopDriversScore}/100 olurdu.`);
      doc.fillColor("#000").fontSize(11);
    }
    doc.moveDown(0.3);
  }

  // Top 3
  const top = analysis?.topRisks || [];
  doc.font("DejaVuBold").fontSize(14).text("En Önemli 3 Risk", { underline: true });
  doc.moveDown(0.4);
  doc.font("DejaVu").fontSize(11);
  if (!top.length) {
    doc.text("Belirgin risk sinyali bulunmadı (bu, risk yok demek değildir).");
  } else {
    top.forEach((it, idx) => {
      doc.font("DejaVuBold").fontSize(11).text(`${idx + 1}. ${it.title} [${sevTR(it.severity)}]`);
      doc.font("DejaVu").fontSize(10).fillColor("#444");
      if (it.clause) doc.text(`Madde: ${it.clause}`);
      doc.text(`Kategori: ${it.category || "-"}`);
      if (it.occurrences && Number(it.occurrences) > 1) doc.text(`Geçen yer: ${it.occurrences}`);
      doc.fillColor("#000").fontSize(11);
      doc.text(`Kısaca: ${truncate(it.why, 260)}`);
      if (it.redLine) doc.text(`Dikkat: ${truncate(it.redLine, 260)}`);
      if (it.templates?.length) {
        doc.fontSize(10).fillColor("#444").text("Ne isteyebilirsin?");
        doc.fillColor("#000");
        it.templates.slice(0, 4).forEach(t => doc.text(`• ${truncate(t, 240)}`));
      }
      doc.moveDown(0.5);
    });
  }


  // Pazarlık çıktısı (kopyala-yapıştır)
  const neg = (analysis?.issues || []).slice(0, 8);
  doc.moveDown();
  doc.font("DejaVuBold").fontSize(14).text("Pazarlık Çıktısı (kopyala-yapıştır)", { underline: true });
  doc.moveDown(0.4);
  doc.font("DejaVu").fontSize(11);

  if (!neg.length) {
    doc.text("—");
  } else {
    neg.forEach((it, idx) => {
      doc.font("DejaVuBold").fontSize(11).text(`${idx + 1}. ${it.title}`);
      doc.font("DejaVu").fontSize(10);
      const lines = negotiationLines(it);
      lines.forEach(l => doc.text(l));
      doc.moveDown(0.5);
      if (doc.y > 730) doc.addPage();
    });
    doc.font("DejaVu").fontSize(11);
  }



// Maliyet simülasyonu (Etkinlik/Düğün sözleşmeleri için)
const ev = analysis?.simulation?.event;
if (ev && ev.available && ev.total?.amount) {
  const cur = (ev.total.currency || "EUR").toUpperCase();
  const sym = cur === "TRY" ? "₺" : (cur === "USD" ? "$" : "€");
  const fmt = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return "-";
    return sym + x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const cancelPct = (days) => {
    const d = Number(days);
    const table = ev.cancellationTable || [];
    for (const row of table) {
      const min = Number(row.minDays);
      const max = Number(row.maxDays);
      const p = Number(row.percent);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(p)) continue;
      if (max === 9999 && d >= min) return p;
      if (d >= min && d <= max) return p;
    }
    return null;
  };

  doc.moveDown();
  doc.font("DejaVuBold").fontSize(14).text("Maliyet Simülasyonu (Özet)", { underline: true });
  doc.moveDown(0.4);
  doc.font("DejaVu").fontSize(11);

  if (ev.eventDate) doc.text(`Etkinlik tarihi: ${new Date(ev.eventDate + "T00:00:00Z").toLocaleDateString("tr-TR")}`);
  doc.text(`Toplam tutar: ${fmt(ev.total.amount)}`);
  if (ev.guarantee) doc.text(`Garanti kişi: ${ev.guarantee}`);
  if (ev.perPersonVatIncl) doc.text(`Kişi başı (KDV dahil): ${fmt(ev.perPersonVatIncl)}`);

  const total = Number(ev.total.amount);
  const exDays = [180, 60, 14];
  const lines = [];
  exDays.forEach(d => {
    const p = cancelPct(d);
    if (p == null) return;
    lines.push(`${d} gün kala: %${p} (${fmt(total * (p / 100))})`);
  });
  if (lines.length) {
    doc.moveDown(0.2);
    doc.font("DejaVuBold").fontSize(11).text("İptal bedeli örnekleri (yaklaşık):");
    doc.font("DejaVu").fontSize(11);
    lines.forEach(l => doc.text(`• ${l}`));
  }

  doc.moveDown(0.6);
}


  // Issues
  doc.addPage();
  doc.font("DejaVuBold").fontSize(14).text("Tespit Edilen Riskler", { underline: true });
  doc.moveDown(0.4);
  doc.font("DejaVu").fontSize(11);

  const issues = analysis?.issues || [];
  if (!issues.length) {
    doc.text("Belirgin risk sinyali bulunmadı (bu, risk yok demek değildir).");
  } else {
    issues.slice(0, 80).forEach((it, idx) => {
      doc.font("DejaVuBold").fontSize(11).text(`${idx + 1}. ${it.title}  [${sevTR(it.severity)}]`);
      doc.font("DejaVu").fontSize(10).fillColor("#444");
      if (it.clause) doc.text(`Madde: ${it.clause}`);
      doc.text(`Kategori: ${it.category || "-"}`);
      if (it.occurrences && Number(it.occurrences) > 1) doc.text(`Geçen yer: ${it.occurrences}`);
      doc.text(`Alıntı: ${truncate(it.snippet, 300)}`);
      if (Array.isArray(it.examples) && it.examples.length > 1) {
        doc.text("Diğer örnekler:");
        it.examples.slice(1, 3).forEach(ex => {
          const line = `${ex.clause ? ex.clause + ": " : ""}${truncate(ex.snippet, 200)}`;
          doc.text(`• ${line}`);
        });
      }
      if (it.moneyImpact) doc.text(`Parasal Etki: ${truncate(it.moneyImpact, 220)}`);
      doc.fillColor("#000").fontSize(11);
      doc.text(`Kısaca: ${truncate(it.why, 340)}`);
      if (it.redLine) doc.text(`Dikkat: ${truncate(it.redLine, 340)}`);
      if (it.templates?.length) {
        doc.fontSize(10).fillColor("#444").text("Ne isteyebilirsin?");
        doc.fillColor("#000");
        it.templates.slice(0, 5).forEach(t => doc.text(`• ${truncate(t, 260)}`));
        doc.fontSize(11);
      }
      doc.moveDown(0.7);
      if (doc.y > 730) doc.addPage();
    });
  }

  // Soft warnings
  const soft = analysis?.softWarnings || [];
  if (soft.length) {
    doc.addPage();
    doc.font("DejaVuBold").fontSize(14).text("Belirsizlik / Ek Uyarılar", { underline: true });
    doc.moveDown(0.4);
    soft.slice(0, 50).forEach((it, idx) => {
      doc.font("DejaVuBold").fontSize(11).text(`${idx + 1}. ${it.title} [${sevTR(it.severity)}]`);
      doc.font("DejaVu").fontSize(10).fillColor("#444").text(`Kategori: ${it.category || "-"}`);
      doc.fillColor("#000").fontSize(11).text(`Kısaca: ${truncate(it.why, 360)}`);
      if (it.templates?.length) {
        doc.fontSize(10).fillColor("#444").text("Ne yapabilirsin?");
        doc.fillColor("#000");
        it.templates.slice(0, 4).forEach(t => doc.text(`• ${truncate(t, 260)}`));
        doc.fontSize(11);
      }
      doc.moveDown(0.6);
      if (doc.y > 730) doc.addPage();
    });
  }

  if (opt.includeAppendix) {
    doc.addPage();
    doc.font("DejaVuBold").fontSize(14).text("Ek: Metin (kısaltılmış)", { underline: true });
    doc.moveDown(0.4);
    doc.font("DejaVu").fontSize(9).fillColor("#333").text(truncate(text, 9000));
    doc.fillColor("#000");
  }

  return doc;
}


function cleanTemplate(t) {
  return (t || "").toString()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\.!؟?]+$/g, "");
}

function isMoneyUnknown(moneyImpact) {
  const s = String(moneyImpact || "").toLowerCase().trim();
  if (!s) return true;
  return s.includes("değişken") || s.includes("hesaplanamad") || s.includes("net hesap");
}

function negotiationLines(it) {
  const clause = it?.clause ? ` (${it.clause})` : "";
  const title = (it?.title || "—").toString().trim();
  const why = truncate(it?.why || "Bu madde benim için gereksiz risk oluşturuyor.", 240);

  const rawMoney = String(it?.moneyImpact || "").trim();
  const money = (!rawMoney || isMoneyUnknown(rawMoney)) ? "" : truncate(rawMoney, 180);

  const templates = Array.isArray(it?.templates)
    ? it.templates.map(cleanTemplate).filter(Boolean).slice(0, 3)
    : [];

  const asks = templates.length
    ? templates
    : ["Bu maddeyi daha net ve dengeli olacak şekilde revize edelim"];

  const lines = [];
  lines.push(`Sözleşmedeki “${title}”${clause} maddesi için küçük bir revize rica edeceğim.`);
  lines.push(`Kısaca: ${why}`);
  if (money) lines.push(`Parasal etki (tahmini): ${money}`);
  lines.push("Rica ettiğim güncelleme:");
  asks.forEach((t) => lines.push(`• ${truncate(t, 240)}.`));
  lines.push("Uygunsa buna göre güncelleyebilir miyiz?");
  lines.push("Teşekkürler.");
  return lines;
}


function truncate(s, n) {
  const str = (s || "").toString().replace(/\s+/g, " ").trim();
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + "…";
}

function roleLabel(role) {
  switch (role) {
    case "hizmet_alan": return "Hizmet Alan";
    case "hizmet_veren": return "Hizmet Veren";
    case "kiraci": return "Kiracı";
    case "ev_sahibi": return "Ev Sahibi";
    case "alici": return "Alıcı";
    case "satici": return "Satıcı";
    default: return "Genel";
  }
}

module.exports = { buildPdfReport };
