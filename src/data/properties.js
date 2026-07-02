// Real-estate properties — mirrors rainbow-rentals, used here to tag transactions
// per property for Schedule E reporting + per-property P&L.
//
// Captured 2026-06-03 from https://rainbowrentals.app/. Owner-occupied properties
// (e.g., N. Church) are included so utilities/mortgage on them can be tagged personal
// (or home-office) without being misread as a rental expense.
//
// Edit the merchant rules below as new payees show up; the auto-categorizer
// will pick them up on the next run.

export const PROPERTIES = [
  {
    id: 'north-elm',
    nickname: 'N. Elm',
    address: '622 N. Elm Unit H, Greensboro, NC 27401',
    type: 'condo',
    schedule: 'rental',
  },
  {
    id: 'green-crest',
    nickname: 'Green Crest',
    address: '2819 Green Crest Ct, Greensboro, NC',
    type: 'condo',
    schedule: 'rental',
  },
  {
    id: 'brookhurst',
    nickname: 'Brookhurst',
    address: '2113 Brookhurst Drive, Winston-Salem, NC',
    type: 'house',
    schedule: 'rental',
    owner: 'adam', // managed by Liam for Adam Britten; rent via Avail ($1,300/mo, move-in late July 2026)
  },
  {
    id: 'prairie-trail',
    nickname: '2 Prairie Trail',
    address: '2 Prairie Trail Unit D, Greensboro, NC',
    type: 'condo',
    schedule: 'rental',
  },
  {
    id: 'hillcrest',
    nickname: 'Hillcrest',
    address: '412 Hillcrest Drive, Greensboro, NC',
    type: 'single-family',
    schedule: 'rental',
  },
  {
    id: 'n-church',
    nickname: 'N. Church',
    address: '113 N. Church Street #110, Greensboro, NC',
    type: 'condo',
    schedule: 'owner-occupied',
  },
];

export const PROPERTY_BY_ID = Object.fromEntries(PROPERTIES.map(p => [p.id, p]));

