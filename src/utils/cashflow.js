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
export function monthFlows(txns, acctById, monthStr) {
  let earned = 0, retirement = 0, refunds = 0, outflow = 0;
  for (const t of txns || []) {
    if (!(t.date || '').startsWith(monthStr)) continue;
    if (t.category === 'transfer') continue;
    const amt = t.amount || 0; // Plaid: <0 inflow, >0 outflow
    if (amt < 0) {
      if (t.category === 'retirement-inc') retirement += -amt;
      else if (acctById?.[t.accountId]?.type === 'credit') refunds += -amt;
      else earned += -amt;
    } else if (amt > 0 && t.category !== 'taxes') {
      outflow += amt;
    }
  }
  const spend = Math.max(0, outflow - refunds);
  const savingsRate = earned > 0 ? (earned - spend) / earned : 0;
  return { earned, retirement, refunds, outflow, spend, savingsRate };
}
