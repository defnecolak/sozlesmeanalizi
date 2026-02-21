
const fs=require("fs");
const { extractEventMeta } = require("./src/services/eventSimulator");
const text=fs.readFileSync("tmp_pdf_text.txt","utf8");
const ev = extractEventMeta(text);
console.log(ev.cancellationTable);
