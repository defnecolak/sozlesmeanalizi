const $ = (id) => document.getElementById(id);

// CSRF (double-submit cookie) header'ı için cookie okuma helper'ı
function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^|; )" + name.replace(/[-.]/g, "\\$&") + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : "";
}
function csrfToken() {
  return getCookie("csrf_token");
}
function withCsrf(headers = {}) {
  const t = csrfToken();
  if (t) headers["X-CSRF-Token"] = t;
  return headers;
}

const fileInput = $("file");
const roleSelect = $("role");
const packSelect = $("pack");
const fileInfo = $("fileInfo");
const billingInfo = $("billingInfo");

// Üst barda mini kredi göstergesi
const creditsPill = $("creditsPill");
const creditsCount = $("creditsCount");
const redeemCodeInput = $("redeemCode");
const btnRedeem = $("btnRedeem");
const restoreCodeInput = $("restoreCode");
const btnRestore = $("btnRestore");
const btnAnalyze = $("btnAnalyze");
const btnReset = $("btnReset");
const btnDemo = $("btnDemo");
const resultCard = $("resultCard");
const btnPdf = $("btnPdf");
const premiumKeyInput = $("premiumKey");

// Bildirim / toast
const toastEl = $("toast");

// Kurtarma kodu (son satın alma)
const lastRestoreBox = $("lastRestoreBox");
const lastRestoreCode = $("lastRestoreCode");
const btnCopyLastRestore = $("btnCopyLastRestore");
const btnClearLastRestore = $("btnClearLastRestore");

// Ödeme modalı (iyzico)
const payModal = $("payModal");
const payBackdrop = $("payBackdrop");
const btnPayClose = $("btnPayClose");
const payPackLine = $("payPackLine");
const payFullName = $("payFullName");
const payEmail = $("payEmail");
const btnPayStart = $("btnPayStart");
const btnPayRefresh = $("btnPayRefresh");
const payRestoreLine = $("payRestoreLine");
const iyzicoCheckout = $("iyzicoCheckout");

const riskScoreEl = $("riskScore");
const riskLevelEl = $("riskLevel");
const metaLine = $("metaLine");
const qualityLine = $("qualityLine");
const issueCountEl = $("issueCount");
const softCountEl = $("softCount");

// Skor açıklaması alanı
const scoreMeaningEl = $("scoreMeaning");
const scoreFactorsEl = $("scoreFactors");
const scoreDriversEl = $("scoreDrivers");
const scoreCounterEl = $("scoreCounterfactual");

const top3List = $("top3List");
const issueList = $("issueList");
const softList = $("softList");

// Pazarlık çıktısı
const btnNegBuild = $("btnNegBuild");
const btnNegCopy = $("btnNegCopy");
const btnNegClear = $("btnNegClear");
const negOnlyFiltered = $("negOnlyFiltered");
const negText = $("negText");

// Pazarlık metnini otomatik üretme (kullanıcı Temizle'ye basarsa durur)
let negAutoEnabled = true;


const simCard = $("simCard");
const simSummary = $("simSummary");
const cancelDays = $("cancelDays");
const cancelDaysVal = $("cancelDaysVal");
const guaranteeGuests = $("guaranteeGuests");
const actualGuests = $("actualGuests");
const actualGuestsRange = $("actualGuestsRange");
const actualGuestsVal = $("actualGuestsVal");
const cancelResult = $("cancelResult");
const guestResult = $("guestResult");

const historyEl = $("history");

const sevChips = $("sevChips");
const catChips = $("catChips");

let lastAnalysis = null;
let lastText = "";
let lastExtracted = null;

let state = {
  severity: "ALL",
  category: "ALL"
};


const checkoutPackButtons = Array.from(document.querySelectorAll("[data-checkout-pack]"));

let _selectedPackCredits = 0;
let _payPollTimer = null;
let _payBaseline = null;
let _lastRestoreToken = "";

let _toastTimer = null;

const LS_LAST_RESTORE = "avukatim_last_restore_token";
const LS_PENDING_PAYMENT = "avukatim_pending_payment_v1";

function _safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function getLastRestoreToken() {
  try {
    const t = String(localStorage.getItem(LS_LAST_RESTORE) || "").trim();
    return t;
  } catch {
    return "";
  }
}

function setLastRestoreToken(token) {
  const t = String(token || "").trim();
  if (!t) return;
  _lastRestoreToken = t;
  try { localStorage.setItem(LS_LAST_RESTORE, t); } catch {}
  updateLastRestoreUI();
}

function clearLastRestoreToken() {
  _lastRestoreToken = "";
  try { localStorage.removeItem(LS_LAST_RESTORE); } catch {}
  updateLastRestoreUI();
}

function updateLastRestoreUI() {
  if (!lastRestoreBox || !lastRestoreCode) return;
  const t = _lastRestoreToken || getLastRestoreToken();
  if (!t) {
    lastRestoreBox.classList.add("hidden");
    lastRestoreCode.textContent = "";
    return;
  }
  lastRestoreCode.textContent = t;
  lastRestoreBox.classList.remove("hidden");
}

btnCopyLastRestore?.addEventListener("click", async () => {
  const t = _lastRestoreToken || getLastRestoreToken();
  if (!t) return;
  const ok = await copyTextToClipboard(t);
  if (ok) showToast({ kind: "ok", title: "Kopyalandı", message: "Kurtarma kodu panoya kopyalandı." });
});

btnClearLastRestore?.addEventListener("click", () => {
  clearLastRestoreToken();
  showToast({ kind: "ok", title: "Tamam", message: "Kurtarma kodu kutusu gizlendi." });
});

function hideToast() {
  if (!toastEl) return;
  toastEl.classList.add("hidden");
  toastEl.innerHTML = "";
  toastEl.classList.remove("ok", "err");
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }
}

function showToast({ kind = "ok", title = "", message = "", token = "", timeoutMs = 12000 }) {
  if (!toastEl) {
    // Fallback
    if (title || message) alert(`${title ? title + "\n" : ""}${message}`);
    return;
  }

  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }

  toastEl.classList.remove("hidden");
  toastEl.classList.toggle("ok", kind === "ok");
  toastEl.classList.toggle("err", kind !== "ok");

  const safeTitle = escapeHtml(title);
  const safeMsg = escapeHtml(message);
  const t = String(token || "").trim();
  const tokenHtml = t
    ? `<div class="muted small" style="margin-top:8px">Kurtarma kodun: <code>${escapeHtml(t)}</code></div>`
    : "";

  const copyBtnHtml = t
    ? `<button class="btn tiny" id="toastCopy" type="button">Kodu kopyala</button>`
    : "";

  toastEl.innerHTML = `
    <div class="toast-row">
      <div>
        <div class="toast-title">${safeTitle}</div>
        ${safeMsg ? `<div class="muted">${safeMsg}</div>` : ""}
        ${tokenHtml}
      </div>
      <div class="toast-actions">
        ${copyBtnHtml}
        <button class="btn tiny" id="toastClose" type="button">Kapat</button>
      </div>
    </div>
  `;

  document.getElementById("toastClose")?.addEventListener("click", hideToast);
  document.getElementById("toastCopy")?.addEventListener("click", async () => {
    const ok = await copyTextToClipboard(t);
    if (ok) showToast({ kind: "ok", title: "Kopyalandı", message: "Kurtarma kodu panoya kopyalandı.", timeoutMs: 5000 });
  });

  if (timeoutMs && timeoutMs > 0) {
    _toastTimer = setTimeout(hideToast, timeoutMs);
  }
}

