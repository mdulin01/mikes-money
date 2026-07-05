// Mortgage facts — captured from the Rocket Mortgage servicing portal 2026-07-02
// (rocket.com/mortgage/servicing, signed in as Mike). Rocket doesn't have an API we
// can poll, so balances/equity drift from `asOf`; re-capture occasionally or edit here.
//
// Hillcrest's loan is Schwab-Bank-branded ("Home Loan Provider of Charles Schwab Bank"),
// which is why its biweekly autopay sometimes posts as "CHARLES SCHWAB DES:LOAN".
// Guild (N. Church, Mike's residence) isn't Plaid-linked or Rocket-serviced — fields
// marked null are unknown; fill in from a Guild statement when handy.

export const MORTGAGES_AS_OF = '2026-07-02';

// Purchase history — pulled from Redfin sale records 2026-07-02 (all four bought in 2024,
// which is why the rates are 6.99–7.5%). estValue = loan balance + Rocket equity estimate;
// Prairie has no Rocket estimate so purchase price is the placeholder (editable in the
// sell/hold analyzer). monthlyOtherCosts = HOA + non-escrowed tax/insurance estimates:
// ⚠ Hillcrest's payment carries ~no escrow, so its taxes+insurance (~$550/mo est) are here;
// ⚠ N. Elm's $302 Magnolia HOA cadence (monthly vs quarterly) needs verification with Liam.
export const PURCHASES = {
  'north-elm':     { purchaseDate: '2024-01-03', purchasePrice: 200000, estValue: 226128, monthlyRent: 1425, monthlyOtherCosts: 302 },
  'hillcrest':     { purchaseDate: '2024-06-27', purchasePrice: 360000, estValue: 380120, monthlyRent: 1650, monthlyOtherCosts: 343 }, // no escrow: tax $2,947/yr + ins $1,167/yr (both actual, 2026-07-05)
  'green-crest':   { purchaseDate: '2024-09-30', purchasePrice: 200000, estValue: 254604, monthlyRent: 1725, monthlyOtherCosts: 80 },
  'prairie-trail': { purchaseDate: '2024-11-05', purchasePrice: 223000, estValue: 223000, monthlyRent: 1500, monthlyOtherCosts: 200 },
};

export const MORTGAGES = [
  {
    id: 'hillcrest',
    propertyId: 'hillcrest',
    nickname: 'Hillcrest',
    address: '412 Hillcrest Dr',
    servicer: 'Rocket (Charles Schwab Bank)',
    loanNo: '3548284904',
    plaidMask: '4904',
    type: 'Conventional 30-yr',
    rate: 0.0699,
    originalBalance: 270000,
    balance: 261935.07,
    paySchedule: 'biweekly',
    paymentPerDraft: 897.26,      // ×26/yr ≈ $1,944/mo effective
    monthlyEquivalent: 1794.51,
    maturity: '2054-09-01',
    extraPrincipalPaid: 2691.76,
    interestSaved: 17009.99,
    payoffEarlierBy: '1 yr',
    estEquity: 118185,            // Rocket estimate → implies ~$380k value
    schedule: 'rental',
  },
  {
    id: 'prairie-trail',
    propertyId: 'prairie-trail',
    nickname: '2 Prairie Trail',
    address: '2 Prairie Trl',
    servicer: 'Rocket',
    loanNo: '3563873780',
    plaidMask: '3780',
    type: 'Conventional 30-yr',
    rate: 0.075,
    originalBalance: 156100,
    balance: 154785.01,
    paySchedule: 'monthly',
    paymentPerDraft: 1328.67,
    monthlyEquivalent: 1328.67,
    maturity: '2055-06-01',       // ~29yrs remain (newest loan, no extra payments yet)
    extraPrincipalPaid: 0,
    interestSaved: 0,
    payoffEarlierBy: null,
    estEquity: null,              // Rocket shows no estimate for this one
    schedule: 'rental',
  },
  {
    id: 'green-crest',
    propertyId: 'green-crest',
    nickname: 'Green Crest',
    address: '2819 Green Crest Ct',
    servicer: 'Rocket',
    loanNo: '3555729286',
    plaidMask: null,              // not Plaid-linked
    type: 'Conventional 30-yr',
    rate: 0.075,
    originalBalance: 150000,
    balance: 145927.12,
    paySchedule: 'biweekly',
    paymentPerDraft: 660.06,
    monthlyEquivalent: 1320.12,
    maturity: '2055-02-01',
    extraPrincipalPaid: 1956.18,
    interestSaved: 14750.21,
    payoffEarlierBy: '1 yr 5 mo',
    estEquity: 108677,            // implies ~$255k value
    schedule: 'rental',
  },
  {
    id: 'north-elm',
    propertyId: 'north-elm',
    nickname: 'N. Elm',
    address: '622 N Elm St',
    servicer: 'Rocket',
    loanNo: '3551560576',
    plaidMask: '0576',
    type: 'Conventional 30-yr',
    rate: 0.0699,
    originalBalance: 150000,
    balance: 145549.61,
    paySchedule: 'biweekly',
    paymentPerDraft: 588.07,
    monthlyEquivalent: 1176.13,
    maturity: '2054-11-01',
    extraPrincipalPaid: 1764.19,
    interestSaved: 10994.52,
    payoffEarlierBy: '1 yr 1 mo',
    estEquity: 80578,             // implies ~$226k value
    schedule: 'rental',
  },
  {
    id: 'n-church',
    propertyId: 'n-church',
    nickname: 'N. Church (home)',
    address: '113 N Church St Unit 110',
    servicer: 'Guild Mortgage',   // captured from my.guildmortgage.com 2026-07-02
    loanNo: '00749-1081416',
    plaidMask: null,              // not Plaid-linked
    type: 'Conventional 30-yr',   // closed 2025-12-11 (per Mike)
    rate: 0.0575,                 // cheapest debt in the portfolio — keep, don't refi
    originalBalance: null,        // not shown in portal
    balance: 168920.52,
    paySchedule: 'monthly',
    paymentPerDraft: 1385.72,     // includes escrow (escrow balance $4,014.72 on 7/2)
    monthlyEquivalent: 1385.72,
    maturity: '2056-01-01',       // 30 yrs from Dec 2025 closing (first pmt Feb 2026)
    extraPrincipalPaid: null,
    interestSaved: null,
    payoffEarlierBy: null,
    estEquity: null,
    schedule: 'owner-occupied',
  },
];
