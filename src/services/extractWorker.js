const { parentPort, workerData } = require("worker_threads");
const fs = require("fs/promises");

// Ağır bağımlılıklar worker içinde yüklenir:
// - pdf-parse (PDF text çıkarma)
// - mammoth (DOCX text çıkarma)
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

(async () => {
  try {
    const type = String(workerData?.type || "");
    const filePath = String(workerData?.filePath || "");

    if (!filePath) throw new Error("missing_filePath");

    const buf = await fs.readFile(filePath);

    let text = "";
    if (type === "pdf") {
      const r = await pdfParse(buf);
      text = r?.text || "";
    } else if (type === "docx") {
      const r = await mammoth.extractRawText({ buffer: buf });
      text = r?.value || "";
    } else {
      throw new Error("unsupported_type");
    }

    parentPort.postMessage({ ok: true, text });
  } catch (err) {
    parentPort.postMessage({
      ok: false,
      error: String(err?.message || err)
    });
  }
})();