function _creditNum(st) {
  if (!st) return 0;
  if (st.unlimited) return Infinity;
  const n = Number(st.credits || 0);
  return Number.isFinite(n) ? n : 0;
}

function setPendingPayment(baselineStatus, { restoreToken = "", expectedCredits = 0, provider = "" } = {}) {
  const base = baselineStatus || {};
  const rec = {
    at: Date.now(),
    provider: String(provider || ""),
    baseUnlimited: !!base.unlimited,
    baseCredits: _creditNum(base),
    expectedCredits: Number(expectedCredits || 0),
    restoreToken: String(restoreToken || "").trim()
  };
  try { localStorage.setItem(LS_PENDING_PAYMENT, JSON.stringify(rec)); } catch {}
}

function clearPendingPayment() {
  try { localStorage.removeItem(LS_PENDING_PAYMENT); } catch {}
}

function readPendingPayment() {
  try {
    const raw = localStorage.getItem(LS_PENDING_PAYMENT);
    if (!raw) return null;
    const p = _safeJsonParse(raw);
    if (!p || !p.at) return null;
    return p;
  } catch {
    return null;
  }
}

function maybeCompletePendingPayment(currentStatus) {
  const p = readPendingPayment();
  if (!p) return;

  // 48 saatten eskiyse temizle
  const age = Date.now() - Number(p.at || 0);
  if (!Number.isFinite(age) || age > 48 * 3600 * 1000) {
    clearPendingPayment();
    return;
  }

  const newUnlimited = !!currentStatus?.unlimited;
  const newCredits = _creditNum(currentStatus);
  const baseUnlimited = !!p.baseUnlimited;
  const baseCredits = Number(p.baseCredits || 0);

  const becameUnlimited = (!baseUnlimited && newUnlimited);
  const increased = (Number.isFinite(newCredits) && Number.isFinite(baseCredits)) ? (newCredits > baseCredits) : false;

  if (!becameUnlimited && !increased) return;

  const token = String(p.restoreToken || "").trim();
  if (token) setLastRestoreToken(token);

  let msg = "Kredin yüklendi.";
  if (becameUnlimited) {
    msg = "Ödeme alındı. Artık sınırsız analizin var.";
  } else {
    const delta = Math.max(0, Math.round((newCredits - baseCredits) * 100) / 100);
    msg = delta ? `Ödeme alındı. +${delta} kredi eklendi.` : "Ödeme alındı. Kredin güncellendi.";
  }

  showToast({
    kind: "ok",
    title: "✅ Kredi eklendi",
    message: msg,
    token: token || (_lastRestoreToken || getLastRestoreToken()),
    timeoutMs: 16000
  });
  clearPendingPayment();
}

function setInnerHTMLWithScripts(el, html) {
  if (!el) return;
  el.innerHTML = String(html || "");

  // CSP (nonce) uyumu: ödeme sağlayıcısının (iyzico) döndürdüğü <script> tag'lerini
  // çalıştırırken nonce ekliyoruz. Böylece güçlü CSP aktifken bile entegrasyon bozulmaz.
  const nonce = String(window.__CSP_NONCE__ || "");

  const scripts = Array.from(el.querySelectorAll("script"));
  scripts.forEach((old) => {
    const s = document.createElement("script");
    Array.from(old.attributes || []).forEach(attr => s.setAttribute(attr.name, attr.value));
    if (nonce) s.setAttribute("nonce", nonce);
    s.text = old.textContent;
    old.parentNode && old.parentNode.replaceChild(s, old);
  });
}

async function fetchBillingStatusObj() {
  try {
    const resp = await fetch("/api/status");
    const data = await resp.json();
    if (!data.ok) return null;
    return data.status || null;
  } catch {
    return null;
  }
}

function _packLabelFor(credits) {
  const packs = Array.isArray(window.__CHECKOUT_PACKS__) ? window.__CHECKOUT_PACKS__ : [];
  const p = packs.find(x => Number(x?.credits) === Number(credits));
  return p?.label || `${credits} Kredi`;
}

function openPayModalFor(credits) {
  if (!payModal) {
    alert("Ödeme penceresi bulunamadı.");
    return;
  }
  _selectedPackCredits = Number(credits) || 0;

  if (payPackLine) payPackLine.textContent = `Seçilen paket: ${_packLabelFor(_selectedPackCredits)}`;

  // reset state
  if (payRestoreLine) {
    payRestoreLine.style.display = "none";
    payRestoreLine.textContent = "";
  }
  if (iyzicoCheckout) iyzicoCheckout.innerHTML = "";

  if (btnPayStart) {
    btnPayStart.disabled = false;
    btnPayStart.textContent = "Ödemeyi Başlat";
  }

  payModal.classList.remove("hidden");
  payModal.setAttribute("aria-hidden", "false");
}

function closePayModal() {
  if (!payModal) return;
  payModal.classList.add("hidden");
  payModal.setAttribute("aria-hidden", "true");
  if (_payPollTimer) {
    clearInterval(_payPollTimer);
    _payPollTimer = null;
  }
}

btnPayClose?.addEventListener("click", closePayModal);
payBackdrop?.addEventListener("click", closePayModal);
btnPayRefresh?.addEventListener("click", async () => {
  await loadBillingStatus();
});

async function startIyzicoPayment() {
  if (window.__PAYMENTS_PROVIDER__ !== "iyzico") return;

  const credits = Number(_selectedPackCredits || 0);
  if (!credits) { alert("Paket bulunamadı."); return; }

  btnPayStart.disabled = true;
  const oldText = btnPayStart.textContent;
  btnPayStart.textContent = "Ödeme sayfası açılıyor…";

  try {
    _payBaseline = await fetchBillingStatusObj();

    // Ödeme dönüşünde "kredi eklendi" bildirimini yakalamak için bir iz bırakıyoruz.
    // Kurtarma kodu (restore token) artık ödeme sayfasında oluşturulacak ve localStorage'a yazılacak.
    setPendingPayment(_payBaseline || {}, { expectedCredits: credits, provider: "iyzico" });

    const url = `/odeme?credits=${encodeURIComponent(String(credits))}`;
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      showToast({ kind: "err", title: "Popup engellendi", message: "Tarayıcı ödeme penceresini engelledi. Popup izni verip tekrar dene.", timeoutMs: 12000 });
    } else {
      showToast({ kind: "ok", title: "Ödeme sayfası açıldı", message: "Ödeme yeni sekmede açıldı. Bu sayfada kredin otomatik güncellenecek.", timeoutMs: 9000 });
    }

    // Ödeme tamamlanınca kredileri yakalamak için kısa süreli polling
    if (_payPollTimer) clearInterval(_payPollTimer);
    const startedAt = Date.now();
    _payPollTimer = setInterval(async () => {
      // 10 dakika sonra otomatik dur
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        clearInterval(_payPollTimer);
        _payPollTimer = null;
        return;
      }
      // pending yoksa dur
      if (!readPendingPayment()) {
        clearInterval(_payPollTimer);
        _payPollTimer = null;
        return;
      }
      await loadBillingStatus();
    }, 3500);

    closePayModal();

  } catch (e) {
    alert(e.message || "Ödeme başlatılamadı.");
  } finally {
    btnPayStart.disabled = false;
    btnPayStart.textContent = oldText;
  }
}

btnPayStart?.addEventListener("click", startIyzicoPayment);

checkoutPackButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const provider = String(window.__PAYMENTS_PROVIDER__ || "");
    const credits = Number(btn.dataset.credits || 0);
    if (!credits) { alert("Paket bulunamadı."); return; }

    if (provider === "iyzico") {
      openPayModalFor(credits);
      return;
    }

    if (provider !== "lemonsqueezy") {
      alert("Ödeme sağlayıcı ayarlı değil.");
      return;
    }

    // --- Lemon Squeezy ---
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "Yönlendiriliyor…";

    try {
      const baseline = await fetchBillingStatusObj();
      const resp = await fetch(`/api/checkout-url?credits=${encodeURIComponent(credits)}`);
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Checkout oluşturulamadı.");

      if (data.restoreToken) {
        setLastRestoreToken(data.restoreToken);
        setPendingPayment(baseline || {}, { restoreToken: data.restoreToken, expectedCredits: credits, provider: "lemonsqueezy" });
        showToast({
          kind: "ok",
          title: "Kurtarma kodu hazır",
          message: "Bu kodu sakla. Cihaz değiştirirsen veya çerezler silinirse kredini bu kodla geri alabilirsin.",
          token: data.restoreToken,
          timeoutMs: 16000
        });
      } else {
        setPendingPayment(baseline || {}, { expectedCredits: credits, provider: "lemonsqueezy" });
      }

      window.open(data.url, "_blank", "noopener");
    } catch (e) {
      alert(e.message || "Checkout oluşturulamadı.");
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });
});

btnRestore?.addEventListener("click", async () => {
  const token = String(restoreCodeInput?.value || "").trim();
  if (!token) { alert("Kurtarma kodu boş olamaz."); return; }

  btnRestore.disabled = true;
  const old = btnRestore.textContent;
  btnRestore.textContent = "Kontrol ediliyor…";
  try {
    const resp = await fetch("/api/restore", {
      method: "POST",
      headers: withCsrf({ "Content-Type": "application/json" }),
      body: JSON.stringify({ token })
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Kredi kurtarılamadı.");
    alert("Kredi kurtarıldı. Bu cihaz artık aynı kredileri kullanacak.");
    restoreCodeInput.value = "";
    await loadBillingStatus();
  } catch (e) {
    alert(e.message || "Kredi kurtarılamadı.");
  } finally {
    btnRestore.disabled = false;
    btnRestore.textContent = old;
  }
});

fileInput?.addEventListener("change", () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) {
    fileInfo.textContent = "Dosya seçilmedi.";
    btnAnalyze.disabled = true;
    return;
  }
  fileInfo.textContent = `${f.name} • ${(f.size/1024/1024).toFixed(2)} MB`;
  btnAnalyze.disabled = false;
  hideResult();
});

btnReset?.addEventListener("click", () => {
  fileInput.value = "";
  fileInfo.textContent = "Dosya seçilmedi.";
  btnAnalyze.disabled = true;
  hideResult();
});

