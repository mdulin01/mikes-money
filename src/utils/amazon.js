// Match a Plaid transaction to a parsed Amazon order (written into `amazonOrders`
// by mikeslife /api/cron-amazon): merchant looks like Amazon + total within a cent
// + order date within 6 days. Returns the best (closest-dated) order or null.
export function matchAmazonOrder(t, orders) {
  if (!orders || !orders.length) return null;
  if (!/amazon|amzn/i.test(`${t.merchantName || ''} ${t.name || ''}`)) return null;
  const amt = Math.abs(t.amount);
  const td = new Date((t.date || '') + 'T12:00:00').getTime();
  let best = null;
  for (const o of orders) {
    if (o.total == null || Math.abs(o.total - amt) > 0.011) continue;
    const dd = Math.abs(new Date((o.date || '') + 'T12:00:00').getTime() - td) / 86400000;
    if (Number.isNaN(dd) || dd > 6) continue;
    if (!best || dd < best._dd) best = { ...o, _dd: dd };
  }
  return best;
}
