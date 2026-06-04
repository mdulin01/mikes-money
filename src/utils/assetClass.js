// Classify Plaid holdings into asset classes. Used by Asset Allocation + Checkup pages.
//
// Strategy:
// 1. If the ticker matches our hand-curated map, use that classification (highest accuracy).
// 2. Otherwise, fall back to Plaid's `security.type` and `is_cash_equivalent` fields.
// 3. Unknown positions land in "Other" so nothing disappears silently.

export const ASSET_CLASSES = [
  { id: 'us_stock',      label: 'US Stock',        color: '#10b981', risk: 'growth' },
  { id: 'intl_stock',    label: 'Intl Stock',      color: '#22d3ee', risk: 'growth' },
  { id: 'us_bond',       label: 'US Bond',         color: '#3b82f6', risk: 'income' },
  { id: 'intl_bond',     label: 'Intl Bond',       color: '#6366f1', risk: 'income' },
  { id: 'cash',          label: 'Cash',            color: '#94a3b8', risk: 'stable' },
  { id: 'real_estate',   label: 'Real Estate',     color: '#f59e0b', risk: 'growth' },
  { id: 'alternative',   label: 'Alternatives',    color: '#a855f7', risk: 'other' },
  { id: 'crypto',        label: 'Crypto',          color: '#ec4899', risk: 'other' },
  { id: 'other',         label: 'Other',           color: '#64748b', risk: 'other' },
];

// Hand-curated ticker → asset class map. Add to this list as needed.
const TICKER_MAP = {
  // US Total/Broad Market
  VTI: 'us_stock', VOO: 'us_stock', VTSAX: 'us_stock', FSKAX: 'us_stock', SWTSX: 'us_stock',
  SPY: 'us_stock', IVV: 'us_stock', FXAIX: 'us_stock', VFIAX: 'us_stock', ITOT: 'us_stock',
  SCHB: 'us_stock', SCHX: 'us_stock', SWPPX: 'us_stock',
  // US Sector / Large Cap / Growth / Value / Small
  QQQ: 'us_stock', VUG: 'us_stock', VTV: 'us_stock', VB: 'us_stock', IJR: 'us_stock',
  IWM: 'us_stock', IWD: 'us_stock', IWF: 'us_stock', IJH: 'us_stock', DIA: 'us_stock',
  VITAX: 'us_stock', VLCAX: 'us_stock', SWSSX: 'us_stock', DISSX: 'us_stock',
  TAN: 'us_stock',  // Solar ETF (thematic US)
  // International developed + emerging + ESG-global
  VXUS: 'intl_stock', IXUS: 'intl_stock', VTIAX: 'intl_stock', FTIHX: 'intl_stock',
  VEA: 'intl_stock', IEFA: 'intl_stock', SCHF: 'intl_stock', SWISX: 'intl_stock',
  VWO: 'intl_stock', IEMG: 'intl_stock', EEM: 'intl_stock', SFENX: 'intl_stock',
  VESGX: 'intl_stock', VEIGX: 'intl_stock', NZAC: 'intl_stock',
  // US Bond
  BND: 'us_bond', AGG: 'us_bond', VBTLX: 'us_bond', FXNAX: 'us_bond', VCIT: 'us_bond',
  BSV: 'us_bond', BIV: 'us_bond', BLV: 'us_bond', SCHZ: 'us_bond', TLT: 'us_bond',
  IEF: 'us_bond', SHY: 'us_bond', TIPS: 'us_bond', VTIP: 'us_bond', SCHP: 'us_bond',
  VFIDX: 'us_bond', VGLT: 'us_bond',
  // Intl Bond
  BNDX: 'intl_bond', IAGG: 'intl_bond', VTABX: 'intl_bond',
  // Real Estate (US + Intl)
  VNQ: 'real_estate', SCHH: 'real_estate', IYR: 'real_estate', REET: 'real_estate',
  VGSIX: 'real_estate', VGSLX: 'real_estate', VNQI: 'real_estate',
  // Alternatives / Commodities
  GLD: 'alternative', IAU: 'alternative', SLV: 'alternative', DBC: 'alternative',
  USO: 'alternative',
  // Cash / Money Market
  VMFXX: 'cash', SPAXX: 'cash', FZFXX: 'cash', SPRXX: 'cash', VUSXX: 'cash', FDRXX: 'cash',
  // Crypto (ETF form)
  IBIT: 'crypto', FBTC: 'crypto', GBTC: 'crypto', ETHE: 'crypto', BITO: 'crypto',
  // TIAA CREF Social Choice is ~60/40 blended — classify as us_stock as rough approximation
  QSCCFX: 'us_stock',
  // ESG core (held in most accounts)
  ESGV: 'us_stock', VSGX: 'intl_stock',
  // Thematic tilt — AI/robotics, EV/autonomous, clean energy (global equity; mapped us_stock by convention)
  BOTZ: 'us_stock', DRIV: 'us_stock', ICLN: 'us_stock',
  // Other thematic tickers (mapped so they classify if added later)
  AIQ: 'us_stock', IRBO: 'us_stock', QCLN: 'us_stock', IDRV: 'us_stock', KARS: 'us_stock', ROBO: 'us_stock', ARKQ: 'us_stock',
};

export function classifyHolding(h) {
  const t = (h.ticker || '').toUpperCase().trim();
  if (TICKER_MAP[t]) return TICKER_MAP[t];

  if (h.isCashEquivalent) return 'cash';

  const type = (h.type || '').toLowerCase();
  if (type === 'cash') return 'cash';
  if (type === 'fixed income' || type === 'fixed_income') return 'us_bond';
  if (type === 'equity') return 'us_stock';
  if (type === 'etf' || type === 'mutual fund' || type === 'mutual_fund') return 'us_stock';
  if (type === 'derivative') return 'alternative';
  if (type === 'cryptocurrency' || type === 'crypto') return 'crypto';

  // Name-based fallback
  const n = (h.name || '').toLowerCase();
  if (/bond|treasury|fixed income/.test(n)) return 'us_bond';
  if (/international|emerging|pacific|europe|developed markets/.test(n)) return 'intl_stock';
  if (/reit|real estate/.test(n)) return 'real_estate';
  if (/money market|cash reserve/.test(n)) return 'cash';

  return 'other';
}

export function allocateHoldings(holdings) {
  const totals = {};
  let total = 0;
  for (const h of holdings) {
    const cls = classifyHolding(h);
    const v = h.institutionValue || 0;
    totals[cls] = (totals[cls] || 0) + v;
    total += v;
  }
  return ASSET_CLASSES.map(c => ({
    ...c,
    value: totals[c.id] || 0,
    pct: total > 0 ? (totals[c.id] || 0) / total : 0,
  })).filter(r => r.value > 0);
}

// Suggested asset allocation by target retirement horizon (very rough — user-adjustable)
export function targetAllocation(yearsToRetirement) {
  // Simple glide path: stock% = 110 - age (for current age assume 40 if unknown)
  // This function is framed around years-to-retirement instead.
  const stockPct = Math.max(30, Math.min(90, 50 + yearsToRetirement * 1.5)) / 100;
  const intlStockShare = 0.3;                // 30% of stock in intl
  const bondIntlShare = 0.2;                 // 20% of bonds in intl
  const bondPct = 1 - stockPct - 0.05;       // leave 5% cash
  return {
    us_stock:   stockPct * (1 - intlStockShare),
    intl_stock: stockPct * intlStockShare,
    us_bond:    bondPct * (1 - bondIntlShare),
    intl_bond:  bondPct * bondIntlShare,
    cash:       0.05,
  };
}
