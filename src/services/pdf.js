const PDFDocument = require("pdfkit");
const NegotiationCopy = require("../public/negotiation-copy");
const path = require("path");


function packLabel(pack) {
  switch (String(pack || "genel")) {
    case "genel": return "Genel";
    case "hizmet": return "Hizmet / Serbest Çalışma";
    case "influencer": return "Influencer Anlaşması";
    case "etkinlik": return "Düğün / Etkinlik";
    case "kira": return "Kira";
    case "satis": return "Satış / Alım";
    case "saas": return "SaaS / Yazılım Aboneliği";
    case "is": return "İş Sözleşmesi";
    case "kredi": return "Kredi / Borç";
    case "egitim": return "Eğitim / Kurs";
    case "gizlilik": return "Gizlilik / NDA";
    case "abonelik": return "Abonelik / Taahhüt";
    case "arac": return "Araç Kiralama";
    case "seyahat": return "Seyahat / Tur / Otel";
    case "sigorta": return "Sigorta / Poliçe";
    default: return String(pack || "Genel");
  }
}

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
  if (s.pack) doc.text(`Tür: ${packLabel(s.pack)}`);
  if (s.sensitivity) doc.text(`Hassasiyet: ${s.sensitivity}`);
  doc.text(`Risk Skoru: ${s.riskScore}/100 (Seviye: ${s.riskLevel || "-"})`);
  if (s.quality?.label) doc.text(`Metin Kalitesi: ${s.quality.label}`);

  const correctness = s?.correctness || null;
  if (correctness?.status) {
    doc.text(`Doğruluk Kontrolü: ${correctness.status}`);
  }

  doc.fontSize(10).fillColor("#444").text(`Analiz zamanı: ${m.analyzedAt || "-"}`);
  doc.fillColor("#000").fontSize(11);
  doc.moveDown();

  if (s?.counterpartyContext?.summary) {
    doc.moveDown(0.35);
    doc.font("DejaVuBold").fontSize(14).text("Karşı Taraf / İlişki Bağlamı", { underline: true });
    doc.moveDown(0.35);
    doc.font("DejaVu").fontSize(11).text(s.counterpartyContext.summary);
    doc.moveDown(0.25);
  }

  if (correctness) {
    doc.moveDown(0.4);
    doc.font("DejaVuBold").fontSize(14).text("Sözleşme Doğru mu?", { underline: true });
    doc.moveDown(0.35);
    doc.font("DejaVu").fontSize(11).text(correctness.message || "");
    if (Array.isArray(correctness.items) && correctness.items.length) {
      doc.moveDown(0.15);
      correctness.items.slice(0, 5).forEach((it) => doc.text(`• ${truncate(String(it.title || ""), 220)}`));
    }
    doc.moveDown(0.35);
  }

  const actionPlan = s?.actionPlan || null;
  if (actionPlan) {
    doc.moveDown(0.35);
    doc.font("DejaVuBold").fontSize(14).text("İmza Öncesi Plan", { underline: true });
    doc.moveDown(0.35);
    doc.font("DejaVu").fontSize(11).text(actionPlan.summary || "");
    const sections = [
      ["Önce düzelt", actionPlan.mustFix],
      ["Netleştir", actionPlan.shouldClarify],
      ["Dengeleyici sinyaller", actionPlan.goodSignals]
    ];
    sections.forEach(([title, items]) => {
      if (Array.isArray(items) && items.length) {
        doc.moveDown(0.15);
        doc.font("DejaVuBold").fontSize(11).text(title);
        doc.font("DejaVu").fontSize(11);
        items.slice(0, 4).forEach((it) => doc.text(`• ${truncate(String(it || ""), 240)}`));
      }
    });
    doc.moveDown(0.35);
  }

  const decision = s?.decision || analysis?.decision || null;
  if (decision) {
    doc.moveDown(0.35);
    doc.font("DejaVuBold").fontSize(14).text("Karar Önerisi", { underline: true });
    doc.moveDown(0.35);
    doc.font("DejaVuBold").fontSize(11).text(decision.status || "KONTROL ET");
    doc.font("DejaVu").fontSize(11).text(decision.summary || "");
    if (Array.isArray(decision.reasons) && decision.reasons.length) {
      doc.moveDown(0.15);
      decision.reasons.slice(0, 4).forEach((it) => doc.text(`• ${truncate(String(it || ""), 240)}`));
    }
    if (Array.isArray(decision.nextSteps) && decision.nextSteps.length) {
      doc.moveDown(0.15);
      doc.font("DejaVuBold").fontSize(11).text("Sonraki adım");
      doc.font("DejaVu").fontSize(11);
      decision.nextSteps.slice(0, 3).forEach((it) => doc.text(`• ${truncate(String(it || ""), 240)}`));
    }
    doc.moveDown(0.35);
  }

  const subScores = Array.isArray(s?.subScores || analysis?.subScores) ? (s.subScores || analysis.subScores) : [];
  if (subScores.length) {
    doc.moveDown(0.35);
    doc.font("DejaVuBold").fontSize(14).text("Alt Skorlar", { underline: true });
    doc.moveDown(0.35);
    doc.font("DejaVu").fontSize(11);
    subScores.slice(0, 5).forEach((it) => {
      doc.text(`${String(it.label || "")} : ${Number(it.score || 0)}/100`);
      if (it.summary) doc.fontSize(10).fillColor("#444").text(truncate(String(it.summary || ""), 240)).fillColor("#000").fontSize(11);
      doc.moveDown(0.15);
    });
    doc.moveDown(0.25);
  }

  const mitigationSummary = s?.mitigationSummary || null;
  if (mitigationSummary) {
    doc.moveDown(0.35);
    doc.font("DejaVuBold").fontSize(14).text("Dengeleyici Maddeler", { underline: true });
    doc.moveDown(0.35);
    doc.font("DejaVu").fontSize(11).text(mitigationSummary.message || "");
    const mitItems = Array.isArray(mitigationSummary.items) ? mitigationSummary.items : [];
    mitItems.slice(0, 5).forEach((it) => doc.text(`• ${truncate(String(it.title || ""), 240)}`));
    doc.moveDown(0.25);
  }

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
    if (Array.isArray(exScore.combos) && exScore.combos.length) {
      doc.moveDown(0.15);
      doc.font("DejaVuBold").fontSize(11).text("Birlikte çalışan madde kombinasyonları:");
      doc.font("DejaVu").fontSize(11);
      exScore.combos.slice(0, 3).forEach((c) => doc.text(`• ${truncate(String(c.title || ""), 220)}`));
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


  const redlines = Array.isArray(analysis?.redlinePlaybook) ? analysis.redlinePlaybook : [];
  if (redlines.length) {
    doc.moveDown(0.25);
    doc.font("DejaVuBold").fontSize(14).text("Redline / Revize Önerileri", { underline: true });
    doc.moveDown(0.35);
    redlines.slice(0, 4).forEach((it, idx) => {
      doc.font("DejaVuBold").fontSize(11).text(`${idx + 1}. ${truncate(String(it.clause || "İlgili madde"), 120)}`);
      doc.font("DejaVu").fontSize(11).text(truncate(String(it.title || ""), 220));
      if (it.reason) doc.fontSize(10).fillColor("#444").text(truncate(String(it.reason || ""), 220)).fillColor("#000").fontSize(11);
      doc.text(`İstek: ${truncate(String(it.ask || ""), 240)}`);
      doc.text(`İdeal madde mantığı: ${truncate(String(it.idealClause || ""), 240)}`);
      doc.moveDown(0.25);
    });
  }

  const whatIf = Array.isArray(analysis?.whatIf?.items) ? analysis.whatIf.items : [];
  if (whatIf.length) {
    doc.moveDown(0.25);
    doc.font("DejaVuBold").fontSize(14).text("What-if / Olası Sonuçlar", { underline: true });
    doc.moveDown(0.35);
    whatIf.slice(0, 4).forEach((it, idx) => {
      doc.font("DejaVuBold").fontSize(11).text(`${idx + 1}. ${truncate(String(it.title || ""), 180)}`);
      doc.font("DejaVu").fontSize(11).text(truncate(String(it.outcome || ""), 240));
      if (it.impact) doc.fontSize(10).fillColor("#444").text(`Etkisi: ${truncate(String(it.impact || ""), 120)}`).fillColor("#000").fontSize(11);
      if (it.why) doc.fontSize(10).fillColor("#444").text(truncate(String(it.why || ""), 220)).fillColor("#000").fontSize(11);
      doc.moveDown(0.25);
    });
  }

  // Revize metni (karşı tarafa gönderilebilir özet)
  const neg = (analysis?.issues || []).slice(0, 8);
  doc.moveDown();
  doc.font("DejaVuBold").fontSize(14).text("Karşı Tarafa Gönderilebilir Revize Metni", { underline: true });
  doc.moveDown(0.4);
  doc.font("DejaVu").fontSize(11);

  if (!neg.length) {
    doc.text("—");
  } else {
    const fullDoc = String(
      NegotiationCopy.buildDoc(neg, {
        role: s.role || "genel",
        pack: s.pack || "genel",
      }) || ""
    ).trim();

    const paragraphs = fullDoc.split(/\n\n+/).map((x) => x.trim()).filter(Boolean);
    paragraphs.forEach((p) => {
      if (p.length && /^[A-ZÇĞİÖŞÜ][^.!?\n]{0,50}$/.test(p) && !/\.$/.test(p)) {
        doc.font("DejaVuBold").fontSize(11).text(p);
        doc.font("DejaVu").fontSize(11);
      } else {
        doc.text(p);
      }
      doc.moveDown(0.35);
      if (doc.y > 730) doc.addPage();
    });
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

function negotiationLines(it, opts = {}) {
  const txt = NegotiationCopy.buildIssueText(it, {
    role: opts.role || 'genel',
    pack: opts.pack || 'genel',
    includeGreeting: false,
    includeClosing: false,
  });
  return String(txt || '').split(/\n\n+/).map((x) => x.trim()).filter(Boolean);
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
