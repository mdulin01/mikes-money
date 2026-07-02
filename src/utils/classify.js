// Auto-classification for transactions: spending category + tax/ownership class + home-office flag + propertyId.
// First matching rule wins (specific → general). Most everyday spend defaults to personal.
import { classifyProperty } from '../data/properties';

const has = (s, arr) => { const x = (s || '').toLowerCase(); return arr.some(k => x.includes(k)); };

// kw: keywords to match in merchant/name. category: spending category id. klass: tax class
// (defaults to 'personal' for ordinary expenses). homeOffice: partial business deduction.
// inflow: rule only applies to money coming IN (amount < 0 in Plaid convention).
const RULES = [
  // ---- INCOME ----
  { kw: ['avance', 'triad', 'generations', 'unc charlotte', 'uncc', 'university of north carolina at charlotte', 'gma', 'greensboro med', 'gray matter'], category: 'other-inc', klass: 'business', inflow: true },
  // Triad Primary Care pays by BOA book wire — descriptor carries no payer name (confirmed by Mike 2026-06-11).
  { kw: ['wire type:book'], category: 'other-inc', klass: 'business', inflow: true },
  // Rent income — three channels:
  //  • Liam collects N.Elm/Prairie/Hillcrest and Zelles Mike (memo names the property).
  //  • Green Crest pays via Avail → posts as "Move Sales Inc" (Avail's payout entity) into 5/3.
  //  • Late/manual rent arrives as a money-order COUNTER CREDIT (no payer name) — not auto-attributable;
  //    Liam documents those in rainbow-rentals (payment method per property).
  { kw: ['liam dulin', 'avail des', 'availco', 'avail tenant', 'avail rent', 'move sales inc', 'move sales', 'move, inc'], category: 'rental', klass: 'rental', inflow: true },
  // Avail OUTFLOWS = rent clawed back after a tenant payment bounces (confirmed by Mike
  // 2026-07-02: Green Crest) or Avail service fees — both net against rental income/Sch E.
  { kw: ['avail des', 'availco', 'move sales inc', 'move sales', 'move, inc'], category: 'rental', klass: 'rental' },
  // ---- RETIREMENT INCOME (monthly IRA distributions started 2026) ----
  // Explicit distribution descriptors — high confidence.
  { kw: ['ira distribution', 'ira dist', 'req min dist', 'rmd payout', 'retirement distribution', 'periodic dist'], category: 'retirement-inc', klass: 'personal', inflow: true },
  // Custodian ACH inflows to checking are usually the monthly IRA draw, but could also be a
  // taxable-brokerage transfer — flagged needsReview so a wrong guess is one tap to fix.
  // ✨-save the exact descriptor as a user rule once the first distribution posts.
  { kw: ['vanguard', 'fid bkg svc', 'fidelity', 'tiaa'], category: 'retirement-inc', klass: 'personal', inflow: true, review: true },
  // ---- TAXES (must precede TRANSFERS: "usataxpymt"/"web pmt" would otherwise match transfer) ----
  { kw: ['irs usataxpymt', 'usataxpymt', 'irs ', 'internal revenue', 'eftps', 'us treasury tax', 'treas tax', 'nc dept revenue', 'ncdor', 'nc department of revenue', 'department of revenue', 'dept revenue', 'estimated tax', '1040-es', 'nc-40', 'franchise tax'], category: 'taxes', klass: 'personal' },
  // ---- TRANSFERS (exclude from spend) ----
  // Rent moves through Mike's own accounts inconsistently (Liam → BoA → 5/3, sometimes
  // 5/3 → BoA by self-Zelle) — every self-leg is a transfer, income counts ONCE at the
  // Liam/Avail deposit. 'online banking transfer' = BoA's inter-account descriptor
  // (NOT covered by 'online transfer'); 'zelle payment to/from mike dulin' = self-Zelle.
  // 'from michael duli' = the 5/3-side RECEIVING leg of a BoA→5/3 self-Zelle
  // ("RECEIVED ZELLE PMT ID ... FROM MICHAEL DULIN") — without this it size-matches
  // the rent window and double-counts rent income.
  { kw: ['zelle payment to mike dulin', 'zelle payment from mike dulin', 'from michael duli', 'online banking transfer'], category: 'transfer' },
  { kw: ['online transfer', 'transfer to', 'transfer from', 'zelle', 'venmo', 'cash app', 'cashapp', 'payment thank you', 'autopay', 'online payment', 'card payment', 'bill pay', 'ach pmt', 'web pmt', 'pymt', 'citi card online', 'citictp'], category: 'transfer' },
  // ---- HOME-OFFICE BILLS (personal, partial business) ----
  { kw: ['duke energy', 'piedmont natural', 'dominion energy', 'charlotte water', 'water/sewer'], category: 'utilities', homeOffice: true },
  { kw: ['spectrum', 'at&t', 'at and t', 'att*', 'attbill', 'verizon', 't-mobile', 'tmobile', 'xfinity', 'comcast', 'google fi'], category: 'utilities', homeOffice: true },
  { kw: ['governors court', 'hoa', 'homeowner', 'community assoc', 'cedar management', 'association dues', 'condo assoc', 'property mgmt'], category: 'housing', homeOffice: true },
  // ---- RENTAL PROPERTY EXPENSES (Sch E) ----
  // Mortgage servicer Rocket — disambiguated per-property in PROPERTY_RULES (data/properties.js).
  { kw: ['rocket mortgage', 'rocketmtg', 'rkt mtg'], category: 'mortgage', klass: 'rental' },
  // "CHARLES SCHWAB DES:LOAN" = the HILLCREST mortgage — Rocket loan 3548284904 is
  // Schwab-Bank-branded ("Home Loan Provider of Charles Schwab Bank"), so its biweekly
  // $897.26 autopay sometimes posts under the Schwab name (confirmed in Rocket portal 2026-07-02).
  { kw: ['schwab des:loan', 'charles schwab loan', 'schwab loan'], category: 'mortgage', klass: 'rental' },
  // Guild Mortgage — Mike's PERSONAL residence (N. Church, owner-occupied; confirmed 2026-07-01). Never a rental deduction.
  { kw: ['guild mortgage', 'guild mtg'], category: 'mortgage' },
  // HOAs that are unambiguously rental-side (the personal-home HOA "governors court" is matched earlier).
  // 5/3 online bill-pay truncates payee names: "PYMT TO WILLIAM DO-" = William Douglas (Prairie HOA, $200/mo),
  // "PYMT TO HOMEOWNERS-" = Green Crest HOA ($80/mo) — confirmed by Mike 2026-07-01.
  { kw: ['magnolia place', 'green crest hoa', 'greencrest hoa', 'william douglas', 'pymt to william do', 'pymt to homeowners'], category: 'hoa', klass: 'rental' },
  // ---- COFFEE / DINING ----
  { kw: ['starbucks', 'dunkin', 'peet', 'caribou coffee', 'dutch bros', 'coffee'], category: 'dining' },
  { kw: ['mcdonald', 'chick-fil', 'chipotle', 'panera', 'salata', 'sweetgreen', 'chopt', 'cava ', 'subway', 'wendy', 'taco bell', 'burger', 'pizza', 'restaurant', 'grill', ' cafe', 'doordash', 'uber eats', 'ubereats', 'grubhub', 'tavern', 'bistro', 'kitchen', 'brewery', 'bar &', 'sushi', 'thai', 'mexican'], category: 'dining' },
  // ---- GROCERIES ----
  { kw: ['harris teeter', 'harristeeter', 'ht *', 'kroger', 'publix', 'food lion', 'whole foods', 'trader joe', 'aldi', 'wegmans', 'sprouts', 'costco', "sam's club", 'lidl', 'fresh market', 'thefreshmarket', 'deep roots', 'lowes foods', "lowe's foods", 'weaver street', 'earth fare', "mom's organic", 'moms organic', "mom's market", 'butcher block', 'compare foods', 'super g mart', 'super g', 'piggly wiggly', 'instacart'], category: 'groceries' },
  // ---- GAS / TRANSPORT ----
  { kw: ['shell', 'exxon', 'bp#', 'bp ', 'chevron', 'circle k', 'speedway', 'marathon pet', 'sheetz', 'quiktrip', 'sunoco', 'citgo', 'mobil'], category: 'transport' },
  { kw: ['uber', 'lyft', 'parking', 'dmv', 'toll', 'ez pass', 'ezpass', 'ntta'], category: 'transport' },
  // ---- SUBSCRIPTIONS / SOFTWARE ----
  { kw: ['netflix', 'spotify', 'hulu', 'disney+', 'disney plus', 'hbo', 'max.com', 'apple.com/bill', 'itunes', 'google one', 'google *', 'amazon prime', 'prime video', 'youtube premium', 'adobe', 'dropbox', 'microsoft', 'openai', 'chatgpt', 'anthropic', 'claude.ai', 'notion', 'github', 'vercel', 'godaddy', 'squarespace', 'audible', 'patreon', 'substack'], category: 'subscriptions' },
  // ---- HEALTH ----
  { kw: ['cvs', 'walgreens', 'rite aid', 'pharmacy', 'quest diag', 'labcorp', 'novant', 'atrium health', 'one medical', 'dental', 'dentist', 'optometr', 'vision center', 'orthodont'], category: 'health' },
  // ---- LICENSING / CREDENTIALS (business) ----
  { kw: ['dea ', 'dea registration', 'drug enforcement', 'medical board', 'board of medical', 'nc medical board', 'nc medical', 'state medical', 'licensure', 'license renewal', 'medical license', 'fsmb', 'usmle', 'abim', 'abms', 'board certif', 'maintenance of certif', 'credential', 'nccpa', 'nbme'], category: 'licensing', klass: 'business' },
  // ---- PROFESSIONAL DEVELOPMENT / CME (business) ----
  { kw: ['cme ', 'continuing medical', 'continuing education', 'american academy', 'american college of', 'aafp', 'acep', 'uptodate', 'up to date', 'medscape', 'pri-med', 'primed', 'osler', 'mayo clinic cme', 'harvard medical', 'wolters kluwer', 'lippincott', 'conference registration', 'symposium', 'coursera', 'udemy', 'grand rounds'], category: 'prof-dev', klass: 'business' },
  // ---- WORK TRAVEL ----
  { kw: ['delta air', 'united air', 'american air', 'southwest air', 'jetblue', 'alaska air', 'airlines', 'marriott', 'hilton', 'hyatt', 'westin', 'sheraton', 'airbnb', 'vrbo', 'hertz', 'avis', 'enterprise rent', 'national car', 'expedia', 'booking.com'], category: 'travel', klass: 'work-travel' },
  // ---- HOUSEHOLD SERVICES ----
  { kw: ['the maids', 'merry maids', 'molly maid', 'cleaning service', 'housekeeping', 'lawn care', 'landscaping', 'pest control', 'terminix', 'orkin', 'handyman', 'home services'], category: 'maintenance' },
  // ---- SHOPPING ----
  { kw: ['amazon', 'amzn', 'best buy', 'home depot', "lowe's", 'lowes', 'ikea', 'wayfair', 'etsy', 'ebay', 'nordstrom', 'macy', ' rei ', "dick's", 'apple store', 'target', 'walmart'], category: 'shopping' },
  // ---- INSURANCE ----
  { kw: ['north carolina state health plan', 'nc state health plan', 'state health plan', 'ncshp'], category: 'insurance' },
  { kw: ['geico', 'state farm', 'progressive', 'allstate', 'usaa', 'nationwide', 'liberty mutual', 'metlife', ' insurance'], category: 'insurance' },
  // ---- ENTERTAINMENT / FITNESS ----
  { kw: ['amc ', 'cinema', 'movie', 'ticketmaster', 'stubhub', 'steam games', 'playstation', 'xbox', 'nintendo', 'golf', 'planet fit', 'peloton', 'lifetime fitness', 'orange theory', 'orangetheory'], category: 'entertainment' },
  // ---- FEES ----
  { kw: ['service charge', 'monthly fee', 'atm fee', 'overdraft', 'interest charge', 'annual fee', 'wire fee', 'foreign transaction', 'late fee'], category: 'fees' },
];

