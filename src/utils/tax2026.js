// 2026 federal + NC tax math for 1099 (self-employment) income — single filer.
// Sources: IRS Rev. Proc. 2025-32 (brackets, $16,100 standard deduction),
// SSA 2026 fact sheet ($184,500 wage base), NCDOR (3.99% flat for tax years after 2025).
// Approximations: QBI deduction, SE-health-insurance deduction, and solo-401(k)
// deferrals are NOT applied — so net income here is slightly conservative.

export const STD_DEDUCTION = 16100;
export const NC_RATE = 0.0399;
export const SS_WAGE_BASE = 184500;
export const TOP_OF_24 = 201775; // taxable income where the 32% bracket starts

export const BRACKETS_SINGLE = [
  [12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24],
  [256225, 0.32], [640600, 0.35], [Infinity, 0.37],
];

// 2026 solo-401(k) reference limits (IRS COLA notice). Ages 60–63 get the
// SECURE 2.0 "super catch-up" in lieu of the standard 50+ catch-up.
export const SOLO_401K = { deferral: 24500, catchUp50: 8000, catchUp60to63: 11250, total415c: 72000 };

// Social Security claiming factors for FRA = 67 (born 1960+), applied to the PIA.
export const SS_CLAIM_FACTORS = {
  62: 0.70, 63: 0.75, 64: 0.80, 65: 0.8667, 66: 0.9333,
  67: 1.0, 68: 1.08, 69: 1.16, 70: 1.24,
};
export function ssFactor(claimAge) {
  const a = Math.max(62, Math.min(70, Math.round(claimAge || 67)));
  return SS_CLAIM_FACTORS[a] ?? 1.0;
}

export function fedTax(taxable) {
  let tax = 0, lo = 0;
  for (const [hi, r] of BRACKETS_SINGLE) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * r;
    lo = hi;
  }
  return Math.max(0, tax);
}

export function seTax(gross1099) {
  if (gross1099 <= 0) return 0;
  const base = gross1099 * 0.9235;
  return Math.min(base, SS_WAGE_BASE) * 0.124 + base * 0.029;
}

// Net take-home from 1099 gross: SE tax + federal brackets + NC flat rate.
export function netFrom1099(gross) {
  if (!gross || gross <= 0) return { net: 0, tax: 0, taxable: 0, se: 0, effRate: 0 };
  const se = seTax(gross);
  const taxable = Math.max(0, gross - se / 2 - STD_DEDUCTION);
  const tax = se + fedTax(taxable) + taxable * NC_RATE;
  return { net: gross - tax, tax, taxable, se, effRate: tax / gross };
}

// Roth-conversion room left before the 32% bracket, given 1099 gross income.
export function rothRoomTo24(gross1099) {
  const { taxable } = netFrom1099(gross1099 || 0);
  return Math.max(0, TOP_OF_24 - taxable);
}
