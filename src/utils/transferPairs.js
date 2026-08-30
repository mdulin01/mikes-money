// Structural credit-card-payment detection — the guard descriptor rules can't give.
//
// A payment has two legs: an outflow from a depository (checking/savings) account and,
// a few days later, an inflow on a credit-card account for the same amount. Keyword
// rules catch most descriptors, but banks invent new ones (APPLECARD GSBANK, DISCOVER
// E-PAYMENT…), and one missed leg double-counts spending. Monarch and Empower both
// treat pair-matching as the invariant: expense happens at swipe; the payment is a
// transfer. This finds the pairs so classification can enforce that regardless of text.
//
// Matching: |amounts| equal within $1, dates within 4 days, one depository outflow to
// one credit inflow, greedy by closest date, each leg used at most once.

const WINDOW_DAYS = 4;
const AMOUNT_TOL = 1.0;

function dayNum(dateStr) {
  return Math.floor(new Date(dateStr + 'T12:00:00').getTime() / 86400000);
}

/**
 * @param {Array} txns    transactions ({ id, accountId, amount, date }; Plaid sign: >0 outflow)
 * @param {Object} acctById  accountId -> account ({ type: 'depository' | 'credit' | ... })
 * @returns {Set<string>} ids of BOTH legs of every matched payment pair
 */
export function findTransferPairs(txns, acctById) {
  const pairs = new Set();
  if (!txns?.length || !acctById) return pairs;

  const outs = []; // depository outflows
  const ins = [];  // credit-card inflows
  for (const t of txns) {
    if (!t?.date || !t.id) continue;
    const type = acctById[t.accountId]?.type;
    const amt = t.amount || 0;
    if (type === 'depository' && amt > 0) outs.push(t);
    else if (type === 'credit' && amt < 0) ins.push(t);
  }
  if (!outs.length || !ins.length) return pairs;

  // Bucket credit inflows by rounded amount for near-O(n) matching.
  const byAmt = new Map();
  for (const t of ins) {
    const key = Math.round(-t.amount);
    if (!byAmt.has(key)) byAmt.set(key, []);
    byAmt.get(key).push(t);
  }

  const used = new Set();
  for (const out of outs) {
    const target = out.amount;
    let best = null, bestGap = Infinity;
    for (let key = Math.round(target) - 1; key <= Math.round(target) + 1; key++) {
      for (const cand of byAmt.get(key) || []) {
        if (used.has(cand.id)) continue;
        if (Math.abs(-cand.amount - target) > AMOUNT_TOL) continue;
        const gap = Math.abs(dayNum(cand.date) - dayNum(out.date));
        if (gap <= WINDOW_DAYS && gap < bestGap) { best = cand; bestGap = gap; }
      }
    }
    if (best) {
      used.add(best.id);
      pairs.add(out.id);
      pairs.add(best.id);
    }
  }
  return pairs;
}