// Returns { category, klass, homeOffice, conf, propertyId } or null.
// conf: 'high' (keyword) | 'review' (size-based) | 'user' (learned from manual override).
// userRules: optional Array<{ kw: string[], category?, klass?, propertyId?, homeOffice? }>
// User rules are checked BEFORE built-in RULES so they always win.
export function classify(txn, account, userRules) {
  const payee = `${txn.merchantName || ''} ${txn.name || ''}`;
  const inflow = (txn.amount || 0) < 0;
  const propMatch = classifyProperty(txn);
  if (Array.isArray(userRules)) {
    for (const r of userRules) {
      if (!r || !r.kw) continue;
      const kws = Array.isArray(r.kw) ? r.kw : [r.kw];
      if (has(payee, kws.map(k => String(k).toLowerCase()))) {
        return {
          category: r.category || null,
          klass: r.klass || 'personal',
          homeOffice: !!r.homeOffice,
          conf: 'user',
          propertyId: r.propertyId || propMatch?.propertyId || null,
        };
      }
    }
  }
  for (const r of RULES) {
    if (r.inflow && !inflow) continue;
    if (has(payee, r.kw)) {
      return {
        category: r.category,
        klass: r.klass || 'personal',
        homeOffice: !!r.homeOffice,
        conf: r.review ? 'review' : 'high',
        propertyId: propMatch?.propertyId || null,
      };
    }
  }
  // Size-based rent detection: inflow between $1400–$1800, not matched above → likely rent (review).
  const amt = Math.abs(txn.amount || 0);
  if (inflow && amt >= 1400 && amt <= 1800) {
    return {
      category: 'rental',
      klass: 'rental',
      homeOffice: false,
      conf: 'review',
      propertyId: propMatch?.propertyId || null,
    };
  }
  // Account-based class fallback (no category): Fifth Third → rental, business acct → business.
  const acct = `${account?.name || ''} ${txn.accountName || ''}`;
  if (has(acct, ['fifth third', '5/3', '53 bank'])) {
    return { category: null, klass: 'rental', homeOffice: false, conf: 'low', propertyId: propMatch?.propertyId || null };
  }
  if (has(acct, ['business', 'biz'])) {
    return { category: null, klass: 'business', homeOffice: false, conf: 'low', propertyId: null };
  }
  return propMatch ? { category: null, klass: null, homeOffice: false, conf: 'low', propertyId: propMatch.propertyId } : null;
}

