const fs = require("fs/promises");
const path = require("path");

const { cleanDisplayName } = require("./encoding");
const { detectFileKind } = require("./magic");

function envInt(name, defVal) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : defVal;
}

function extFromName(name) {
  return (path.extname(name || "").toLowerCase() || "").replace(".", "");
}

function bytesToMb(b) {
  return b / (1024 * 1024);
}

function looksPathTraversal(fileName) {
  const n = String(fileName || "").replace(/\\/g, "/");
  if (n.startsWith("/") || n.startsWith("\\")) return true;
  if (/^[a-zA-Z]:\//.test(n)) return true;
  if (n.includes("../") || n.includes("..\\")) return true;
  return false;
}

/**
 * ZIP (DOCX) merkezi dizin güvenlik kontrolü
 * - Zip slip / traversal dosya adları
 * - Zip bomb (aşırı decompress) / çok fazla entry
 * - DOCX doğrulama: word/document.xml var mı?
 * - Macro payload tespiti: vbaProject.bin
 */
async function inspectZipCentralDirectory(filePath, { maxEntries, maxUncompressedBytes, maxRatio } = {}) {
  const buf = await fs.readFile(filePath);
  const fileSize = buf.length;

  // EOCD kaydı ZIP'te son 64KB içinde olur.
  const searchLen = Math.min(fileSize, 0xFFFF + 22);
  const start = fileSize - searchLen;
  const tail = buf.subarray(start);

  // EOCD signature: 0x06054b50 (PK\x05\x06)
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error("DOCX/ZIP merkezi dizin bulunamadı (bozuk dosya olabilir).");
  }

  // EOCD fields
  // offset 12: central directory size (4)
  // offset 16: central directory offset (4)
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);

  if (cdOffset + cdSize > fileSize) {
    throw new Error("DOCX/ZIP merkezi dizin sınırları geçersiz (bozuk/şüpheli dosya).");
  }

  const central = buf.subarray(cdOffset, cdOffset + cdSize);

  const MAX_ENTRIES = Number.isFinite(maxEntries) ? maxEntries : envInt("ZIP_MAX_ENTRIES", 2500);
  const MAX_UNCOMP = Number.isFinite(maxUncompressedBytes)
    ? maxUncompressedBytes
    : envInt("ZIP_MAX_UNCOMPRESSED_MB", 60) * 1024 * 1024;
  const MAX_RATIO = Number.isFinite(maxRatio) ? maxRatio : envInt("ZIP_MAX_RATIO", 250);

  let ptr = 0;
  let entries = 0;
  let uncompressedTotal = 0;
  let hasDocumentXml = false;
  let hasMacro = false;

  while (ptr + 46 <= central.length) {
    // Central file header signature: 0x02014b50 (PK\x01\x02)
    const sig = central.readUInt32LE(ptr);
    if (sig !== 0x02014b50) break;

    const compSize = central.readUInt32LE(ptr + 20);
    const uncompSize = central.readUInt32LE(ptr + 24);
    const nameLen = central.readUInt16LE(ptr + 28);
    const extraLen = central.readUInt16LE(ptr + 30);
    const commentLen = central.readUInt16LE(ptr + 32);

    const nameStart = ptr + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > central.length) break;

    const nameRaw = central.subarray(nameStart, nameEnd).toString("utf8");
    const name = String(nameRaw || "");

    entries += 1;
    uncompressedTotal += uncompSize;

    // Path traversal / zip slip
    if (looksPathTraversal(name)) {
      throw new Error("DOCX/ZIP içinde şüpheli dosya yolu tespit edildi.");
    }

    const lower = name.toLowerCase();
    if (lower === "word/document.xml") hasDocumentXml = true;
    if (lower.endsWith("vbaproject.bin") || lower.includes("vba")) hasMacro = true;

    if (entries > MAX_ENTRIES) {
      throw new Error("DOCX/ZIP çok fazla dosya içeriyor (şüpheli).");
    }

    // Devam
    ptr = nameEnd + extraLen + commentLen;
  }

  if (!hasDocumentXml) {
    throw new Error("DOCX dosyası doğrulanamadı (word/document.xml bulunamadı).");
  }

  if (hasMacro) {
    throw new Error("DOCX/ZIP içinde makro benzeri içerik tespit edildi (vbaProject). Güvenlik için reddedildi.");
  }

  if (uncompressedTotal > MAX_UNCOMP) {
    throw new Error(`DOCX/ZIP çok büyük açılıyor (~${bytesToMb(uncompressedTotal).toFixed(1)} MB). Güvenlik için reddedildi.`);
  }

  const ratio = fileSize > 0 ? (uncompressedTotal / fileSize) : 0;
  if (ratio > MAX_RATIO) {
    throw new Error("DOCX/ZIP sıkıştırma oranı şüpheli (zip bomb olabilir). Güvenlik için reddedildi.");
  }

  return {
    entries,
    uncompressedTotal,
    ratio,
    hasDocumentXml,
  };
}

async function validateUploadedFile({ filePath, originalname, mimetype }) {
  const fileName = cleanDisplayName(originalname || "sozlesme");
  const ext = extFromName(fileName);

  // Basic magic check
  const kind = await detectFileKind(filePath);

  if (ext === "pdf" || mimetype === "application/pdf") {
    if (kind !== "pdf") throw new Error("PDF imza doğrulaması başarısız (dosya PDF gibi görünmüyor).");
    // Ek mini sanity: PDF header'in ilk satırı aşırı uzunsa şüpheli olabilir
    return { fileName, ext: "pdf", kind };
  }

  if (ext === "docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    if (kind !== "zip") throw new Error("DOCX imza doğrulaması başarısız (ZIP header yok).");
    const zipMeta = await inspectZipCentralDirectory(filePath);
    return { fileName, ext: "docx", kind, zipMeta };
  }

  if (ext === "txt" || mimetype === "text/plain") {
    if (kind === "binary") throw new Error("TXT gibi görünen dosya binary olabilir.");
    return { fileName, ext: "txt", kind };
  }

  throw new Error("Desteklenmeyen dosya türü. PDF/DOCX/TXT yükleyin.");
}

module.exports = {
  validateUploadedFile,
  inspectZipCentralDirectory,
};
