
const fs = require("fs");
const { analyzeContract } = require("./src/services/analyzer");
const text = fs.readFileSync("tmp_pdf_text.txt","utf8");
const analysis = analyzeContract(text, { role: "hizmet_alan", pack: "etkinlik" });
console.log("risk", analysis.summary.riskScore, analysis.summary.riskLevel, "issues", analysis.issues.length);
console.log("sample impacts:");
for (const it of analysis.issues.slice(0,5)) {
  console.log("-", it.id, "=>", it.moneyImpact);
}