export function autoClass(txn, account, userRules) { const c = classify(txn, account, userRules); return c ? c.klass : null; }
export const effectiveClass = (txn, acctById, userRules) => txn.txClass || autoClass(txn, acctById && acctById[txn.accountId], userRules) || 'uncategorized';
export const effectiveCategory = (txn, acctById, userRules) => txn.category && txn.category !== 'uncategorized' ? txn.category : ((classify(txn, acctById && acctById[txn.accountId], userRules) || {}).category || 'uncategorized');

// Generate a normalized merchant keyword from a transaction (used when promoting a manual
// categorization to a user rule). Lowercase, trim, strip transaction noise like trailing
// store numbers, dates, and reference codes — keep just the merchant identity.
export function merchantKeyword(txn) {
  const raw = (txn.merchantName || txn.name || '').toLowerCase().trim();
  if (!raw) return null;
  // Strip trailing digits/IDs, common payment-rail suffixes, and parenthetical noise.
  return raw
    .replace(/\s+#?\d{2,}.*$/, '')            // "harris teeter #423" -> "harris teeter"
    .replace(/\s+\d{2}\/\d{2}.*$/, '')      // dates
    .replace(/\s+(pos|sq \*|tst\*|sp\*|sq\*|tst |pp\*|gp\*|in \*|crd|ach|web|pos pur|debit|recur).*$/, '')
    .replace(/[,.;]+$/, '')
    .trim() || raw;
}

