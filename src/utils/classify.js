// Auto-classification for transactions: spending category + tax/ownership class + home-office flag.
// First matching rule wins (specific → general). Most everyday spend defaults to personal.
const has = (s, arr) => { const x = (s || '').toLowerCase(); return arr.some(k => x.includes(k)); };

// kw: keywords to match in merchant/name. category: spending category id. klass: tax class
// (defaults to 'personal' for ordinary expenses). homeOffice: partial business deduction.
// inflow: rule only applies to money coming IN (amount < 0 in Plaid convention).
const RULES = [
  // ---- INCOME ----
  { kw: ['avance', 'triad', 'generations', 'unc charlotte', 'uncc', 'university of north carolina at charlotte', 'gma', 'greensboro med'], category: 'other-inc', klass: 'business', inflow: true },
  // ---- TRANSFERS (exclude from spend) ----
  { kw: ['online transfer', 'transfer to', 'transfer from', 'zelle', 'venmo', 'cash app', 'cashapp', 'payment thank you', 'autopay', 'online payment', 'card payment', 'bill pay', 'ach pmt', 'web pmt', 'pymt'], category: 'transfer' },
  // ---- HOME-OFFICE BILLS (personal, partial business) ----
  { kw: ['duke energy', 'piedmont natural', 'dominion energy', 'charlotte water', 'water/sewer'], category: 'utilities', homeOffice: true },
  { kw: ['spectrum', 'at&t', 'at and t', 'att*', 'attbill', 'verizon', 't-mobile', 'tmobile', 'xfinity', 'comcast', 'google fi'], category: 'utilities', homeOffice: true },
  { kw: ['governors court', 'hoa', 'homeowner', 'community assoc', 'cedar management', 'association dues', 'condo assoc', 'property mgmt'], category: 'housing', homeOffice: true },
  // ---- COFFEE / DINING ----
  { kw: ['starbucks', 'dunkin', 'peet', 'caribou coffee', 'dutch bros', 'coffee'], category: 'dining' },
  { kw: ['mcdonald', 'chick-fil', 'chipotle', 'panera', 'subway', 'wendy', 'taco bell', 'burger', 'pizza', 'restaurant', 'grill', ' cafe', 'doordash', 'uber eats', 'ubereats', 'grubhub', 'tavern', 'bistro', 'kitchen', 'brewery', 'bar &', 'sushi', 'thai', 'mexican'], category: 'dining' },
  // ---- GROCERIES ----
  { kw: ['harris teeter', 'kroger', 'publix', 'food lion', 'whole foods', 'trader joe', 'aldi', 'wegmans', 'sprouts', 'costco', "sam's club", 'lidl'], category: 'groceries' },
  // ---- GAS / TRANSPORT ----
  { kw: ['shell', 'exxon', 'bp#', 'bp ', 'chevron', 'circle k', 'speedway', 'marathon pet', 'sheetz', 'quiktrip', 'sunoco', 'citgo', 'mobil'], category: 'transport' },
  { kw: ['uber', 'lyft', 'parking', 'dmv', 'toll', 'ez pass', 'ezpass', 'ntta'], category: 'transport' },
  // ---- SUBSCRIPTIONS / SOFTWARE ----
  { kw: ['netflix', 'spotify', 'hulu', 'disney+', 'disney plus', 'hbo', 'max.com', 'apple.com/bill', 'itunes', 'google one', 'google *', 'amazon prime', 'prime video', 'youtube premium', 'adobe', 'dropbox', 'microsoft', 'openai', 'chatgpt', 'anthropic', 'claude.ai', 'notion', 'github', 'vercel', 'godaddy', 'squarespace', 'audible', 'patreon', 'substack'], category: 'subscriptions' },
  // ---- HEALTH ----
  { kw: ['cvs', 'walgreens', 'rite aid', 'pharmacy', 'quest diag', 'labcorp', 'novant', 'atrium health', 'one medical', 'dental', 'dentist', 'optometr', 'vision center', 'orthodont'], category: 'health' },
  // ---- LICENSURE / CME (business) ----
  { kw: ['dea ', 'drug enforcement', 'medical board', 'board of medical', 'licensure', 'abim', 'abms', 'american academy', 'cme ', 'board certif', 'credential', 'nc medical'], category: 'other-exp', klass: 'business' },
  // ---- WORK TRAVEL ----
  { kw: ['delta air', 'united air', 'american air', 'southwest air', 'jetblue', 'alaska air', 'airlines', 'marriott', 'hilton', 'hyatt', 'westin', 'sheraton', 'airbnb', 'vrbo', 'hertz', 'avis', 'enterprise rent', 'national car', 'expedia', 'booking.com'], category: 'travel', klass: 'work-travel' },
  // ---- SHOPPING ----
  { kw: ['amazon', 'amzn', 'best buy', 'home depot', "lowe's", 'lowes', 'ikea', 'wayfair', 'etsy', 'ebay', 'nordstrom', 'macy', ' rei ', "dick's", 'apple store', 'target', 'walmart'], category: 'shopping' },
  // ---- INSURANCE ----
  { kw: ['geico', 'state farm', 'progressive', 'allstate', 'usaa', 'nationwide', 'liberty mutual', 'metlife', ' insurance'], category: 'insurance' },
  // ---- ENTERTAINMENT / FITNESS ----
  { kw: ['amc ', 'cinema', 'movie', 'ticketmaster', 'stubhub', 'steam games', 'playstation', 'xbox', 'nintendo', 'golf', 'planet fit', 'peloton', 'lifetime fitness', 'orange theory', 'orangetheory'], category: 'entertainment' },
  // ---- FEES ----
  { kw: ['service charge', 'monthly fee', 'atm fee', 'overdraft', 'interest charge', 'annual fee', 'wire fee', 'foreign transaction', 'late fee'], category: 'fees' },
];

// Returns { category, klass, homeOffice, conf } or null. conf: 'high' (keyword) | 'review' (size-based).
export function classify(txn, account) {
  const payee = `${txn.merchantName || ''} ${txn.name || ''}`;
  const inflow = (txn.amount || 0) < 0;
  for (const r of RULES) {
    if (r.inflow && !inflow) continue;
    if (has(payee, r.kw)) return { category: r.category, klass: r.klass || 'personal', homeOffice: !!r.homeOffice, conf: 'high' };
  }
  // Size-based rent detection: inflow between $1400–$1800, not matched above → likely rent (review).
  const amt = Math.abs(txn.amount || 0);
  if (inflow && amt >= 1400 && amt <= 1800) return { category: 'rental', klass: 'rental', homeOffice: false, conf: 'review' };
  // Account-based class fallback (no category): Fifth Third → rental, business acct → business.
  const acct = `${account?.name || ''} ${txn.accountName || ''}`;
  if (has(acct, ['fifth third', '5/3', '53 bank'])) return { category: null, klass: 'rental', homeOffice: false, conf: 'low' };
  if (has(acct, ['business', 'biz'])) return { category: null, klass: 'business', homeOffice: false, conf: 'low' };
  return null;
}

export function autoClass(txn, account) { const c = classify(txn, account); return c ? c.klass : null; }
export const effectiveClass = (txn, acctById) => txn.txClass || autoClass(txn, acctById && acctById[txn.accountId]) || 'uncategorized';
export const effectiveCategory = (txn, acctById) => txn.category && txn.category !== 'uncategorized' ? txn.category : ((classify(txn, acctById && acctById[txn.accountId]) || {}).category || 'uncategorized');
