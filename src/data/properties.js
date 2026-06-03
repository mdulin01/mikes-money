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
  // ---- HOAs (unique payees, no amount disambiguation needed) ----
  { kw: ['magnolia place'], propertyId: 'north-elm' },
  { kw: ['green crest hoa', 'greencrest hoa'], propertyId: 'green-crest' },
  { kw: ['william douglas'], propertyId: 'prairie-trail' },

  // ---- Mortgages (single servicer Rocket — disambiguate by amount) ----
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
