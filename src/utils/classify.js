// Tax/ownership class auto-rules. Layered on top of spending categories: what matters
// for taxes is which return line a txn hits (Sch C business vs Sch E rental vs personal).
const has = (s, arr) => { const x = (s || '').toLowerCase(); return arr.some(k => x.includes(k)); };

// Returns a class id from rules, or null if nothing matches.
export function autoClass(txn, account) {
  const payee = `${txn.merchantName || ''} ${txn.name || ''}`;
  if (has(payee, ['liam'])) return 'split'; // weekly help: 50/50 business/rental
  if (has(payee, ['avance', 'triad', 'carrboro family', 'unc charlotte', 'uncc', 'charlotte', 'gma', 'greensboro med'])) return 'business'; // consulting income
  if (has(payee, ['dea ', 'drug enforcement', 'medical board', 'board of medical', 'licensure', 'license renewal', 'state medical', 'cme', 'american academy', 'board certif', 'abim', 'abms', 'credential'])) return 'business'; // licensure / CME
  if (has(payee, ['delta air', 'united air', 'american air', 'southwest air', 'airlines', 'marriott', 'hilton', 'hyatt', 'airbnb', 'hertz', 'avis', 'enterprise rent', 'national car', 'conference', 'registration'])) return 'work-travel';
  const acct = `${account?.name || ''} ${txn.accountName || ''}`;
  if (has(acct, ['fifth third', '5/3', '53 bank'])) return 'rental';
  if (has(acct, ['business', 'biz'])) return 'business';
  return null;
}

// Manual override (txClass) wins; else auto-rules; else uncategorized.
export const effectiveClass = (txn, acctById) => txn.txClass || autoClass(txn, acctById && acctById[txn.accountId]) || 'uncategorized';