// Merchant → property rules. Matched against transaction merchantName + name (case-insensitive).
// `amount` (optional, in cents-tolerant dollars) disambiguates when one payee
// services multiple properties — match if abs(txn amount) is within $5 of the listed value.
export const PROPERTY_RULES = [
  // ---- Rent deposits: property parsed from the Zelle memo / payout descriptor ----
  { kw: ['nelm', 'n. elm', 'n elm'], propertyId: 'north-elm' },
  { kw: ['prairie'], propertyId: 'prairie-trail' },
  { kw: ['hillcrest'], propertyId: 'hillcrest' },
  { kw: ['brookhurst'], propertyId: 'brookhurst' },
  // Avail deposits post as 'Move Sales Inc' for BOTH Green Crest and Brookhurst — disambiguate by amount.
  // Outflows at these amounts are rent CLAWBACKS (bounced tenant payment) — same property.
  { kw: ['move sales inc', 'move sales'], amount: 1300, propertyId: 'brookhurst' },
  { kw: ['move sales inc', 'move sales'], amount: 1725, propertyId: 'green-crest' },
  { kw: ['move sales inc', 'move sales', 'greencrest'], propertyId: 'green-crest' },
  // ---- Personal residence (N. Church) — mortgage servicer Guild; confirmed personal 2026-07-01 ----
  { kw: ['guild mortgage', 'guild mtg'], propertyId: 'n-church' },
  // ---- HOAs (unique payees, no amount disambiguation needed) ----
  // 5/3 bill-pay truncates payees ("WILLIAM DO-", "HOMEOWNERS-") — match the stubs too.
  { kw: ['magnolia place'], propertyId: 'north-elm' },
  { kw: ['green crest hoa', 'greencrest hoa', 'pymt to homeowners'], propertyId: 'green-crest' },
  { kw: ['william douglas', 'pymt to william do'], propertyId: 'prairie-trail' },

  // ---- Mortgages (single servicer Rocket) ----
  // Rocket drafts SEMI-MONTHLY (half-payments) as of ~Mar 2026, so the old full-amount
  // matching silently failed. Match by the LOAN NUMBER carried in the bank descriptor
  // instead ("ID:XXXXX84904" ACH form / "MTG PYMTS 3551560576" web form) — verified
  // against half-amounts 2026-07-01: 4904≈$897×2=Hillcrest · 3780=$1,329=Prairie ·
  // …0576≈$588×2=N.Elm · …9286≈$652–660×2=Green Crest.
  { kw: ['84904'], propertyId: 'hillcrest' },
  // ALL Rocket loans are Schwab-Bank-branded and can post as "CHARLES SCHWAB DES:LOAN"
  // (all four did on 2026-06-08) — disambiguate by amount like the Rocket rules below.
  { kw: ['schwab des:loan', 'charles schwab loan', 'schwab loan'], amount: 588, propertyId: 'north-elm' },
  { kw: ['schwab des:loan', 'charles schwab loan', 'schwab loan'], amount: 656, propertyId: 'green-crest' },
  { kw: ['schwab des:loan', 'charles schwab loan', 'schwab loan'], amount: 897, propertyId: 'hillcrest' },
  { kw: ['schwab des:loan', 'charles schwab loan', 'schwab loan'], amount: 1329, propertyId: 'prairie-trail' },
  { kw: ['schwab des:loan', 'charles schwab loan', 'schwab loan'], amount: 1176, propertyId: 'north-elm' },
  { kw: ['schwab des:loan', 'charles schwab loan', 'schwab loan'], amount: 1795, propertyId: 'hillcrest' },
  { kw: ['73780'], propertyId: 'prairie-trail' },
  { kw: ['3551560576', '560576'], propertyId: 'north-elm' },
  { kw: ['3555729286', '729286'], propertyId: 'green-crest' },
  // Amount fallbacks for descriptors without a loan number (June 2026 format has none).
  // Semi-monthly halves first, then legacy full-monthly amounts.
  { kw: ['rocket mortgage', 'rocketmtg', 'rkt mtg'], amount: 588, propertyId: 'north-elm' },
  { kw: ['rocket mortgage', 'rocketmtg', 'rkt mtg'], amount: 656, propertyId: 'green-crest' },  // $652–660 escrow drift, ±5 tolerance
  { kw: ['rocket mortgage', 'rocketmtg', 'rkt mtg'], amount: 897, propertyId: 'hillcrest' },
  { kw: ['rocket mortgage', 'rocketmtg', 'rkt mtg'], amount: 1176, propertyId: 'north-elm' },
  { kw: ['rocket mortgage', 'rocketmtg', 'rkt mtg'], amount: 1304, propertyId: 'green-crest' },
  { kw: ['rocket mortgage', 'rocketmtg', 'rkt mtg'], amount: 1329, propertyId: 'prairie-trail' },
  { kw: ['rocket mortgage', 'rocketmtg', 'rkt mtg'], amount: 1795, propertyId: 'hillcrest' },
];

const AMOUNT_TOLERANCE = 5; // dollars

// Returns { propertyId } or null. Matches against merchantName + name; if rule has an
// `amount`, the txn amount must be within $5 of it.
export function classifyProperty(txn) {
  const payee = `${txn.merchantName || ''} ${txn.name || ''}`.toLowerCase();
  const amt = Math.abs(txn.amount || 0);
  for (const r of PROPERTY_RULES) {
    if (!r.kw.some(k => payee.includes(k))) continue;
    if (r.amount != null && Math.abs(amt - r.amount) > AMOUNT_TOLERANCE) continue;
    return { propertyId: r.propertyId };
  }
  return null;
}

export const effectiveProperty = (txn) =>
  txn.propertyId || classifyProperty(txn)?.propertyId || null;
