// Month cash-flow buckets — single source of truth for the Dashboard savings rate.
//
// Why this exists: the old savings rate was (all inflows − all outflows) / all inflows,
// which counted IRA distributions and credit-card refunds as "income". Once monthly IRA
// draws start, that overstates income (a portfolio withdrawal isn't earned income), and
// refunds double-dip (the original purchase counted as spend AND the refund as income).
//
// Buckets:
//   earned     — business + rental + other income inflows (what you actually earned)
//   retirement — 'retirement-inc' inflows (IRA draws; planned income, NOT savings-rate income)
//   refunds    — inflows on credit-card accounts (returns/credits; netted against spend)
//   spend      — outflows excl. transfers + taxes, minus refunds (floored at 0)
//
// savingsRate = (earned − spend) / earned. IRA draws shown separately: when you spend
// from the portfolio your savings rate should FALL, not rise.
// catOf lets callers supply LIVE classification (user rules + built-ins) so
// not-yet-auto-categorized transactions still bucket correctly — a stored-null
// "ONLINE PAYMENT, THANK YOU" must not count as income. Defaults to stored category.
export function monthFlows(txns, acctById, monthStr, catOf = (t) => t.category) {
  let earned = 0, retirement = 0, refunds = 0, outflow = 0;
  for (const t of txns || []) {
    if (!(t.date || '').startsWith(monthStr)) continue;
    const cat = catOf(t);
    if (cat === 'transfer') continue;
    const amt = t.amount || 0; // Plaid: <0 inflow, >0 outflow
    if (amt < 0) {
      if (cat === 'retirement-inc') retirement += -amt;
      else if (acctById?.[t.accountId]?.type === 'credit') refunds += -amt;
      else earned += -amt;
    } else if (amt > 0 && cat !== 'taxes') {
      outflow += amt;
    }
  }
  const spend = Math.max(0, outflow - refunds);
  const savingsRate = earned > 0 ? (earned - spend) / earned : 0;
  return { earned, retirement, refunds, outflow, spend, savingsRate };
}


// ── Multi-month buckets — same recipe as monthFlows, one row per month ────────
// Used by the Cash Flow page so it can never disagree with the Dashboard again.
// Adds a `taxes` bucket (shown as its own segment; still excluded from `spend`).
export function flowsByMonth(txns, acctById, catOf = (t) => t.category) {
  const rows = {};
  for (const t of txns || []) {
    if (!t.date) continue;
    const m = t.date.slice(0, 7);
    if (!rows[m]) rows[m] = { month: m, earned: 0, retirement: 0, refunds: 0, outflow: 0, taxes: 0 };
    const r = rows[m];
    const cat = catOf(t);
    if (cat === 'transfer') continue;
    const amt = t.amount || 0;
    if (amt < 0) {
      if (cat === 'retirement-inc') r.retirement += -amt;
      else if (acctById?.[t.accountId]?.type === 'credit') r.refunds += -amt;
      else r.earned += -amt;
    } else if (amt > 0) {
      if (cat === 'taxes') r.taxes += amt;
      else r.outflow += amt;
    }
  }
  return Object.values(rows)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(r => ({ ...r, spend: Math.max(0, r.outflow - r.refunds) }));
}

// Spend by category for one month (refunds netted against the LARGEST category
// rather than tracked per-category — Plaid refunds rarely carry a category).
export function categorySpend(txns, monthStr, catOf = (t) => t.category) {
  const map = {};
  let refunds = 0;
  for (const t of txns || []) {
    if (!(t.date || '').startsWith(monthStr)) continue;
    const cat = catOf(t);
    if (cat === 'transfer' || cat === 'taxes') continue;
    const amt = t.amount || 0;
    if (amt > 0) map[cat || 'uncategorized'] = (map[cat || 'uncategorized'] || 0) + amt;
    else if (amt < 0) refunds += -amt;
  }
  return { byCategory: map, refunds };
}

// ── Actual withdrawal pace — measured, not planned ────────────────────────────
// Net retirement-inc inflows over the transaction window, annualized by the real
// span covered (so a 5-month window doesn't understate the annual pace), divided
// by investable assets. This is the number the Dashboard tile should show.
export function actualDrawStats(txns, catOf, investmentsTotal) {
  let total = 0, minD = null, maxD = null;
  for (const t of txns || []) {
    if (!t.date) continue;
    if (minD === null || t.date < minD) minD = t.date;
    if (maxD === null || t.date > maxD) maxD = t.date;
    if ((t.amount || 0) < 0 && catOf(t) === 'retirement-inc') total += -(t.amount || 0);
  }
  if (minD === null) return { annual: 0, monthly: 0, rate: null, months: 0 };
  const days = Math.max(30, (new Date(maxD) - new Date(minD)) / 86400000 + 1);
  const months = days / 30.44;
  const annual = total * (365.25 / days);
  return {
    annual,
    monthly: annual / 12,
    months,
    rate: investmentsTotal > 0 ? annual / investmentsTotal : null,
  };
}
