/* Ödeme sayfası (iyzico) - izolasyon için ayrı route */

function $(id) {
  return document.getElementById(id);
}

const LS_LAST_RESTORE = "avukatim_last_restore_token";

function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => t.classList.add("hidden"), 4200);
}

function getNonce() {
  return window.__CSP_NONCE__ || "";
}

function setInnerHTMLWithScripts(el, html) {
  // iyzico checkoutFormContent script tag'leri içeriyor.
  // CSP nonce ile tekrar ekleyerek çalıştırıyoruz.
  el.innerHTML = html;
  const scripts = Array.from(el.querySelectorAll("script"));
  scripts.forEach((oldScript) => {
    const newScript = document.createElement("script");
    const nonce = getNonce();
    if (nonce) newScript.setAttribute("nonce", nonce);
    Array.from(oldScript.attributes).forEach((attr) => {
      if (attr.name === "nonce") return;
      newScript.setAttribute(attr.name, attr.value);
    });
    newScript.text = oldScript.text;
    oldScript.parentNode.replaceChild(newScript, oldScript);
  });
}

function formatMoney(price, currency) {
  try {
    const n = Number(price);
    if (!Number.isFinite(n)) return "";
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(n);
  } catch {
    return `${price} ${currency || "TRY"}`;
  }
}

function getPacks() {
  return Array.isArray(window.__PAY_PACKS__) ? window.__PAY_PACKS__ : [];
}

function populatePacks() {
  const sel = $("payCredits");
  if (!sel) return;
  const packs = getPacks();
  const pre = Number(window.__PRESELECT_CREDITS__ || 0);

  sel.innerHTML = "";
  packs.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = String(p.credits);
    opt.textContent = p.label;
    if (pre && Number(p.credits) === pre) opt.selected = true;
    sel.appendChild(opt);
  });

  if (!packs.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Paket bulunamadı";
    sel.appendChild(opt);
    sel.disabled = true;
  }
}

function updatePriceHint() {
  const sel = $("payCredits");
  const box = $("payPrice");
  if (!sel || !box) return;
  const credits = Number(sel.value || 0);
  const p = getPacks().find((x) => Number(x.credits) === credits);
  if (!p) {
    box.textContent = "";
    return;
  }
  box.textContent = `${p.credits} kredi · ${formatMoney(p.price, p.currency)}`;
}

function showRestore(token) {
  const rb = $("restoreBox");
  const rt = $("restoreToken");
  if (!rb || !rt) return;
  rt.textContent = token || "—";
  rb.classList.remove("hidden");
}

async function startPayment() {
  const sel = $("payCredits");
  const email = $("payEmail");
  const fullName = $("payFullName");
  const checkout = $("checkout");
  const btn = $("btnStartPay");

  const credits = Number(sel?.value || 0);
  if (!credits) {
    showToast("Lütfen bir paket seç.");
    return;
  }
  const em = String(email?.value || "").trim();
  if (!em || !em.includes("@")) {
    showToast("Geçerli bir e-posta gir.");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Hazırlanıyor…";
  }
  if (checkout) checkout.innerHTML = "";

  try {
    const res = await fetch("/api/iyzico/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credits,
        email: em,
        fullName: String(fullName?.value || "").trim()
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      showToast(data?.error || "Ödeme başlatılamadı.");
      return;
    }

    if (data.restoreToken) {
      try { localStorage.setItem(LS_LAST_RESTORE, data.restoreToken); } catch {}
      showRestore(data.restoreToken);
    }

    if (checkout && data.checkoutFormContent) {
      setInnerHTMLWithScripts(checkout, data.checkoutFormContent);
      showToast("Ödeme formu yüklendi.");
    } else {
      showToast("Ödeme formu alınamadı.");
    }
  } catch (e) {
    showToast("Ağ hatası. Tekrar dene.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Ödemeyi Başlat";
    }
  }
}

function wire() {
  populatePacks();
  updatePriceHint();

  const sel = $("payCredits");
  if (sel) sel.addEventListener("change", updatePriceHint);

  const btn = $("btnStartPay");
  if (btn) btn.addEventListener("click", startPayment);

  const copy = $("btnCopyRestore");
  if (copy) {
    copy.addEventListener("click", async () => {
      const token = $("restoreToken")?.textContent || "";
      if (!token || token === "—") return;
      try {
        await navigator.clipboard.writeText(token);
        showToast("Restore token kopyalandı.");
      } catch {
        showToast("Kopyalanamadı.");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", wire);