btnDemo?.addEventListener("click", async () => {
  btnDemo.disabled = true;
  btnDemo.textContent = "Demo hazırlanıyor…";
  try {
    const role = roleSelect?.value || "genel";
    const pack = packSelect?.value || "genel";
    const resp = await fetch("/api/analyze-demo", {
      method: "POST",
      headers: withCsrf({ "Content-Type": "application/json" }),
      body: JSON.stringify({ role, pack })
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Demo analiz başarısız");

    lastAnalysis = data.analysis;
    lastText = data.text;
    lastExtracted = data.extracted;

    renderAll(lastAnalysis, lastExtracted);
    // Pazarlık çıktısını otomatik üret
    negAutoEnabled = true;
    buildNegotiationBox({ force: true });
    saveHistory(lastExtracted?.fileName || "demo.txt", lastAnalysis?.summary);
    renderHistory();
loadBillingStatus();

    resultCard.classList.remove("hidden");
    btnPdf.disabled = false;
    window.scrollTo({ top: resultCard.offsetTop - 12, behavior: "smooth" });
  } catch (e) {
    alert(e.message || "Demo hata");
  } finally {
    btnDemo.disabled = false;
    btnDemo.textContent = "Demo";
  }
});

btnAnalyze?.addEventListener("click", async () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;

  btnAnalyze.disabled = true;
  btnAnalyze.textContent = "Yükleniyor & analiz ediliyor…";
  try {
    const role = roleSelect?.value || "genel";
    const pack = packSelect?.value || "genel";
    const fd = new FormData();
    fd.append("file", f);
    fd.append("role", role);
    fd.append("pack", pack);

    const resp = await fetch("/api/analyze-file", { method: "POST", headers: withCsrf({}), body: fd });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Analiz başarısız.");

    lastAnalysis = data.analysis;
    lastText = data.text;
    lastExtracted = data.extracted;

    renderAll(lastAnalysis, lastExtracted);
    // Pazarlık çıktısını otomatik üret
    negAutoEnabled = true;
    buildNegotiationBox({ force: true });
    saveHistory(lastExtracted?.fileName || f.name, lastAnalysis?.summary);
    renderHistory();
loadBillingStatus();

    resultCard.classList.remove("hidden");
    btnPdf.disabled = false;
    window.scrollTo({ top: resultCard.offsetTop - 12, behavior: "smooth" });
  } catch (e) {
    console.error(e);
    alert(e.message || "Hata oluştu.");
    loadBillingStatus();
  } finally {
    btnAnalyze.disabled = false;
    btnAnalyze.textContent = "Analiz Et";
  }
});

btnPdf?.addEventListener("click", async () => {
  if (!lastAnalysis || !lastText) return;

  btnPdf.disabled = true;
  btnPdf.textContent = "PDF hazırlanıyor…";
  try {
    const accessKey = (window.__PAYWALL_MODE__ === "on") ? (premiumKeyInput?.value || "") : undefined;

    const resp = await fetch("/api/report", {
      method: "POST",
      headers: withCsrf({ "Content-Type": "application/json" }),
      body: JSON.stringify({ analysis: lastAnalysis, text: lastText, extracted: lastExtracted, accessKey })
    });

    const dataType = resp.headers.get("content-type") || "";

    if (!resp.ok) {
      // likely json
      if (dataType.includes("application/json")) {
        const j = await resp.json();
        throw new Error(j.error || "PDF üretilemedi");
      } else {
        const msg = await resp.text();
        throw new Error(msg || "PDF üretilemedi");
      }
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sozlesme-risk-raporu.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.message || "PDF üretilemedi.");
  } finally {
    btnPdf.disabled = false;
    btnPdf.textContent = "PDF Rapor İndir";
  }
});

btnRedeem?.addEventListener("click", async () => {
  if (window.__BILLING_MODE__ !== "credits") return;
  const code = redeemCodeInput?.value || "";
  if (!code.trim()) { alert("Kod girin."); return; }

  btnRedeem.disabled = true;
  const old = btnRedeem.textContent;
  btnRedeem.textContent = "Aktifleştiriliyor…";
  try {
    const resp = await fetch("/api/redeem", {
      method: "POST",
      headers: withCsrf({ "Content-Type": "application/json" }),
      body: JSON.stringify({ code })
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Kod aktifleştirilemedi.");
    redeemCodeInput.value = "";
    loadBillingStatus();
    alert(`✅ Kod aktif: +${data.added} kredi eklendi`);
  } catch (e) {
    alert(e.message || "Kod aktifleştirilemedi.");
  } finally {
    btnRedeem.disabled = false;
    btnRedeem.textContent = old || "Kodu Aktif Et";
  }
});


function hideResult() {
  resultCard.classList.add("hidden");
  btnPdf.disabled = true;
  lastAnalysis = null;
  lastText = "";
  lastExtracted = null;
  if (simCard) simCard.classList.add("hidden");

  // pazarlık metni alanını temizle
  if (negText) negText.value = "";
  if (btnNegCopy) btnNegCopy.disabled = true;
  if (negOnlyFiltered) negOnlyFiltered.checked = false;
  negAutoEnabled = true;
}

function pillColorClass(color) {
  return `pill pill-${color}`;
}



function formatMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const cur = (currency || "EUR").toUpperCase();
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur }).format(n);
  } catch {
    const sym = cur === "TRY" ? "₺" : (cur === "USD" ? "$" : "€");
    return `${sym}${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function cancelPercent(table, daysBefore) {
  const d = Number(daysBefore);
  if (!Number.isFinite(d) || !Array.isArray(table)) return null;
  for (const row of table) {
    if (!row) continue;
    const min = Number(row.minDays);
    const max = Number(row.maxDays);
    const pct = Number(row.percent);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(pct)) continue;
    if (max === 9999 && d >= min) return pct;
    if (d >= min && d <= max) return pct;
  }
  return null;
}

function sumPaidUntil(schedule, isoDate) {
  if (!Array.isArray(schedule) || !isoDate) return 0;
  const limit = new Date(isoDate + "T00:00:00Z");
  if (!Number.isFinite(limit.getTime())) return 0;
  let sum = 0;
  for (const p of schedule) {
    const d = new Date((p.date || "") + "T00:00:00Z");
    if (!Number.isFinite(d.getTime())) continue;
    if (d.getTime() <= limit.getTime()) sum += Number(p.amount || 0);
  }
  return Math.round(sum * 100) / 100;
}

function daysToCancelDate(eventIso, daysBefore) {
  const e = new Date(eventIso + "T00:00:00Z");
  if (!Number.isFinite(e.getTime())) return null;
  const d = new Date(e.getTime() - (Number(daysBefore) * 24 * 60 * 60 * 1000));
  return d;
}

let __simBound = false;
function renderSimulation(simulation) {
  if (!simCard) return;

  const ev = simulation?.event;
  if (!ev?.available) {
    simCard.classList.add("hidden");
    return;
  }

  simCard.classList.remove("hidden");

  const currency = ev.total?.currency || "EUR";
  const total = ev.total?.amount;
  const dateStr = ev.eventDate ? new Date(ev.eventDate + "T00:00:00Z").toLocaleDateString("tr-TR") : "—";
  const g = ev.guarantee ? `${ev.guarantee}` : "—";
  const ppp = ev.perPersonVatIncl || ev.perPersonFromTotal || null;

  simSummary.innerHTML = `
    <div><b>Etkinlik tarihi:</b> ${dateStr}</div>
    <div><b>Toplam tutar:</b> ${formatMoney(total, currency)}</div>
    <div><b>Garanti kişi:</b> ${g}${ppp ? ` • <b>Kişi başı (yaklaşık):</b> ${formatMoney(ppp, currency)}` : ""}</div>
  `;

  if (!__simBound) {
    cancelDays?.addEventListener("input", () => updateSim(ev));
    cancelDays?.addEventListener("change", () => updateSim(ev));

    guaranteeGuests?.addEventListener("input", () => updateSim(ev));
    guaranteeGuests?.addEventListener("change", () => updateSim(ev));

    actualGuests?.addEventListener("input", () => updateSim(ev));
    actualGuests?.addEventListener("change", () => updateSim(ev));

    actualGuestsRange?.addEventListener("input", () => {
      if (actualGuests) actualGuests.value = String(actualGuestsRange.value || "0");
      updateSim(ev);
    });
    actualGuestsRange?.addEventListener("change", () => {
      if (actualGuests) actualGuests.value = String(actualGuestsRange.value || "0");
      updateSim(ev);
    });

    __simBound = true;
  }

  // defaults
  if (guaranteeGuests && ev.guarantee && !guaranteeGuests.value) guaranteeGuests.value = String(ev.guarantee);
  if (actualGuests) {
    const defA = ev.actual ?? ev.guarantee ?? 0;
    if (!actualGuests.value) actualGuests.value = String(defA);
  }
  if (actualGuestsRange) {
    const defA = ev.actual ?? ev.guarantee ?? 0;
    if (!actualGuestsRange.value) actualGuestsRange.value = String(defA);
  }
  if (cancelDays && !cancelDays.value) cancelDays.value = "60";

  updateSim(ev);
}

function guestRangeMax(guarantee, actual) {
  const g = Math.max(0, Number(guarantee) || 0);
  const a = Math.max(0, Number(actual) || 0);
  const headroom = Math.max(50, Math.round(g * 0.5));
  const max = Math.max(100, a + headroom, g + headroom, g * 2);
  return Math.min(max, 5000);
}

function updateSim(ev) {
  if (!ev?.available) return;
  const currency = ev.total?.currency || "EUR";
  const total = Number(ev.total?.amount || 0);

  // Cancel sim
  const daysBefore = Number(cancelDays?.value || 0);
  const pct = cancelPercent(ev.cancellationTable || [], daysBefore);
  const fee = (pct != null) ? (total * (pct / 100)) : null;

  const cancelDate = ev.eventDate ? daysToCancelDate(ev.eventDate, daysBefore) : null;
  const cancelIso = cancelDate ? cancelDate.toISOString().slice(0, 10) : null;
  const paid = cancelIso ? sumPaidUntil(ev.paymentSchedule || [], cancelIso) : 0;
  const addl = (fee != null) ? Math.max(0, fee - paid) : null;

  if (cancelDaysVal) {
    const cd = cancelDate ? cancelDate.toLocaleDateString("tr-TR") : "—";
    if (cancelDaysVal) cancelDaysVal.textContent = `${daysBefore} gün kala (iptal tarihi: ${cd})`;
  }

  if (cancelResult) {
    if (pct == null || fee == null) {
      if (cancelResult) cancelResult.textContent = "İptal tablosu metinden net çıkarılamadı.";
    } else {
      cancelResult.innerHTML = `
        <div><b>İptal bedeli:</b> %${pct} (${formatMoney(fee, currency)})</div>
        <div><b>Bu tarihe kadar ödenmiş taksitler:</b> ${formatMoney(paid, currency)}</div>
        <div><b>Ek ödenmesi muhtemel tutar:</b> ${formatMoney(addl, currency)}</div>
        <div class="muted small" style="margin-top:6px">
          Not: Sözleşmede “cayma bedeli” ve “cezai şart” hükümleri birlikte geçtiği için kesin hesap için sözleşme maddelerini esas alın.
        </div>
      `;
    }
  }

  // Guest sim
  const guarantee = guaranteeGuests?.value
    ? Number(guaranteeGuests.value)
    : Number(ev.guarantee || 0);
  const actual = actualGuests?.value === "" ? guarantee : Number(actualGuests?.value || 0);

  // Slider/UI senkronu
  if (actualGuestsVal) {
    if (actualGuestsVal) actualGuestsVal.textContent = `Seçili kişi sayısı: ${Number.isFinite(actual) ? actual : 0}`;
  }
  if (actualGuestsRange) {
    const max = guestRangeMax(guarantee, actual);
    actualGuestsRange.min = "0";
    actualGuestsRange.max = String(max);
    actualGuestsRange.value = String(Math.min(Math.max(0, Number.isFinite(actual) ? actual : 0), max));
  }
  const perPerson = Number(ev.perPersonVatIncl || ev.perPersonFromTotal || 0);
  const extra = Math.max(0, actual - guarantee);
  const extraCost = (extra > 0 && perPerson > 0) ? (extra * perPerson) : 0;

  if (guestResult) {
    if (!guarantee) {
      if (guestResult) guestResult.textContent = "Garanti kişi sayısı çıkarılamadı.";
    } else {
      guestResult.innerHTML = `
      <div><b>Garanti:</b> ${Number.isFinite(guarantee) ? guarantee : 0} • <b>Gerçek:</b> ${Number.isFinite(actual) ? actual : 0}</div>
        <div><b>Ek kişi:</b> ${extra}</div>
        <div><b>Ek maliyet (yaklaşık):</b> ${formatMoney(extraCost, currency)}</div>
        <div class="muted small" style="margin-top:6px">
          Not: Sözleşmede belli bir artışın üzerindeki talepleri karşılamama hakkı olabilir; kapasite/operasyon şartlarına bağlıdır.
        </div>
      `;
    }
  }
}

function roleLabel(role) {
  switch (role) {
    case "hizmet_alan": return "Hizmet Alan";
    case "hizmet_veren": return "Hizmet Veren";
    case "kiraci": return "Kiracı";
    case "ev_sahibi": return "Ev Sahibi";
    case "alici": return "Alıcı";
    case "satici": return "Satıcı";
    default: return "Genel";
  }
}

function packLabel(pack) {
  switch (pack) {
    case "genel": return "Genel";
    case "satis": return "Satış/Alım";
    case "kira": return "Kira";
    case "hizmet": return "Hizmet";
    case "is": return "İş";
    case "nda": return "NDA/Gizlilik";
    case "freelance": return "Freelance";
    case "saas": return "SaaS Abonelik";
    case "etkinlik": return "Düğün/Etkinlik";
    case "influencer": return "Influencer";
    default: return pack || "Genel";
  }
}


function renderScoreExplain(summary) {
  const ex = summary?.scoreExplain || null;

  // Güvenli varsayılanlar
  const meaning = ex?.meaning || "Bu skor bir tehlike alarmı veya ‘imzala/imzalama’ kararı değildir. Sözleşme dilinde senin aleyhine işleyebilecek madde yoğunluğunu yaklaşık olarak gösterir.";
  if (scoreMeaningEl) scoreMeaningEl.textContent = meaning;

  // Faktörler (2–3 madde)
  if (scoreFactorsEl) {
    const lines = Array.isArray(ex?.factors) ? ex.factors : [];
    scoreFactorsEl.innerHTML = lines.slice(0, 3).map(l => `<li>${escapeHtml(String(l))}</li>`).join("");
  }

  // Skoru en çok artıran 3 madde
  if (scoreDriversEl) {
    const drivers = Array.isArray(ex?.topDrivers) ? ex.topDrivers : [];
    if (!drivers.length) {
      scoreDriversEl.innerHTML = `<div class="muted small">—</div>`;
    } else {
      scoreDriversEl.innerHTML = drivers.slice(0, 3).map(d => {
        const sev = String(d.severity || "");
        const badge = sev ? `<span class="badge badge-${sev}">${sevTr(sev)}</span>` : "";
        const pts = Number(d.points || 0);
        const ptsText = Number.isFinite(pts) && pts > 0 ? `<span class="driver-points">+${pts.toFixed(1)} puan</span>` : "";
        const cat = d.category ? `<div class="driver-meta">${escapeHtml(String(d.category))}</div>` : "";
        return `
          <div class="driver-item">
            <div>
              <div class="driver-title">${escapeHtml(String(d.title || ""))}</div>
              ${cat}
            </div>
            <div class="driver-right">${badge}${ptsText}</div>
          </div>
        `;
      }).join("");
    }
  }

  // Counterfactual: Bu maddeler olmasa skor kaç olurdu?
  if (scoreCounterEl) {
    const w = Number(ex?.withoutTopDriversScore);
    if (Number.isFinite(w)) {
      if (scoreCounterEl) scoreCounterEl.textContent = `Bu 3 madde olmasa skor yaklaşık ${w}/100 olurdu.`;
      scoreCounterEl.classList.remove("hidden");
    } else {
      if (scoreCounterEl) scoreCounterEl.textContent = "";
      scoreCounterEl.classList.add("hidden");
    }
  }
}

function renderAll(analysis, extracted) {
  const s = analysis.summary;
  const m = analysis.meta;

  if (riskScoreEl) riskScoreEl.textContent = `${s.riskScore}/100`;
  if (riskLevelEl) riskLevelEl.textContent = `Seviye: ${s.riskLevel}`;
  riskLevelEl.className = pillColorClass(s.riskLevelColor);

  if (metaLine) {
    metaLine.textContent = `Analiz: ${new Date(m.analyzedAt).toLocaleString()} • Rol: ${roleLabel(s.role)}`;
  }


  if (qualityLine) {
  if (extracted?.quality?.label) {
    qualityLine.textContent = `Metin Kalitesi: ${extracted.quality.label} (${extracted.quality.score}/100)`;
  } else if (s.quality?.label) {
    qualityLine.textContent = `Metin Kalitesi: ${s.quality.label} (${s.quality.score}/100)`;
  } else {
    qualityLine.textContent = "—";
  }
  }

  if (issueCountEl) issueCountEl.textContent = `${s.issueCount}`;
  if (softCountEl) softCountEl.textContent = `${s.softWarningCount}`;

  renderScoreExplain(s);

  renderTop3(analysis.topRisks || []);
  renderFilters(s);
  applyFilters();
  renderSoft(analysis.softWarnings || []);
  renderSimulation(analysis.simulation || null);

  // Pazarlık kutusunu yeni analiz için sıfırla
  if (negText) negText.value = "";
  if (btnNegCopy) btnNegCopy.disabled = true;

  resultCard.classList.remove("hidden");
}

function renderTop3(items) {
  if (!items.length) {
    top3List.innerHTML = `<div class="muted small">Belirgin risk sinyali bulunmadı (bu, risk yok demek değildir).</div>`;
    return;
  }

  // Sadece başlık göster (kısa özet)
  top3List.innerHTML = items.map(it => {
    return `<div class="top3-title">${escapeHtml(it.title)}</div>`;
  }).join("");
}


function renderFilters(summary) {
  // severity chips
  const sevCounts = summary.severityCounts || {};
  const sevOptions = [
    { id: "ALL", label: `Tümü (${summary.issueCount})` },
    { id: "CRITICAL", label: `Kritik (${sevCounts.CRITICAL || 0})` },
    { id: "HIGH", label: `Yüksek (${sevCounts.HIGH || 0})` },
    { id: "MEDIUM", label: `Orta (${sevCounts.MEDIUM || 0})` },
    { id: "LOW", label: `Düşük (${sevCounts.LOW || 0})` }
  ];
  sevChips.innerHTML = sevOptions.map(o => chipHtml("sev", o.id, o.label, state.severity === o.id)).join("");
  sevChips.querySelectorAll("button[data-chip='sev']").forEach(btn => {
    btn.addEventListener("click", () => {
      state.severity = btn.getAttribute("data-id");
      renderFilters(summary);
      applyFilters();
    });
  });

  // category chips
  const catCounts = summary.categoryCounts || {};
  const cats = Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a]);
  const catOptions = [{ id: "ALL", label: "Tümü" }].concat(cats.map(c => ({ id: c, label: `${c} (${catCounts[c]})` })));
  catChips.innerHTML = catOptions.map(o => chipHtml("cat", o.id, o.label, state.category === o.id)).join("");
  catChips.querySelectorAll("button[data-chip='cat']").forEach(btn => {
    btn.addEventListener("click", () => {
      state.category = btn.getAttribute("data-id");
      renderFilters(summary);
      applyFilters();
    });
  });
}

function applyFilters() {
  const issues = (lastAnalysis?.issues || []);
  const filtered = issues.filter(it => {
    const okSev = (state.severity === "ALL") || (it.severity === state.severity);
    const okCat = (state.category === "ALL") || (it.category === state.category);
    return okSev && okCat;
  });

  if (!filtered.length) {
    issueList.innerHTML = `<div class="muted small">Bu filtre kombinasyonunda risk bulunamadı.</div>`;
  } else {
    issueList.innerHTML = filtered.map(renderIssueCard).join("");
  }

  // Her yeniden çizimde kart aksiyonlarını bağla
  bindIssueCardActions();

  // Pazarlık çıktısı "filtreli riskleri kullan" modundaysa otomatik güncelle
  if (negOnlyFiltered && negOnlyFiltered.checked) {
    buildNegotiationBox();
  }
}

function renderSoft(items) {
  if (!items.length) {
    softList.innerHTML = `<div class="muted small">Uyarı yok.</div>`;
    return;
  }
  softList.innerHTML = items.map(it => {
    const metaParts = [];
    if (it.category) metaParts.push(escapeHtml(it.category));
    const metaHtml = metaParts.length
      ? `<div class="item-meta">${metaParts.map(p => `<span class="meta-pill">${p}</span>`).join("")}</div>`
      : "";

    // “Kısaca:” gibi etiketler yerine doğrudan cümle göster (daha profesyonel görünür).
    const summaryHtml = it.why
      ? `<div class="risk-sentences"><p>${escapeHtml(it.why)}</p></div>`
      : "";

    const askHtml = (it.templates && it.templates.length)
      ? `<div class="section"><div class="section-title">Ne yapabilirsin?</div><ul class="bullets">${it.templates.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul></div>`
      : "";

    return `<div class="item" data-sev="${escapeHtml(it.severity)}">
      <div class="item-head">
        <div class="item-title">${escapeHtml(it.title)}</div>
        <div class="badge badge-${it.severity}">${sevTr(it.severity)}</div>
      </div>
      ${metaHtml}
      ${summaryHtml}
      ${askHtml}
    </div>`;
  }).join("");
}

function renderIssueCard(it) {
  const idEsc = escapeHtml(it.id || "");
  // "Metinden alıntı" panelinde mümkün olduğunca tam madde/paragraf göster.
  const snippet = highlightSnippet(it.quote || it.snippet || "", it.match || "");

  const occ = (it.occurrences && Number(it.occurrences) > 1)
    ? `Geçen yer: ${Number(it.occurrences)}`
    : "";

  // Meta rozetleri (kategori / madde / tekrar sayısı)
  const metaParts = [];
  if (it.category) metaParts.push(escapeHtml(it.category));
  if (it.clause) metaParts.push(`<span class="mono">${escapeHtml(it.clause)}</span>`);
  if (occ) metaParts.push(`<span class="mono">${escapeHtml(occ)}</span>`);
  const metaHtml = metaParts.length
    ? `<div class="item-meta">${metaParts.map(p => `<span class="meta-pill">${p}</span>`).join("")}</div>`
    : "";

  // “Kısaca:” / “Dikkat:” etiketlerini kaldır: doğrudan cümle olarak yaz.
  const summarySentences = [];
  if (it.why) summarySentences.push(`<p>${escapeHtml(it.why)}</p>`);
  if (it.redLine) summarySentences.push(`<p>${escapeHtml(it.redLine)}</p>`);
  const summaryHtml = summarySentences.length
    ? `<div class="risk-sentences">${summarySentences.join("")}</div>`
    : "";

  const allTemplates = Array.isArray(it.templates) ? it.templates : [];
  const previewTemplates = allTemplates.slice(0, 2);
  const restTemplates = allTemplates.slice(2);

  const askPreviewHtml = previewTemplates.length
    ? `<div class="section"><div class="section-title">Ne isteyebilirsin?</div><ul class="bullets">${previewTemplates.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul></div>`
    : "";

  const askRestHtml = restTemplates.length
    ? `<div class="section"><div class="section-title">Diğer öneriler</div><ul class="bullets">${restTemplates.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul></div>`
    : "";

  const moneyHtml = it.moneyImpact
    ? `<div class="section"><div class="section-title">Parasal etki</div><div class="muted" style="margin-top:4px">${escapeHtml(it.moneyImpact)}</div></div>`
    : "";

  const examplesHtml = (Array.isArray(it.examples) && it.examples.length > 1)
    ? `<div class="muted small" style="margin-top:8px">Diğer örnekler:<br/>${it.examples.slice(1, 4).map(ex => `• ${escapeHtml(ex.clause ? ex.clause + ': ' : '')}${escapeHtml(ex.snippet || '').slice(0, 260)}${(ex.snippet && ex.snippet.length > 260) ? '…' : ''}`).join('<br/>')}</div>`
    : "";

  // Kartı kalabalık göstermemek için: alıntı ve pazarlık metni "buton + açılır panel".
  const quotePanelHtml = `
    <div class="issue-panel hidden" data-panel="quote">
      <div class="kv">
        <div><span class="k">Alıntı:</span> <span>${snippet}</span></div>
      </div>
      ${examplesHtml}
    </div>
  `;

  const negPanelHtml = `
    <div class="issue-panel hidden" data-panel="neg" data-neg-panel="${idEsc}">
      <div class="muted small">Aşağıdaki metni karşı tarafa gönderebilirsin:</div>
      <textarea class="textarea neg-one-text" rows="7" readonly placeholder="Metin hazırlanıyor…"></textarea>
      <div class="item-actions" style="margin-top:10px">
        <button class="btn tiny" data-neg-copy="${idEsc}" type="button">Kopyala</button>
        <button class="btn tiny" data-neg-to-box="${idEsc}" type="button">Üst kutuya aktar</button>
      </div>
    </div>
  `;

  const togglesHtml = `
    <div class="issue-actions">
      <button class="issue-toggle" type="button" data-issue-toggle="quote" data-issue="${idEsc}">Metinden alıntı</button>
      <button class="issue-toggle" type="button" data-issue-toggle="neg" data-issue="${idEsc}">Pazarlık metni</button>
    </div>
  `;

  return `<div class="item" data-issue-id="${idEsc}" data-sev="${escapeHtml(it.severity)}">
    <div class="item-head">
      <div class="item-title">${escapeHtml(it.title)}</div>
      <div class="badge badge-${it.severity}">${sevTr(it.severity)}</div>
    </div>

    ${metaHtml}
    ${summaryHtml}
    ${askPreviewHtml}

    <details class="item-details">
      <summary>Detaylar</summary>
      <div class="details-body">
        ${moneyHtml}
        ${askRestHtml}

        ${togglesHtml}

        <div class="issue-panels">
          ${quotePanelHtml}
          ${negPanelHtml}
        </div>
      </div>
    </details>
  </div>`;
}

function highlightSnippet(snippet, match) {
  const s = escapeHtml(snippet || "");
  const m = (match || "").trim();
  if (!m) return s;
  const escaped = escapeRegExp(m);
  const re = new RegExp(escaped, "i");
  return s.replace(re, (x) => `<mark>${x}</mark>`);
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sevTr(sev) {
  switch (sev) {
    case "CRITICAL": return "KRİTİK";
    case "HIGH": return "YÜKSEK";
    case "MEDIUM": return "ORTA";
    case "LOW": return "DÜŞÜK";
    default: return sev;
  }
}

function chipHtml(kind, id, label, active) {
  return `<button class="chip ${active ? "chip-on" : ""}" data-chip="${kind}" data-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadBillingStatus() {
  if (window.__BILLING_MODE__ !== "credits") {
    if (billingInfo) billingInfo.textContent = "";
    if (creditsPill) creditsPill.classList.add("hidden");
    return;
  }
  try {
    const resp = await fetch("/api/status");
    const data = await resp.json();
    if (!data.ok) return;
    const st = data.status;
    const freeLeft = st.freeLeft ?? 0;
    const credits = st.unlimited ? "Sınırsız" : (st.credits ?? 0);
    if (billingInfo) billingInfo.textContent = `Ücretsiz kalan: ${freeLeft} • Kredi: ${credits}`;

    // Üst barda: sadece kredi sayısını sade bir şekilde göster
    if (creditsPill && creditsCount) {
      creditsPill.classList.remove("hidden");
      if (creditsCount) creditsCount.textContent = st.unlimited ? "∞" : String(st.credits ?? 0);
      creditsPill.setAttribute("title", `Ücretsiz kalan: ${freeLeft} • Kredi: ${st.unlimited ? "Sınırsız" : (st.credits ?? 0)}`);
    }

    // Ödeme sonrası otomatik bildirim (sayfaya dönen kullanıcılar için)
    maybeCompletePendingPayment(st);
    updateLastRestoreUI();
  } catch {}
}




// ---------- Pazarlık Çıktısı ----------

function _cleanTemplate(t) {
  return String(t || "")
    .trim()
    .replace(/[\s\n\r]+/g, " ")
    .replace(/[\.!؟?]+$/g, "");
}

function _rolePrefix(roleId) {
  const r = String(roleId || "genel");
  switch (r) {
    case "hizmet_alan": return "hizmet alan taraf olarak";
    case "hizmet_veren": return "hizmet veren taraf olarak";
    case "kiraci": return "kiracı olarak";
    case "ev_sahibi": return "ev sahibi olarak";
    case "alici": return "alıcı olarak";
    case "satici": return "satıcı olarak";
    default: return "taraf olarak";
  }
}

async function copyTextToClipboard(text) {
  const t = String(text || "").trim();
  if (!t) return false;

  // Modern API (localhost üzerinde genelde çalışır)
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {}

  // Fallback
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}

function _isMoneyUnknown(moneyImpact) {
  const s = String(moneyImpact || "").toLowerCase();
  if (!s.trim()) return true;
  // "Değişken / net hesaplanamadı" gibi ifadeler kullanıcıya fayda sağlamıyor.
  return s.includes("değişken") || s.includes("hesaplanamad") || s.includes("net hesap");
}

function _indentBlock(text, indent) {
  const pad = indent || "  ";
  const lines = String(text || "").split("\n");
  return lines.map((ln, idx) => (idx === 0 ? ln : pad + ln)).join("\n");
}

function buildNegotiationForIssue(it, opts = {}) {
  const includeGreeting = !!opts.includeGreeting;
  const includeClosing = !!opts.includeClosing;

  const title = String(it?.title || "—").trim();
  const clause = it?.clause ? ` (${String(it.clause).trim()})` : "";
  const why = String(it?.why || "Bu madde benim için gereksiz risk oluşturuyor.").trim();

  const rawMoney = String(it?.moneyImpact || "").trim();
  const money = (!rawMoney || _isMoneyUnknown(rawMoney)) ? "" : rawMoney;

  const templates = Array.isArray(it?.templates)
    ? it.templates.map(_cleanTemplate).filter(Boolean)
    : [];

  const asks = (templates.length ? templates.slice(0, 3) : [
    "Bu maddeyi daha net ve dengeli olacak şekilde revize edelim"
  ])
    .map((t) => {
      const s = String(t || "")
        .trim()
        // Şablonlarda bazen liste işaretleri kalıyor; düz metne çeviriyoruz.
        .replace(/^\s*[-*•]\s+/, "");
      if (!s) return "";
      return /[.!?…]$/.test(s) ? s : `${s}.`;
    })
    .filter(Boolean);

  let out = "";
  if (includeGreeting) out += "Merhaba,\n\n";

  // Gönderime hazır, daha doğal bir metin
  out += `Sözleşmedeki “${title}”${clause} maddesi için küçük bir revize rica edeceğim.\n\n`;
  out += `${why}\n`;
  if (money) out += `Bu maddenin tahmini parasal etkisi ${money}.\n`;
  out += `\nUygunsa şu revizeyi rica ediyorum. ${asks.join(" ")}`;

  if (includeClosing) {
    out += "\n\nUygunsa buna göre güncelleyebilir miyiz?\nTeşekkürler.";
  }
  return out.trim();
}

function getFilteredIssues() {
  const issues = (lastAnalysis?.issues || []);
  return issues.filter(it => {
    const okSev = (state.severity === "ALL") || (it.severity === state.severity);
    const okCat = (state.category === "ALL") || (it.category === state.category);
    return okSev && okCat;
  });
}

function buildNegotiationDoc(issues) {
  const arr = Array.isArray(issues) ? issues : [];
  const role = lastAnalysis?.summary?.role || "genel";
  const roleTxt = _rolePrefix(role);

  const intro =
`Merhaba,

Sözleşmeyi ${roleTxt} imza öncesi hızlıca gözden geçirdim. Aşağıdaki maddelerde küçük bir revize/neteştirme rica edeceğim:

`;

  const body = arr.map((it, i) => {
    const block = buildNegotiationForIssue(it);
    const lines = block.split("\n");
    lines[0] = `${i + 1}) ${lines[0]}`;
    return _indentBlock(lines.join("\n"), "   ");
  }).join("\n\n");

  return (intro + (body || "—") + "\n\nUygunsa buna göre güncelleyebilir miyiz?\nTeşekkürler.").trim();
}

function buildNegotiationBox({ force = false } = {}) {
  if (!lastAnalysis || !negText) return;
  if (!force && !negAutoEnabled) return;

  const issues = (negOnlyFiltered && negOnlyFiltered.checked)
    ? getFilteredIssues()
    : (lastAnalysis.issues || []);

  const doc = buildNegotiationDoc(issues);
  negText.value = doc;
  if (btnNegCopy) btnNegCopy.disabled = !String(doc || "").trim();
}

function bindIssueCardActions() {
  if (!issueList) return;

  const allCards = () => Array.from(issueList.querySelectorAll('.item[data-issue-id]'));

  function closeAllPanels() {
    allCards().forEach((card) => {
      card.querySelectorAll('.issue-panel').forEach((p) => p.classList.add('hidden'));
      card.querySelectorAll('.issue-toggle').forEach((b) => b.classList.remove('on'));
    });
  }

  // ---- Kart içi panel butonları (Metinden alıntı / Pazarlık metni) ----
  issueList.querySelectorAll('[data-issue-toggle]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', () => {
      const card = btn.closest('.item[data-issue-id]');
      if (!card) return;

      const which = btn.getAttribute('data-issue-toggle'); // quote | neg
      const panel = card.querySelector(`.issue-panel[data-panel="${which}"]`);
      if (!panel) return;

      const wasOpen = !panel.classList.contains('hidden');

      // Ekran kalabalık olmasın: tek panel açık kalsın
      closeAllPanels();

      // Eğer zaten açıktı, kapatmış olduk
      if (wasOpen) return;

      // Aç
      panel.classList.remove('hidden');
      btn.classList.add('on');

      // Aynı kartta diğer butonu pasif yap
      card.querySelectorAll('.issue-toggle').forEach((b) => {
        if (b !== btn) b.classList.remove('on');
      });

      // Pazarlık metnini ilk açılışta üret
      if (which === 'neg') {
        const id = card.getAttribute('data-issue-id');
        const issue = (lastAnalysis?.issues || []).find((x) => x.id === id);
        if (!issue) return;

        const ta = panel.querySelector('textarea.neg-one-text');
        if (ta && !String(ta.value || '').trim()) {
          ta.value = buildNegotiationForIssue(issue, { includeGreeting: true, includeClosing: true });
        }

        // Açılan paneli görünür tut
        try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
      }
    });
  });

  // ---- Kart içinden kopyalama ----
  issueList.querySelectorAll('[data-neg-copy]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', async () => {
      const card = btn.closest('.item[data-issue-id]');
      const id = btn.getAttribute('data-neg-copy') || card?.getAttribute('data-issue-id');
      if (!id) return;

      const issue = (lastAnalysis?.issues || []).find((x) => x.id === id);
      if (!issue) return;

      const panel = btn.closest('.issue-panel[data-panel="neg"]') || card?.querySelector('.issue-panel[data-panel="neg"]');
      const ta = panel?.querySelector('textarea.neg-one-text');

      let txt = String(ta?.value || '').trim();
      if (!txt) {
        txt = buildNegotiationForIssue(issue, { includeGreeting: true, includeClosing: true });
        if (ta) ta.value = txt;
      }

      const ok = await copyTextToClipboard(txt);
      const old = btn.textContent;
      btn.textContent = ok ? 'Kopyalandı ✅' : 'Kopyalanamadı';
      setTimeout(() => { btn.textContent = old; }, 900);

      if (!ok) {
        window.prompt('Metni kopyalayamadım. Ctrl+C ile kopyala:', txt);
      }
    });
  });

  // ---- Üstteki pazarlık kutusuna aktar ----
  issueList.querySelectorAll('[data-neg-to-box]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', () => {
      const card = btn.closest('.item[data-issue-id]');
      const id = btn.getAttribute('data-neg-to-box') || card?.getAttribute('data-issue-id');
      if (!id) return;

      const issue = (lastAnalysis?.issues || []).find((x) => x.id === id);
      if (!issue) return;

      const panel = btn.closest('.issue-panel[data-panel="neg"]') || card?.querySelector('.issue-panel[data-panel="neg"]');
      const ta = panel?.querySelector('textarea.neg-one-text');

      let txt = String(ta?.value || '').trim();
      if (!txt) {
        txt = buildNegotiationForIssue(issue, { includeGreeting: true, includeClosing: true });
        if (ta) ta.value = txt;
      }

      if (negText) {
        negText.value = txt;
        if (btnNegCopy) btnNegCopy.disabled = false;
        try {
          const box = document.getElementById('negBox');
          box && box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {}
      }
    });
  });
}

