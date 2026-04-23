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
  // Thematic / concentrated ETFs
  TAN:   { Utilities: 0.5, Industrials: 0.3, Technology: 0.2 }, // solar — split
  ICLN:  { Utilities: 0.6, Industrials: 0.3, Technology: 0.1 },
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
