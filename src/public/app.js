const $ = (id) => document.getElementById(id);

// CSRF (double-submit cookie) header'ı için cookie okuma helper'ı
function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^|; )" + name.replace(/[.$?*|{}()\[\]\\/+^-]/g, "\\$&") + "=([^;]*)"));
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
const sensitivitySelect = $("sensitivity");
const fileInfo = $("fileInfo");
const billingInfo = $("billingInfo");
const roleHelpEl = $("roleHelp");
const packHelpEl = $("packHelp");
const sensitivityHelpEl = $("sensitivityHelp");
const packExamplesEl = $("packExamples");

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

// Doğruluk / tutarlılık alanı
const correctnessBox = $("correctnessBox");
const correctnessBadge = $("correctnessBadge");
const correctnessText = $("correctnessText");
const correctnessList = $("correctnessList");

const reviewBox = $("reviewBox");
const reviewBadge = $("reviewBadge");
const reviewText = $("reviewText");
const reviewList = $("reviewList");

const mitigationBox = $("mitigationBox");
const mitigationBadge = $("mitigationBadge");
const mitigationText = $("mitigationText");
const mitigationList = $("mitigationList");

const marketBox = $("marketBox");
const marketBadge = $("marketBadge");
const marketText = $("marketText");
const marketList = $("marketList");
const marketCaveats = $("marketCaveats");

const actionPlanBox = $("actionPlanBox");
const actionPlanBadge = $("actionPlanBadge");
const actionPlanText = $("actionPlanText");
const actionPlanMust = $("actionPlanMust");
const actionPlanClarify = $("actionPlanClarify");
const actionPlanGood = $("actionPlanGood");

const decisionBox = $("decisionBox");
const decisionBadge = $("decisionBadge");
const decisionText = $("decisionText");
const decisionReasons = $("decisionReasons");
const decisionNext = $("decisionNext");

const subscoresBox = $("subscoresBox");
const subscoresGrid = $("subscoresGrid");

const redlineBox = $("redlineBox");
const redlineList = $("redlineList");

const whatIfBox = $("whatIfBox");
const whatIfList = $("whatIfList");

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
const simTitle = $("simTitle");
const simSummary = $("simSummary");
const simControls = $("simControls");
const simScenarioBoxes = $("simScenarioBoxes");
const simNote = $("simNote");
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
const APP_META = (window.APP_META && typeof window.APP_META === "object") ? window.APP_META : {};
const ROLE_HELPERS = (APP_META.roleHelpers && typeof APP_META.roleHelpers === "object") ? APP_META.roleHelpers : {};
const PACK_HELPERS = (APP_META.packHelpers && typeof APP_META.packHelpers === "object") ? APP_META.packHelpers : {};
const PACK_EXAMPLES = (APP_META.packExamples && typeof APP_META.packExamples === "object") ? APP_META.packExamples : {};
const PACK_LABELS = (APP_META.packLabels && typeof APP_META.packLabels === "object") ? APP_META.packLabels : {};
const SENSITIVITY_HELPERS = (APP_META.sensitivityHelpers && typeof APP_META.sensitivityHelpers === "object") ? APP_META.sensitivityHelpers : {};
const SENSITIVITY_LABELS = (APP_META.sensitivityLabels && typeof APP_META.sensitivityLabels === "object") ? APP_META.sensitivityLabels : {};

function syncOptionHints() {
  const roleId = String(roleSelect?.value || "genel");
  const packId = String(packSelect?.value || "genel");
  const sensitivityId = String(sensitivitySelect?.value || "dengeli");

  if (roleHelpEl) roleHelpEl.textContent = ROLE_HELPERS[roleId] || ROLE_HELPERS.genel || "";
  if (packHelpEl) packHelpEl.textContent = PACK_HELPERS[packId] || PACK_HELPERS.genel || "";
  if (sensitivityHelpEl) sensitivityHelpEl.textContent = SENSITIVITY_HELPERS[sensitivityId] || SENSITIVITY_HELPERS.dengeli || "";

  if (packExamplesEl) {
    const examples = Array.isArray(PACK_EXAMPLES[packId]) ? PACK_EXAMPLES[packId] : (Array.isArray(PACK_EXAMPLES.genel) ? PACK_EXAMPLES.genel : []);
    packExamplesEl.textContent = examples.length ? `Örnekler: ${examples.join(", ")}` : "";
  }
}

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

