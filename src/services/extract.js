const fs = require("fs/promises");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { Worker } = require("worker_threads");

const { fixMojibake, cleanDisplayName } = require("./encoding");
const { computeTextQuality } = require("./quality");
const { detectFileKind } = require("./magic");

function envBool(name, defVal) {
  const v = process.env[name];
  if (v === undefined) return defVal;
  return String(v).toLowerCase() === "true";
}

function envInt(name, defVal) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? Math.floor(v) : defVal;
}

async function extractInWorker(payload, opts = {}) {
  const timeoutMs = Math.max(1000, envInt("EXTRACT_TIMEOUT_MS", 15000));
  const workerPath = path.join(__dirname, "extractWorker.js");

  return await new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: payload });
    let settled = false;

    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { worker.terminate(); } catch {}
      return reject(new Error("Dosya işleme zaman aşımına uğradı (çok büyük/bozuk olabilir)."));
    }, opts.timeoutMs || timeoutMs);

    worker.on("message", (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      if (msg && msg.ok) return resolve(String(msg.text || ""));
      return reject(new Error(String(msg?.error || "Dosya işleme başarısız.")));
    });
    worker.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      return reject(err);
    });
    worker.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      if (code === 0) return reject(new Error("Dosya işleme sonlandı."));
      return reject(new Error(`Worker exit: ${code}`));
    });
  });
}

function execFileP(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { ...opts, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr?.toString()?.trim() || err.message || "Command failed";
        return reject(new Error(msg));
      }
      resolve({ stdout: stdout?.toString() || "", stderr: stderr?.toString() || "" });
    });
  });
}

function extFromName(name) {
  return (path.extname(name || "").toLowerCase() || "").replace(".", "");
}

async function extractTextFromUpload({ filePath, originalname, mimetype }) {
  const fileName = cleanDisplayName(originalname || "sozlesme");
  const ext = extFromName(fileName);

  // Basic file-type sanity check using magic bytes
  const kind = await detectFileKind(filePath);

  if (ext === "pdf" || mimetype === "application/pdf") {
    if (kind !== "pdf") throw new Error("Dosya PDF gibi görünmüyor (imza doğrulaması başarısız).");

    const useWorker = envBool("EXTRACT_USE_WORKER", true);
    let text = "";
    try {
      if (useWorker) {
        text = await extractInWorker({ type: "pdf", filePath });
      } else {
        const buf = await fs.readFile(filePath);
        const r = await pdfParse(buf);
        text = r.text || "";
      }
    } catch {
      text = "";
    }

    text = fixMojibake(text);

    const minChars = Number(process.env.OCR_MIN_TEXT_CHARS || 220);
    const enableOcr = envBool("ENABLE_OCR", false);

    if (enableOcr && (text || "").replace(/\s+/g, " ").trim().length < minChars) {
      const ocr = await ocrPdfToText(filePath);
      text = fixMojibake(ocr.text || "");
    }

    const quality = computeTextQuality(text);
    return { fileName, text, quality };
  }

  if (ext === "docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    if (kind !== "zip") throw new Error("DOCX dosyası ZIP imzası taşımıyor (dosya bozuk olabilir).");
    const useWorker = envBool("EXTRACT_USE_WORKER", true);
    let raw = "";
    if (useWorker) {
      raw = await extractInWorker({ type: "docx", filePath });
    } else {
      const buf = await fs.readFile(filePath);
      const r = await mammoth.extractRawText({ buffer: buf });
      raw = r.value || "";
    }

    const text = fixMojibake(raw || "");
    const quality = computeTextQuality(text);
    return { fileName, text, quality };
  }

  if (ext === "txt" || mimetype === "text/plain") {
    if (kind === "binary") throw new Error("TXT gibi görünen dosya binary olabilir.");
    const buf = await fs.readFile(filePath);
    const text = fixMojibake(buf.toString("utf8"));
    const quality = computeTextQuality(text);
    return { fileName, text, quality };
  }

  throw new Error("Desteklenmeyen dosya türü. PDF/DOCX/TXT yükleyin.");
}

async function ocrPdfToText(pdfPath) {
  const tesseractCmd = process.env.TESSERACT_CMD || "tesseract";
  const pdftoppmCmd = process.env.PDFTOPPM_CMD || "pdftoppm";
  const lang = process.env.OCR_LANG || "tur+eng";
  const maxPages = Number(process.env.OCR_MAX_PAGES || 5);
  const dpi = Number(process.env.OCR_DPI || 200);
  const stepTimeoutMs = Math.max(5000, envInt("OCR_STEP_TIMEOUT_MS", 25000));

  const workDir = path.join(process.cwd(), "tmp_ocr", crypto.randomUUID());
  await fs.mkdir(workDir, { recursive: true });

  const outPrefix = path.join(workDir, "page");
  try {
    await execFileP(
      pdftoppmCmd,
      ["-f", "1", "-l", String(maxPages), "-r", String(dpi), "-png", pdfPath, outPrefix],
      { timeout: stepTimeoutMs }
    );

    const files = await fs.readdir(workDir);
    const images = files
      .filter(f => /^page-\d+\.png$/i.test(f))
      .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0))
      .map(f => path.join(workDir, f));

    if (!images.length) throw new Error("OCR: PDF sayfaları görüntüye çevrilemedi.");

    let combined = "";
    for (const img of images) {
      const { stdout } = await execFileP(
        tesseractCmd,
        [img, "stdout", "-l", lang, "--psm", "6"],
        { timeout: stepTimeoutMs }
      );
      combined += "\n" + (stdout || "");
    }

    return { text: combined.trim() };
  } finally {
    try { await fs.rm(workDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { extractTextFromUpload };
