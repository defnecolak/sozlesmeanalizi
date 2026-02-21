
const fs = require("fs");
const { analyzeContract } = require("./src/services/analyzer");
const text = fs.readFileSync("tmp_pdf_text.txt","utf8");
const analysis = analyzeContract(text, { role: "hizmet_alan", pack: "etkinlik" });
console.log(JSON.stringify({
  riskPoints: analysis.meta.riskPoints,
  riskScore: analysis.summary.riskScore,
  riskLevel: analysis.summary.riskLevel,
  issues: analysis.issues.length,
  top3: analysis.topRisks.map(x=>x.id),
  ids: analysis.issues.map(x=>x.id)
}, null, 2));
