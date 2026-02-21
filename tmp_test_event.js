
const { extractTextFromFile } = require("./src/services/extract");
const { analyzeContract } = require("./src/services/analyzer");
(async()=>{
  const file = process.argv[1];
  const extracted = await extractTextFromFile(file, { enableOcr: false });
  const text = extracted.text || "";
  const resGen = analyzeContract(text, { role: "hizmet_alan", pack: "genel", quality: extracted.quality });
  const resEvt = analyzeContract(text, { role: "hizmet_alan", pack: "etkinlik", quality: extracted.quality });
  console.log("chars", text.length);
  console.log("GENEL score", resGen.summary.riskScore, resGen.summary.level);
  console.log("ETKINLIK score", resEvt.summary.riskScore, resEvt.summary.level);
  console.log("top evt", resEvt.topRisks.map(r=>r.title));
})();
