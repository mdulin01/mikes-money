// Ticker → sector composition (fractions sum to 1.0).
// Use for stock-side sector concentration checks (rough approximations).
// "Diversified" funds don't need entries here — they fall through as diversified.

export const SECTOR_MAP = {
  // Pure single-sector funds
  VITAX: { Technology: 1.0 },
  VGT:   { Technology: 1.0 },
  XLK:   { Technology: 1.0 },
  IYW:   { Technology: 1.0 },
  FTEC:  { Technology: 1.0 },
  XLF:   { 'Financial Services': 1.0 },
  VFH:   { 'Financial Services': 1.0 },
  XLE:   { Energy: 1.0 },
  VDE:   { Energy: 1.0 },
  XLV:   { Healthcare: 1.0 },
  VHT:   { Healthcare: 1.0 },
  XLU:   { Utilities: 1.0 },
  VPU:   { Utilities: 1.0 },
  XLI:   { Industrials: 1.0 },
  VIS:   { Industrials: 1.0 },
  XLY:   { 'Consumer Cyclical': 1.0 },
  VCR:   { 'Consumer Cyclical': 1.0 },
  XLP:   { 'Consumer Defensive': 1.0 },
  VDC:   { 'Consumer Defensive': 1.0 },
  XLB:   { 'Basic Materials': 1.0 },
  VAW:   { 'Basic Materials': 1.0 },
  XLC:   { 'Communication Services': 1.0 },
  VOX:   { 'Communication Services': 1.0 },
  // Real estate often shown as its own category
  VNQ:   { 'Real Estate': 1.0 },
  VNQI:  { 'Real Estate': 1.0 },
  SCHH:  { 'Real Estate': 1.0 },
  IYR:   { 'Real Estate': 1.0 },
  // Thematic / concentrated ETFs (rough sector splits — approximations)
  TAN:   { Utilities: 0.5, Industrials: 0.3, Technology: 0.2 }, // solar
  ICLN:  { Utilities: 0.52, Industrials: 0.27, Technology: 0.18, 'Basic Materials': 0.03 }, // clean energy
  QCLN:  { Technology: 0.4, 'Consumer Cyclical': 0.25, Industrials: 0.2, Utilities: 0.15 },
  BOTZ:  { Industrials: 0.43, Technology: 0.42, Healthcare: 0.1, 'Consumer Cyclical': 0.05 }, // robotics & AI
  ROBO:  { Industrials: 0.45, Technology: 0.45, Healthcare: 0.1 },
  ARKQ:  { Technology: 0.35, Industrials: 0.30, 'Consumer Cyclical': 0.25, 'Communication Services': 0.10 },
  AIQ:   { Technology: 0.60, 'Communication Services': 0.28, 'Consumer Cyclical': 0.12 }, // AI & big data
  IRBO:  { Technology: 0.50, Industrials: 0.20, 'Communication Services': 0.15, 'Consumer Cyclical': 0.10, Healthcare: 0.05 },
  DRIV:  { Technology: 0.38, 'Consumer Cyclical': 0.28, Industrials: 0.19, 'Basic Materials': 0.15 }, // autonomous & EV
  IDRV:  { 'Consumer Cyclical': 0.35, Technology: 0.35, Industrials: 0.20, 'Basic Materials': 0.10 },
  KARS:  { 'Consumer Cyclical': 0.45, Industrials: 0.20, 'Basic Materials': 0.20, Technology: 0.15 },
  // Tech-heavy but diversified
  QQQ:   { Technology: 0.55, 'Communication Services': 0.18, 'Consumer Cyclical': 0.15,
           Healthcare: 0.06, Industrials: 0.03, 'Consumer Defensive': 0.03 },
  // Diversified funds — leave off (will count as "Diversified" bucket)
};

/**
 * Compute US-stock-only sector totals from a holdings array.
 * Returns { totalsByS, totalStock, diversifiedStock }
 */
export function computeSectorTotals(holdings, classifyFn) {
  const totals = {};
  let totalStock = 0;
  let diversifiedStock = 0;
  for (const h of holdings) {
    const cls = classifyFn(h);
    // Only count equity-type classes
    if (cls !== 'us_stock' && cls !== 'intl_stock' && cls !== 'real_estate') continue;
    const value = h.institutionValue || 0;
    totalStock += value;
    const ticker = (h.ticker || '').toUpperCase();
    const map = SECTOR_MAP[ticker];
    if (!map) {
      diversifiedStock += value;
      continue;
    }
    for (const [sector, pct] of Object.entries(map)) {
      totals[sector] = (totals[sector] || 0) + value * pct;
    }
  }
  return { totals, totalStock, diversifiedStock };
}
