function looksLikeMojibake(s) {
  return /Ã.|Ä.|Å.|Â./.test(s);
}

function fixMojibake(s) {
  const str = (s || "").toString();
  if (!str) return str;
  if (!looksLikeMojibake(str)) return str;
  try {
    return Buffer.from(str, "latin1").toString("utf8");
  } catch {
    return str;
  }
}

function cleanDisplayName(name) {
  return fixMojibake(name)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

module.exports = { fixMojibake, cleanDisplayName };
