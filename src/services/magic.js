const fs = require("fs/promises");

async function detectFileKind(filePath) {
  const buf = await fs.readFile(filePath);
  const head = buf.slice(0, 16);
  const asAscii = head.toString("ascii");

  // PDF: %PDF-
  if (asAscii.startsWith("%PDF-")) return "pdf";

  // ZIP (docx): PK\x03\x04
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    return "zip";
  }

  // Heuristic: if contains many NUL bytes early, it's likely binary
  const nulCount = [...head].filter(x => x === 0x00).length;
  if (nulCount >= 2) return "binary";

  return "text";
}

module.exports = { detectFileKind };