btnNegBuild?.addEventListener("click", () => {
  if (!lastAnalysis) { alert("Önce analiz yapmalısın."); return; }
  // Kullanıcı bilinçli olarak yeniden üretmek istedi (auto'yu da tekrar aç)
  negAutoEnabled = true;
  buildNegotiationBox({ force: true });
});

btnNegCopy?.addEventListener("click", async () => {
  const txt = String(negText?.value || "").trim();
  if (!txt) { alert("Kopyalanacak metin yok."); return; }
  const ok = await copyTextToClipboard(txt);
  const old = btnNegCopy.textContent;
  btnNegCopy.textContent = ok ? 'Kopyalandı ✅' : 'Kopyalanamadı';
  setTimeout(() => { btnNegCopy.textContent = old; }, 900);
  if (!ok) window.prompt("Metni kopyalayamadım. Ctrl+C ile kopyala:", txt);
});

btnNegClear?.addEventListener("click", () => {
  if (negText) negText.value = "";
  if (btnNegCopy) btnNegCopy.disabled = true;
  // Kullanıcı temizlediyse otomatik üretimi durdur.
  negAutoEnabled = false;
});

negOnlyFiltered?.addEventListener("change", () => {
  if (!lastAnalysis) return;
  // Kullanıcı tercih değiştirince metni tazele
  negAutoEnabled = true;
  buildNegotiationBox({ force: true });
});

