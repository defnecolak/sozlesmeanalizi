const crypto = require("crypto");

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach(part => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

function _appendSetCookie(res, cookieStr) {
  const prev = res.getHeader("Set-Cookie");
  if (!prev) return res.setHeader("Set-Cookie", cookieStr);
  if (Array.isArray(prev)) return res.setHeader("Set-Cookie", prev.concat(cookieStr));
  return res.setHeader("Set-Cookie", [String(prev), cookieStr]);
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || "/"}`);

  // default: 1 year
  const maxAge = (opts.maxAge === 0) ? 0 : (opts.maxAge || 60 * 60 * 24 * 365);
  parts.push(`Max-Age=${maxAge}`);

  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.priority) parts.push(`Priority=${opts.priority}`);

  _appendSetCookie(res, parts.join("; "));
}

function isSecureRequest(req) {
  // Express sets req.secure when behind a trusted proxy
  if (req.secure) return true;
  const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return xfProto === "https";
}

function getOrCreateDeviceId(req, res) {
  const cookies = parseCookies(req);
  let id = cookies.device_id;

  if (!id || id.length < 16) {
    id = crypto.randomUUID();

    // Secure cookie only when HTTPS (or explicitly enabled).
    const forceSecure = String(process.env.COOKIE_SECURE || "").toLowerCase() === "true";
    const secure = forceSecure || isSecureRequest(req);

    // HttpOnly: XSS ile okunmasın. (frontend'in buna ihtiyacı yok)
    setCookie(res, "device_id", id, { secure, httpOnly: true, sameSite: "Lax", priority: "High" });
  }

  return id;
}

module.exports = { parseCookies, setCookie, getOrCreateDeviceId, isSecureRequest };
