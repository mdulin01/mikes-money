// Date strings are LOCAL time (America/New_York). Never use .toISOString().split('T')[0].

export function toLocalDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toLocalMonthStr(d = new Date()) {
  return toLocalDateStr(d).slice(0, 7); // YYYY-MM
}

export function offsetDateStr(dateStr, offsetDays) {
  const d = new Date(dateStr + 'T12:00:00'); // noon to avoid DST issues
  d.setDate(d.getDate() + offsetDays);
  return toLocalDateStr(d);
}

export function monthStart(monthStr = toLocalMonthStr()) {
  return `${monthStr}-01`;
}

export function monthEnd(monthStr = toLocalMonthStr()) {
  const [y, m] = monthStr.split('-').map(Number);
  const last = new Date(y, m, 0); // day 0 of next month == last day of this month
  return toLocalDateStr(last);
}

export function monthsBetween(fromStr, toStr) {
  const out = [];
  let [y, m] = fromStr.split('-').map(Number);
  const [yEnd, mEnd] = toStr.split('-').map(Number);
  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function humanDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Integer years between birthdate (YYYY-MM-DD) and today, local time.
 * Accounts for whether this year's birthday has passed yet.
 */
export function computeAge(birthdate, today = new Date()) {
  if (!birthdate) return null;
  const [by, bm, bd] = birthdate.split('-').map(Number);
  let age = today.getFullYear() - by;
  const beforeBirthday =
    today.getMonth() + 1 < bm ||
    (today.getMonth() + 1 === bm && today.getDate() < bd);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Fractional age in years (useful for "N.5 years old"). */
export function computeAgeFractional(birthdate, today = new Date()) {
  if (!birthdate) return null;
  const birth = new Date(birthdate + 'T00:00:00');
  const ms = today - birth;
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

// Human "x ago" for freshness indicators (falls back to a short date past a week).
export function relativeTime(ms) {
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Exact local timestamp for tooltips, e.g. "Jun 4, 10:35 AM".
export function exactTime(ms) {
  if (!ms) return 'never';
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