roleSelect?.addEventListener("change", syncOptionHints);
packSelect?.addEventListener("change", syncOptionHints);
sensitivitySelect?.addEventListener("change", syncOptionHints);

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
      body: JSON.stringify({ role, pack, sensitivity: sensitivitySelect?.value || "dengeli" })
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
    fd.append("sensitivity", sensitivitySelect?.value || "dengeli");

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
  const market = simulation?.market || null;
  const hasEvent = !!ev?.available;

  if (!hasEvent) {
    simCard.classList.add("hidden");
    return;
  }

  simCard.classList.remove("hidden");

  if (simTitle) simTitle.textContent = "Maliyet / Piyasa Kontrolü";
  if (simControls) simControls.style.display = "grid";
  if (simScenarioBoxes) simScenarioBoxes.style.display = "grid";
  if (simNote) {
    simNote.textContent = "Not: Bu bölüm sözleşmeden otomatik çıkarım yapar ve yaklaşık değerler üretir. Kesin rakamlar için sözleşme metnini ve yazışmaları esas alın.";
  }

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
  const refund = (fee != null) ? Math.max(0, (paid ?? 0) - fee) : null;

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
	        <div><b>Bu tarihe kadar ödenmiş:</b> ${formatMoney(paid, currency)}</div>
	        ${refund && refund > 0
	          ? `<div><b>Muhtemel iade:</b> ${formatMoney(refund, currency)}</div>`
	          : `<div><b>Ek ödenecek (muhtemel):</b> ${formatMoney(addl, currency)}</div>`
	        }
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
	      const minPay = Number(ev.total || 0);
	      const estTotal = (minPay > 0) ? (minPay + extraCost) : 0;
	      const underMinNote = (Number.isFinite(actual) && Number.isFinite(guarantee) && actual < guarantee)
	        ? " Garanti kişi sayısından az olsa bile genelde minimum ödeme garanti sayısıdır."
	        : "";
      guestResult.innerHTML = `
	        <div>
	          <b>Garanti:</b> ${Number.isFinite(guarantee) ? guarantee : 0}
	          <span class="muted">•</span>
	          <b>Seçili kişi:</b> ${Number.isFinite(actual) ? actual : 0}
	        </div>
	        ${perPerson > 0 ? `<div><b>Kişi başı (yaklaşık):</b> ${formatMoney(perPerson, currency)}</div>` : ""}
	        <div><b>Ek kişi:</b> ${extra}</div>
	        <div><b>Ek maliyet (yaklaşık):</b> ${formatMoney(extraCost, currency)}</div>
	        ${minPay > 0 ? `<div><b>Minimum ödeme (garanti):</b> ${formatMoney(minPay, currency)}</div>` : ""}
	        ${estTotal > 0 ? `<div><b>Tahmini toplam:</b> ${formatMoney(estTotal, currency)}</div>` : ""}
	        <div class="muted small" style="margin-top:6px">
	          Not: Sözleşmede belli bir artışın üzerindeki talepleri karşılamama hakkı olabilir; kapasite/operasyon şartlarına bağlıdır.${underMinNote}
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
  const key = String(pack || "genel");
  if (PACK_LABELS[key]) return PACK_LABELS[key];
  switch (key) {
    case "genel": return "Genel";
    case "satis": return "Satış / Alım";
    case "kira": return "Kira";
    case "hizmet": return "Hizmet / Serbest Çalışma";
    case "is": return "İş Sözleşmesi";
    case "gizlilik": return "Gizlilik / NDA";
    case "saas": return "SaaS / Yazılım Aboneliği";
    case "etkinlik": return "Düğün / Etkinlik";
    case "influencer": return "Influencer Anlaşması";
    case "kredi": return "Kredi / Borç";
    case "egitim": return "Eğitim / Kurs";
    case "abonelik": return "Abonelik / Taahhüt";
    case "arac": return "Araç Kiralama";
    case "seyahat": return "Seyahat / Tur / Otel";
    case "sigorta": return "Sigorta / Poliçe";
    default: return key || "Genel";
  }
}

function renderCorrectness(summary) {
  const c = summary?.correctness || null;
  if (!correctnessBox || !correctnessBadge || !correctnessText || !correctnessList) return;

  if (!c) {
    correctnessBox.classList.add("hidden");
    correctnessText.textContent = "";
    correctnessList.innerHTML = "";
    return;
  }

  correctnessBox.classList.remove("hidden");
  correctnessBadge.textContent = c.status || "KONTROL ET";
  correctnessBadge.className = pillColorClass(c.color || "medium");
  correctnessText.textContent = c.message || "";

  const items = Array.isArray(c.items) ? c.items : [];
  if (!items.length) {
    correctnessList.innerHTML = "";
  } else {
    correctnessList.innerHTML = items.slice(0, 5).map((it) => {
      const why = it?.why ? `<span class="muted small">${escapeHtml(String(it.why))}</span>` : "";
      return `<li><strong>${escapeHtml(String(it.title || ""))}</strong>${why ? `<br>${why}` : ""}</li>`;
    }).join("");
  }
}

function renderMitigations(summary, analysis) {
  const m = summary?.mitigationSummary || analysis?.mitigation || null;
  if (!mitigationBox || !mitigationBadge || !mitigationText || !mitigationList) return;
  const items = Array.isArray(m?.items) ? m.items : [];
  const reasons = Array.isArray(m?.reasons) ? m.reasons : [];
  const points = Number(m?.points || analysis?.mitigation?.points || 0);
  if (!points && !items.length && !reasons.length) {
    mitigationBox.classList.add("hidden");
    mitigationText.textContent = "";
    mitigationList.innerHTML = "";
    return;
  }
  mitigationBox.classList.remove("hidden");
  mitigationBadge.textContent = m.status || "DENGE VAR";
  mitigationBadge.className = pillColorClass(m.color || "low");
  const baseText = m.message || "Metinde bazı dengeleyici hükümler görüldü.";
  mitigationText.textContent = points > 0 ? `${baseText} (Skoru yumuşatan yaklaşık etki: -${points.toFixed(1)} puan)` : baseText;
  const lines = items.length
    ? items.map((it) => `<li>${escapeHtml(String(it.title || ""))}</li>`)
    : reasons.slice(0, 5).map((x) => `<li>${escapeHtml(String(x || ""))}</li>`);
  mitigationList.innerHTML = lines.join("");
}

function renderMarketReview(review) {
  if (!marketBox || !marketBadge || !marketText || !marketList || !marketCaveats) return;
  if (!review || !review.available) {
    marketBox.classList.add("hidden");
    marketText.textContent = "";
    marketList.innerHTML = "";
    marketCaveats.innerHTML = "";
    return;
  }
  marketBox.classList.remove("hidden");
  marketBadge.textContent = review.status || "KONTROL ET";
  marketBadge.className = pillColorClass(review.color || "medium");
  marketText.textContent = review.summary || "";
  const checks = Array.isArray(review.checks) ? review.checks : [];
  marketList.innerHTML = checks.slice(0, 8).map((c) => {
    const verdict = c?.verdict ? ` <span class="muted small">(${escapeHtml(String(c.verdict))})</span>` : "";
    const detail = c?.detail ? `<div class="muted small">${escapeHtml(String(c.detail))}</div>` : "";
    return `<li><strong>${escapeHtml(String(c.label || ""))}:</strong> ${escapeHtml(String(c.value || ""))}${verdict}${detail}</li>`;
  }).join("");
  const cave = Array.isArray(review.caveats) ? review.caveats : [];
  marketCaveats.innerHTML = cave.length ? `<b>Not:</b><br>${cave.map((x) => `• ${escapeHtml(String(x || ""))}`).join("<br>")}` : "";
}

function renderActionPlan(summary) {
  const plan = summary?.actionPlan || null;
  if (!actionPlanBox || !actionPlanBadge || !actionPlanText || !actionPlanMust || !actionPlanClarify || !actionPlanGood) return;
  if (!plan) {
    actionPlanBox.classList.add("hidden");
    actionPlanText.textContent = "";
    actionPlanMust.innerHTML = "";
    actionPlanClarify.innerHTML = "";
    actionPlanGood.innerHTML = "";
    return;
  }
  actionPlanBox.classList.remove("hidden");
  actionPlanBadge.textContent = plan.status || "KONTROL ET";
  actionPlanBadge.className = pillColorClass(plan.color || "medium");
  actionPlanText.textContent = plan.summary || "";
  const renderList = (arr, empty) => (Array.isArray(arr) && arr.length)
    ? arr.map((x) => `<li>${escapeHtml(String(x || ""))}</li>`).join("")
    : `<li class="muted small">${escapeHtml(empty)}</li>`;
  actionPlanMust.innerHTML = renderList(plan.mustFix, "Şu an acil düzeltme listesi görünmüyor.");
  actionPlanClarify.innerHTML = renderList(plan.shouldClarify, "Netleştirilmesi gereken ek başlık görünmüyor.");
  actionPlanGood.innerHTML = renderList(plan.goodSignals, "Belirgin dengeleyici sinyal görünmüyor.");
}

function renderDecision(summary) {
  const d = summary?.decision || null;
  if (!decisionBox || !decisionBadge || !decisionText || !decisionReasons || !decisionNext) return;
  if (!d) {
    decisionBox.classList.add('hidden');
    decisionText.textContent = '';
    decisionReasons.innerHTML = '';
    decisionNext.innerHTML = '';
    return;
  }
  decisionBox.classList.remove('hidden');
  decisionBadge.textContent = d.status || 'KONTROL ET';
  decisionBadge.className = pillColorClass(d.color || 'medium');
  decisionText.textContent = d.summary || '';
  const renderList = (arr, empty) => (Array.isArray(arr) && arr.length)
    ? arr.map((x) => `<li>${escapeHtml(String(x || ''))}</li>`).join('')
    : `<li class="muted small">${escapeHtml(empty)}</li>`;
  decisionReasons.innerHTML = renderList(d.reasons, 'Belirgin gerekçe görünmüyor.');
  decisionNext.innerHTML = renderList(d.nextSteps, 'Ek adım görünmüyor.');
}

function renderSubscores(summary) {
  const items = Array.isArray(summary?.subScores) ? summary.subScores : [];
  if (!subscoresBox || !subscoresGrid) return;
  if (!items.length) {
    subscoresBox.classList.add('hidden');
    subscoresGrid.innerHTML = '';
    return;
  }
  subscoresBox.classList.remove('hidden');
  subscoresGrid.innerHTML = items.map((it) => {
    const score = Number(it.score || 0);
    const band = score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';
    return `
      <div class="subscore-card">
        <div class="subscore-head">
          <div class="subscore-title">${escapeHtml(String(it.label || ''))}</div>
          <div class="badge badge-${band === 'high' ? 'HIGH' : band === 'medium' ? 'MEDIUM' : 'LOW'}">${score}/100</div>
        </div>
        <div class="subscore-meter"><span class="subscore-fill subscore-${band}" style="width:${Math.max(4, Math.min(100, score))}%"></span></div>
        <div class="muted small">${escapeHtml(String(it.summary || ''))}</div>
      </div>
    `;
  }).join('');
}

function renderRedlinePlaybook(analysis) {
  const items = Array.isArray(analysis?.redlinePlaybook) ? analysis.redlinePlaybook : [];
  if (!redlineBox || !redlineList) return;
  if (!items.length) {
    redlineBox.classList.add('hidden');
    redlineList.innerHTML = '';
    return;
  }
  redlineBox.classList.remove('hidden');
  redlineList.innerHTML = items.map((it) => `
    <div class="redline-card">
      <div class="item-head">
        <div class="item-title">${escapeHtml(String(it.clause || 'İlgili madde'))}</div>
        <div class="badge badge-${escapeHtml(String(it.severity || 'LOW'))}">${sevTr(String(it.severity || 'LOW'))}</div>
      </div>
      <div class="muted small"><strong>${escapeHtml(String(it.title || ''))}</strong></div>
      ${it.reason ? `<div class="muted" style="margin-top:6px">${escapeHtml(String(it.reason || ''))}</div>` : ''}
      ${it.moneyImpact ? `<div class="muted small" style="margin-top:6px"><b>Parasal etki:</b> ${escapeHtml(String(it.moneyImpact || ''))}</div>` : ''}
      <div class="section" style="margin-top:10px"><div class="section-title">Karşı tarafa ne iste</div><div>${escapeHtml(String(it.ask || ''))}</div></div>
      <div class="section" style="margin-top:8px"><div class="section-title">İdeal madde mantığı</div><div>${escapeHtml(String(it.idealClause || ''))}</div></div>
    </div>
  `).join('');
}

function renderWhatIf(analysis) {
  const items = Array.isArray(analysis?.whatIf?.items) ? analysis.whatIf.items : [];
  if (!whatIfBox || !whatIfList) return;
  if (!items.length) {
    whatIfBox.classList.add('hidden');
    whatIfList.innerHTML = '';
    return;
  }
  whatIfBox.classList.remove('hidden');
  whatIfList.innerHTML = items.map((it) => `
    <div class="redline-card">
      <div class="item-title">${escapeHtml(String(it.title || ''))}</div>
      <div style="margin-top:8px">${escapeHtml(String(it.outcome || ''))}</div>
      ${it.impact ? `<div class="meta-pill" style="margin-top:8px">${escapeHtml(String(it.impact || ''))}</div>` : ''}
      ${it.why ? `<div class="muted small" style="margin-top:8px">${escapeHtml(String(it.why || ''))}</div>` : ''}
    </div>
  `).join('');
}

// ── İçerik İyileştirmeleri Render ────────────────────────────────────

function renderContentEnhancements(analysis) {
  const ce = analysis?.contentEnhancements;
  if (!ce) return;

  // Yönetici Özeti
  const execBox = $("executiveSummaryBox");
  const execContent = $("executiveSummaryContent");
  const execBadge = $("execStatusBadge");
  const exec = ce.executiveSummary;
  if (execBox && execContent && exec && exec.available) {
    execBox.classList.remove('hidden');
    if (execBadge) {
      execBadge.textContent = exec.status || '—';
      execBadge.className = `pill pill-${exec.statusColor || 'medium'}`;
    }
    execContent.innerHTML = `
      <div style="margin-top:8px"><strong>${escapeHtml(exec.overview || '')}</strong></div>
      <div style="margin-top:8px">${escapeHtml(exec.action || '')}</div>
      ${exec.topThree ? `<div class="muted small" style="margin-top:8px">${escapeHtml(exec.topThree)}</div>` : ''}
      ${exec.comparison ? `<div class="muted small" style="margin-top:6px">${escapeHtml(exec.comparison)}</div>` : ''}
      ${exec.sectorFlags ? `<div class="muted small" style="margin-top:4px">${escapeHtml(exec.sectorFlags)}</div>` : ''}
      ${exec.ratioWarning ? `<div style="margin-top:6px;color:#c0392b;font-weight:600;font-size:0.9em">${escapeHtml(exec.ratioWarning)}</div>` : ''}
    `;
  } else if (execBox) {
    execBox.classList.add('hidden');
  }

  // Oran Analizi
  const ratioBox = $("ratioAnalysisBox");
  const ratioList = $("ratioAnalysisList");
  const ratioItems = Array.isArray(ce.ratioAnalysis?.items) ? ce.ratioAnalysis.items : [];
  if (ratioBox && ratioList) {
    if (!ratioItems.length) { ratioBox.classList.add('hidden'); ratioList.innerHTML = ''; }
    else {
      ratioBox.classList.remove('hidden');
      ratioList.innerHTML = ratioItems.map((it) => `
        <div class="redline-card">
          <div class="item-title">${escapeHtml(it.title || '')}: <span class="badge badge-${(it.color || 'low').toUpperCase()}">${escapeHtml(it.value || '')}</span></div>
          <div style="margin-top:6px">${escapeHtml(it.detail || '')}</div>
          ${it.benchmark ? `<div class="muted small" style="margin-top:4px">${escapeHtml(it.benchmark)}</div>` : ''}
        </div>
      `).join('');
    }
  }

  // Sektöre Özel Bayraklar
  const flagBox = $("sectorRedFlagsBox");
  const flagList = $("sectorRedFlagsList");
  const flags = Array.isArray(ce.sectorRedFlags?.items) ? ce.sectorRedFlags.items : [];
  if (flagBox && flagList) {
    if (!flags.length) { flagBox.classList.add('hidden'); flagList.innerHTML = ''; }
    else {
      flagBox.classList.remove('hidden');
      flagList.innerHTML = flags.map((it) => `
        <div class="redline-card">
          <div class="item-title">${escapeHtml(it.title || '')}</div>
          <div style="margin-top:6px">${escapeHtml(it.detail || '')}</div>
          <div style="margin-top:6px;color:#27ae60;font-weight:600">Öneri: ${escapeHtml(it.suggestion || '')}</div>
        </div>
      `).join('');
    }
  }

  // Karşılaştırmalı İstatistik
  const compBox = $("comparativeStatsBox");
  const compContent = $("comparativeStatsContent");
  const comp = ce.comparativeStats;
  if (compBox && compContent && comp && comp.available) {
    compBox.classList.remove('hidden');
    const prevHtml = Array.isArray(comp.prevalence) && comp.prevalence.length
      ? `<div style="margin-top:10px"><strong>Piyasa Yaygınlığı:</strong></div>` +
        comp.prevalence.slice(0, 6).map(p => `<div class="muted small" style="margin:4px 0">• <strong>${escapeHtml(p.title)}</strong>: ${escapeHtml(p.label)}</div>`).join('')
      : '';
    compContent.innerHTML = `
      <div style="margin-top:8px">${escapeHtml(comp.summary || '')}</div>
      ${prevHtml}
    `;
  } else if (compBox) {
    compBox.classList.add('hidden');
  }

  // Yeniden Yazım Önerileri
  const rwBox = $("rewriteSuggestionsBox");
  const rwList = $("rewriteSuggestionsList");
  const rewrites = Array.isArray(ce.rewriteSuggestions?.items) ? ce.rewriteSuggestions.items : [];
  if (rwBox && rwList) {
    if (!rewrites.length) { rwBox.classList.add('hidden'); rwList.innerHTML = ''; }
    else {
      rwBox.classList.remove('hidden');
      rwList.innerHTML = rewrites.slice(0, 5).map((it) => `
        <div class="redline-card">
          <div class="item-title">${escapeHtml(it.title || '')} <span class="badge badge-${(it.severity || 'MEDIUM')}">${sevTr(it.severity || '')}</span></div>
          <div style="margin-top:8px;padding:8px;background:#ffeaea;border-radius:6px">
            <div style="font-weight:600;color:#c0392b;font-size:0.85em">Mevcut (sorunlu):</div>
            <div style="font-size:0.9em;margin-top:4px">${escapeHtml(it.before || '')}</div>
          </div>
          <div style="margin-top:8px;padding:8px;background:#e8f8e8;border-radius:6px">
            <div style="font-weight:600;color:#27ae60;font-size:0.85em">Önerilen (dengeli):</div>
            <div style="font-size:0.9em;margin-top:4px">${escapeHtml(it.after || '')}</div>
          </div>
          <div style="margin-top:6px;font-size:0.85em"><strong>Kilit fark:</strong> ${escapeHtml(it.key || '')}</div>
        </div>
      `).join('');
    }
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
    const sensitivityLabel = SENSITIVITY_LABELS[String(s.sensitivity || "dengeli")] || String(s.sensitivity || "dengeli");
    metaLine.textContent = `Analiz: ${new Date(m.analyzedAt).toLocaleString()} • Rol: ${roleLabel(s.role)} • Tür: ${packLabel(s.pack)} • Hassasiyet: ${sensitivityLabel}`;
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

  renderCorrectness(s);
  renderDecision(s);
  renderSubscores(s);
  renderMitigations(s, analysis);
  renderActionPlan(s);
  renderMarketReview(analysis.marketReview || analysis.simulation?.market || null);
  renderScoreExplain(s);
  renderRedlinePlaybook(analysis);
  renderWhatIf(analysis);
  renderContentEnhancements(analysis);

  renderTop3(analysis.topRisks || []);
  renderFilters(s);
  applyFilters();
  renderSoft(analysis.softWarnings || []);
  renderSimulation({ ...(analysis.simulation || {}), market: analysis.marketReview || analysis.simulation?.market || null });

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
      <button class="issue-toggle" type="button" data-issue-toggle="neg" data-issue="${idEsc}">Revize metni</button>
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
    case "INFO": return "BİLGİ";
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




// ---------- Revize Talep Metni ----------

async function copyTextToClipboard(text) {
  const t = String(text || "").trim();
  if (!t) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {}

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

function _buildIssueNegotiation(it, opts = {}) {
  if (window.NegotiationCopy && typeof window.NegotiationCopy.buildIssueText === "function") {
    return window.NegotiationCopy.buildIssueText(it, {
      role: lastAnalysis?.summary?.role || "genel",
      pack: lastAnalysis?.summary?.pack || "genel",
      includeGreeting: !!opts.includeGreeting,
      includeClosing: !!opts.includeClosing,
      sensitivity: lastAnalysis?.summary?.sensitivity || "dengeli",
      counterpartyContext: lastAnalysis?.summary?.counterpartyContext || lastAnalysis?.counterpartyContext || null,
    });
  }
  return String(it?.why || "").trim();
}

function buildNegotiationForIssue(it, opts = {}) {
  return _buildIssueNegotiation(it, opts);
}

function buildNegotiationDoc(issues) {
  const arr = Array.isArray(issues) ? issues : [];
  if (window.NegotiationCopy && typeof window.NegotiationCopy.buildDoc === "function") {
    return window.NegotiationCopy.buildDoc(arr, {
      role: lastAnalysis?.summary?.role || "genel",
      pack: lastAnalysis?.summary?.pack || "genel",
      sensitivity: lastAnalysis?.summary?.sensitivity || "dengeli",
      counterpartyContext: lastAnalysis?.summary?.counterpartyContext || lastAnalysis?.counterpartyContext || null,
    });
  }
  return arr
    .map((it) => _buildIssueNegotiation(it, { includeGreeting: false, includeClosing: false }))
    .filter(Boolean)
    .join("\n\n");
}


function buildNegotiationBox(opts = {}) {
  if (!negText) return;

  const force = !!opts.force;
  if (!force && !negAutoEnabled) return;

  if (!lastAnalysis) {
    negText.value = "";
    if (btnNegCopy) btnNegCopy.disabled = true;
    return;
  }

  const issues = (negOnlyFiltered && negOnlyFiltered.checked)
    ? getFilteredIssues()
    : (lastAnalysis?.issues || []);

  const txt = String(buildNegotiationDoc(issues) || "").trim();
  negText.value = txt;
  if (btnNegCopy) btnNegCopy.disabled = !txt;
}

function getFilteredIssues() {
  const issues = lastAnalysis?.issues || [];
  return issues.filter((it) => {
    const okSev = state.severity === "ALL" || it.severity === state.severity;
    const okCat = state.category === "ALL" || it.category === state.category;
    return okSev && okCat;
  });
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


// İlk yüklemede seçim ipuçlarını doldur
syncOptionHints();
