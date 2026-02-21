const { spawn } = require("child_process");
const fs = require("fs/promises");

function boolEnv(v, fallback = false) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return fallback;
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function clampInt(n, fallback) {
  const x = Number(n);
  if (Number.isFinite(x)) return Math.trunc(x);
  return fallback;
}

async function fileSizeBytes(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.size || 0;
  } catch {
    return 0;
  }
}

function runCommand(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;

    const t = setTimeout(() => {
      killed = true;
      try { child.kill("SIGKILL"); } catch {}
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: typeof code === "number" ? code : -1, stdout, stderr, timedOut: killed });
    });
    child.on("error", (err) => {
      clearTimeout(t);
      resolve({ code: -1, stdout, stderr: String(err && err.message ? err.message : err), timedOut: false });
    });
  });
}

function pickClamBin(explicit) {
  const s = String(explicit || "").trim();
  if (s) return s;
  // Linux/Render: genelde clamscan veya clamdscan
  return "clamscan";
}

async function scanWithClamAV(filePath, opts) {
  const bin = pickClamBin(opts.bin);
  const timeoutMs = opts.timeoutMs;

  // clamscan exit codes:
  // 0 => no virus found
  // 1 => virus found
  // 2 => error
  // https://docs.clamav.net/manual/Usage/Scanning.html (genel kural)
  const args = ["--no-summary", "--infected", filePath];
  const r = await runCommand(bin, args, timeoutMs);

  if (r.timedOut) {
    return { ok: false, infected: false, engine: "clamav", status: 500, userMessage: "Antivirüs taraması zaman aşımına uğradı.", debug: r };
  }

  if (r.code === 0) {
    return { ok: true, infected: false, engine: "clamav", debug: r };
  }
  if (r.code === 1) {
    return { ok: false, infected: true, engine: "clamav", status: 400, userMessage: "Dosya güvenlik kontrolünden geçmedi.", debug: r };
  }
  return { ok: false, infected: false, engine: "clamav", status: 500, userMessage: "Antivirüs taraması başarısız oldu.", debug: r };
}

/**
 * Upload antivirüs taraması (opsiyonel)
 *
 * Varsayılan: kapalı
 *
 * .env:
 *  - ANTIVIRUS_MODE=off|clamav
 *  - CLAMAV_BIN=clamscan (opsiyonel)
 *  - ANTIVIRUS_TIMEOUT_MS=20000
 *  - ANTIVIRUS_FAIL_OPEN=false (tarama başarısız olursa upload'a izin ver?)
 *  - ANTIVIRUS_MAX_SCAN_MB=25 (büyük dosyaları taramayı atla)
 */
async function maybeScanUpload(filePath) {
  const mode = String(process.env.ANTIVIRUS_MODE || "off").trim().toLowerCase();
  if (!mode || mode === "off" || mode === "0" || mode === "false") {
    return { ok: true, skipped: true, engine: "off" };
  }

  const timeoutMs = clampInt(process.env.ANTIVIRUS_TIMEOUT_MS, 20000);
  const failOpen = boolEnv(process.env.ANTIVIRUS_FAIL_OPEN, false);
  const maxScanMb = clampInt(process.env.ANTIVIRUS_MAX_SCAN_MB, 25);

  // Çok büyük dosyalarda (özellikle OCR) tarama maliyetini kontrol altında tut
  const size = await fileSizeBytes(filePath);
  const sizeMb = size / (1024 * 1024);
  if (Number.isFinite(sizeMb) && sizeMb > maxScanMb) {
    return { ok: true, skipped: true, engine: mode, note: `skip_large_${maxScanMb}mb` };
  }

  try {
    if (mode === "clamav" || mode === "clam") {
      const r = await scanWithClamAV(filePath, {
        bin: process.env.CLAMAV_BIN,
        timeoutMs,
      });
      if (!r.ok && failOpen && !r.infected) {
        return { ok: true, skipped: true, engine: r.engine, note: "fail_open" };
      }
      return r;
    }

    // Gelecekte: VirusTotal, Cloudmersive vb.
    return { ok: true, skipped: true, engine: mode, note: "unknown_mode" };
  } catch (e) {
    if (failOpen) return { ok: true, skipped: true, engine: mode, note: "exception_fail_open" };
    return { ok: false, status: 500, userMessage: "Antivirüs taraması beklenmedik bir hata verdi.", debug: String(e && e.message ? e.message : e) };
  }
}

module.exports = {
  maybeScanUpload,
};
