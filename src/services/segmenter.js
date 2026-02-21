/**
 * Very lightweight clause segmentation.
 * It scans line-by-line and creates segments on headings such as:
 * - "MADDE 5 - BAŞLIK"
 * - "5.1 ..."  or "18.2.3 ..."
 */
function segmentText(text) {
  const t = (text || "").toString();
  const lines = t.split(/\r?\n/);

  const segments = [];
  let offset = 0;

  const pushSeg = (start, label, title) => {
    segments.push({ start, end: null, label, title: title || null });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    const trimmed = line.trim();

    const mMadde = /^MADDE\s+(\d+)\s*(?:[-–—:]\s*(.*))?$/i.exec(trimmed);
    const mNum = /^(\d+(?:\.\d+){0,3})\s*(?:[-–—:]\s*(.*))?$/.exec(trimmed);

    if (mMadde) {
      const num = mMadde[1];
      const title = (mMadde[2] || "").trim();
      const label = title ? `Madde ${num} – ${title}` : `Madde ${num}`;
      pushSeg(offset, label, title || null);
    } else if (mNum && trimmed.length <= 120) {
      // avoid catching long lines as headings; keep it lightweight
      const num = mNum[1];
      const title = (mNum[2] || "").trim();
      const label = title ? `Madde ${num} – ${title}` : `Madde ${num}`;
      pushSeg(offset, label, title || null);
    }

    // +1 for newline (approx). If last line no newline, it's fine.
    offset += line.length + 1;
  }

  if (!segments.length) {
    return [{ start: 0, end: t.length, label: "Metin", title: null }];
  }

  // finalize ends
  for (let i = 0; i < segments.length; i++) {
    const cur = segments[i];
    const next = segments[i + 1];
    cur.end = next ? Math.max(cur.start, next.start - 1) : t.length;
  }

  // Ensure first segment starts at 0 for lookup convenience
  if (segments[0].start > 0) {
    segments.unshift({ start: 0, end: segments[0].start - 1, label: "Giriş", title: null });
  }

  return segments;
}

function findSegmentLabel(segments, index) {
  if (!segments || !segments.length) return null;
  // binary search by start
  let lo = 0, hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid];
    if (index < s.start) hi = mid - 1;
    else if (index > s.end) lo = mid + 1;
    else return s.label;
  }
  // fallback to closest
  return segments[Math.max(0, hi)]?.label || null;
}

module.exports = { segmentText, findSegmentLabel };
