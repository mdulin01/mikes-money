const USD = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const USDCents = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function money(n, { cents = false } = {}) {
  if (n == null || Number.isNaN(n)) return '—';
  return (cents ? USDCents : USD).format(n);
}

export function signedMoney(n, opts) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n > 0) return `+${money(n, opts)}`;
  return money(n, opts);
}

export function pct(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

// Negative numbers render red, positive render green; zero is muted.
export function pnlClass(n) {
  if (n > 0) return 'text-emerald-400';
  if (n < 0) return 'text-rose-400';
  return 'text-slate-400';
}