// ---------- Local history ----------
const HISTORY_KEY = "sr_history_pro_v1";
let __historyExpanded = false;

function saveHistory(fileName, summary) {
  const item = {
    at: new Date().toISOString(),
    file: fileName || "-",
    score: summary?.riskScore ?? null,
    level: summary?.riskLevel ?? "-",
    role: summary?.role ?? "genel"
  };
  const arr = loadHistory();
  const next = [item, ...arr].slice(0, 12);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const arr = loadHistory();
  if (!arr.length) {
    historyEl.innerHTML = `<div class="muted small">Geçmiş yok.</div>`;
    return;
  }

  const max = 6;
  const shown = __historyExpanded ? arr : arr.slice(0, max);

  const fmt = (iso) => {
    try {
      return new Date(iso).toLocaleString("tr-TR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "—";
    }
  };

  const pillCls = (score) => {
    const n = Number(score);
    if (!Number.isFinite(n)) return "pill";
    if (n >= 80) return "pill pill-high";
    if (n >= 50) return "pill pill-medium";
    return "pill pill-low";
  };

  const itemsHtml = shown.map(it => {
    const score = (it.score === null || it.score === undefined) ? "-" : `${it.score}/100`;
    const cls = pillCls(it.score);
    const meta = `${fmt(it.at)} • ${escapeHtml(it.level)} • ${escapeHtml(roleLabel(it.role))}`;
    return `<div class="history-item" title="${escapeHtml(it.file)}">
      <div class="history-top">
        <div class="history-file">${escapeHtml(it.file)}</div>
        <div class="${cls}">${score}</div>
      </div>
      <div class="muted small">${meta}</div>
    </div>`;
  }).join("");

  const toggleHtml = (arr.length > max)
    ? `<button class="btn tiny" id="btnHistoryToggle">${__historyExpanded ? "Daha az göster" : "Tümünü göster"}</button>`
    : "";

  historyEl.innerHTML = itemsHtml + (toggleHtml ? `<div style="margin-top:10px">${toggleHtml}</div>` : "");

  const btn = document.getElementById("btnHistoryToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      __historyExpanded = !__historyExpanded;
      renderHistory();
    });
  }
}


// Geçmiş paneli kapalıyken sağ kolonu boşa harcamayalım (daha ferah görünüm)
function bindHistoryLayout() {
  const split = document.querySelector('.split');
  const det = document.querySelector('.history-details');
  if (!split || !det) return;

  const update = () => {
    split.classList.toggle('no-history', !det.open);
  };

  det.addEventListener('toggle', update);
  update();
}

bindHistoryLayout();

renderHistory();
loadBillingStatus();
