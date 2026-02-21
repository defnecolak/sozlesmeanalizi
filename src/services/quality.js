function computeTextQuality(text) {
  const t = (text || "").toString();
  const rawLen = t.length;
  if (rawLen < 200) {
    return { score: 10, label: "Düşük", reasons: ["Metin çok kısa"] };
  }

  const noWs = t.replace(/\s+/g, "");
  const len = Math.max(1, noWs.length);

  const letters = (noWs.match(/[A-Za-zÀ-žĞğİıŞşÇçÖöÜü]/g) || []).length;
  const digits = (noWs.match(/[0-9]/g) || []).length;
  const weird = (noWs.match(/[\uFFFDÃÄÅÂ]/g) || []).length;

  const letterRatio = letters / len;
  const weirdRatio = weird / len;
  const digitRatio = digits / len;

  const words = t.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const avgWord = words.reduce((a, w) => a + w.length, 0) / Math.max(1, words.length);
  const longWordsRatio = words.filter(w => w.length > 25).length / Math.max(1, words.length);

  let score = 80;
  const reasons = [];

  if (letterRatio < 0.55) { score -= 25; reasons.push("Harf oranı düşük (OCR/format kaynaklı olabilir)"); }
  if (weirdRatio > 0.01) { score -= 25; reasons.push("Bozuk karakter oranı yüksek"); }
  if (avgWord < 3.2) { score -= 10; reasons.push("Kelime yapısı zayıf"); }
  if (longWordsRatio > 0.05) { score -= 10; reasons.push("Aşırı uzun kelime oranı yüksek (OCR hatası olabilir)"); }
  if (digitRatio > 0.35) { score -= 5; reasons.push("Sayı yoğunluğu yüksek"); }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let label = "Yüksek";
  if (score < 45) label = "Düşük";
  else if (score < 70) label = "Orta";

  return { score, label, reasons };
}

module.exports = { computeTextQuality };
