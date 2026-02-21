// Basit tema yöneticisi (light/dark) — hesap gerekmez.
// - localStorage'a kaydeder
// - prefers-color-scheme'i varsayılan olarak dikkate alır
// - <html data-theme="dark|light"> attribute'u üzerinden çalışır

(function () {
  const KEY = "avukatim_theme";

  function getPreferred() {
    try {
      const saved = String(localStorage.getItem(KEY) || "").trim();
      if (saved === "light" || saved === "dark") return saved;
    } catch {}

    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    } catch {}

    return "dark";
  }

  function setTheme(theme) {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(KEY, t); } catch {}

    // theme-color (mobil tarayıcı üst çubuğu) için
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "light" ? "#eef1ff" : "#0b1020");

    updateButtons(t);
  }

  function updateButtons(theme) {
    const btns = Array.from(document.querySelectorAll("#themeToggle"));
    btns.forEach((btn) => {
      // İkon: aktif tema -> diğerine geçişi temsil etsin
      const next = theme === "light" ? "dark" : "light";
      btn.setAttribute("data-next", next);
      btn.setAttribute("aria-label", next === "light" ? "Açık temaya geç" : "Koyu temaya geç");
      // Kullanıcıya küçük bir ipucu (tooltip). Etiket dinamik olsa da tooltip sabit olsun.
      btn.setAttribute("title", "Koyu/Açık tema");

      // Basit, font bağımsız ikonlar
      btn.innerHTML = next === "light" ? "☀" : "🌙";
    });
  }

  function toggle() {
    const cur = document.documentElement.getAttribute("data-theme") || getPreferred();
    setTheme(cur === "light" ? "dark" : "light");
  }

  // DOM hazır olduğunda bağla
  document.addEventListener("DOMContentLoaded", () => {
    // Eğer head içindeki mini script set etmediyse burada set edelim
    const cur = document.documentElement.getAttribute("data-theme") || getPreferred();
    setTheme(cur);

    document.querySelectorAll("#themeToggle").forEach((btn) => {
      btn.addEventListener("click", toggle);
    });
  });
})();
