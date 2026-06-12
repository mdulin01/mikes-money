// Builds the compact JSON snapshot the ✨ insight button sends to /api/insight.
// Defensive everywhere — pages share one builder, keyed off the current path.
export function buildInsightContext(pathname, m) {
  const page = (pathname || '/').replace(/^\//, '') || 'dashboard';
  const ctx = {
    page,
    netWorth: Math.round(m.netWorth || 0),
    investmentsTotal: Math.round(m.investmentsTotal || 0),
    currentMonthSpend: Math.round(m.currentMonthSpend || 0),
  };
  const txns = (m.recentTxns || []).slice(0, 40).map((t) => ({
    d: t.date, a: t.amount, n: (t.merchantName || t.name || '').slice(0, 28), c: t.category || null, cl: t.txClass || null,
  }));
  if (['transactions', 'cashflow', 'budgets', 'business', 'tax', 'dashboard'].includes(page)) ctx.transactions = txns;
  if (['holdings', 'allocation', 'retirement', 'checkup', 'dashboard'].includes(page)) {
    ctx.holdings = (m.holdings || []).slice(0, 40).map((h) => ({
      t: h.ticker || h.symbol || (h.name || '').slice(0, 18), v: Math.round(h.value ?? h.institutionValue ?? 0),
    }));
  }
  if (['accounts', 'dashboard', 'checkup'].includes(page)) {
    ctx.accounts = (m.accounts || []).slice(0, 25).map((a) => ({
      n: (a.name || '').slice(0, 24), b: Math.round(a.balance ?? a.currentBalance ?? 0), t: a.type || a.subtype,
    }));
  }
  ctx.netWorthTrend = (m.snapshotHistory || []).slice(-14).map((s) => ({ d: s.id || s.date, nw: Math.round(s.netWorth || 0) }));
  if (page === 'business' && m.data?.business) {
    ctx.business = { invoices: (m.data.business.invoices || []).slice(-8), gmaBalance: m.data.business.gma?.entries?.length || 0 };
  }
  return ctx;
}
