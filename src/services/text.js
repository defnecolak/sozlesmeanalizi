function clampText(text, maxChars) {
  const s = (text || "").toString();
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
}
module.exports = { clampText };
