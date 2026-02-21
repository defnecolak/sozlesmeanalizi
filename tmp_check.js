
const path = require("path");
const { extractTextFromFile } = require("./src/services/extract");
const { analyzeContract } = require("./src/services/analyzer");
(async () => {
  const file = "/mnt/data/\u0130brahim Selami \u00c7olak - 28 A\u011fustos 2026 - Etkinlik Davet Revize Kontrat\u0131 - Feriye.pdf";
  const extracted = await extractTextFromFile(file);
  const analysis = analyzeContract(extracted.text, { role: "hizmet_alan", pack: "etkinlik", quality: extracted.quality });
  console.log(JSON.stringify({ riskScore: analysis.summary.riskScore, level: analysis.summary.riskLevel, issues: analysis.issues.length, top3: analysis.topRisks.map(x=>x.id), categories: analysis.summary.categoryCounts }, null, 2));
})().catch(e=>{ console.error(e); process.exit(1); });
