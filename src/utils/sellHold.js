// Sell-vs-hold model for the rentals. Deterministic and transparent — the point is
// seeing which assumptions drive the answer, not predicting the future.
//
// Tax model (confirm with CPA): residential rental, 27.5-yr straight-line on the
// building share of basis. On sale: unrecaptured §1250 depreciation taxed at 25%
// federal, remaining long-term gain at `ltcgRate`, NC taxes the whole gain at flat
// rate. Selling costs reduce the amount realized. Land/improvements/closing-cost
// basis adjustments are ignored (conservative-ish; CPA schedules refine).

import { monthlyPI } from './amortize';

export function yearsHeld(purchaseDate, at = new Date()) {
  return Math.max(0, (at - new Date(purchaseDate + 'T00:00:00')) / (365.25 * 86400000));
}

export function depreciationToDate(purchasePrice, purchaseDate, buildingPct, atYearsFromNow = 0) {
  const yrs = yearsHeld(purchaseDate) + atYearsFromNow;
  const annual = (purchasePrice * buildingPct) / 27.5;
  return Math.min(purchasePrice * buildingPct, annual * yrs);
}

// Loan balance N years from now given current balance/rate/remaining term (P&I amortization).
export function balanceInYears(balance, rate, remMonths, years) {
  if (!balance || !rate || !remMonths) return balance || 0;
  const pmt = monthlyPI(balance, rate, remMonths);
  const i = rate / 12;
  let bal = balance;
  const months = Math.min(Math.round(years * 12), remMonths);
  for (let m = 0; m < months; m++) bal = Math.max(0, bal * (1 + i) - pmt);
  return bal;
}

// After-tax net proceeds if sold `years` from now.
export function saleProceeds({ value, appreciationRate, years, sellingCostPct, loanBalanceNow, rate, remMonths, purchasePrice, purchaseDate, buildingPct, ltcgRate, recaptureRate, ncRate }) {
  const saleValue = value * Math.pow(1 + appreciationRate, years);
  const netSale = saleValue * (1 - sellingCostPct);
  const dep = depreciationToDate(purchasePrice, purchaseDate, buildingPct, years);
  const adjBasis = purchasePrice - dep;
  const gain = Math.max(0, netSale - adjBasis);
  const recapture = Math.min(dep, gain);
  const capGain = gain - recapture;
  const fedTax = recapture * recaptureRate + capGain * ltcgRate;
  const ncTax = gain * ncRate;
  const loanBal = balanceInYears(loanBalanceNow, rate, remMonths, years);
  return {
    saleValue, netSale, dep, gain, recapture, fedTax, ncTax, loanBal,
    netProceeds: netSale - loanBal - fedTax - ncTax,
    totalFriction: (saleValue - netSale) + fedTax + ncTax,
  };
}

// Compare: sell now + invest proceeds, vs hold (collect cash flow) then sell at horizon.
// Cash flows and proceeds compound at altReturn to the horizon for an apples FV compare.
export function compare(p, a) {
  const base = {
    value: p.estValue, sellingCostPct: a.sellingCostPct, loanBalanceNow: p.balance,
    rate: p.rate, remMonths: p.remMonths, purchasePrice: p.purchasePrice,
    purchaseDate: p.purchaseDate, buildingPct: a.buildingPct,
    ltcgRate: a.ltcgRate, recaptureRate: a.recaptureRate, ncRate: a.ncRate,
  };
  const sellNow = saleProceeds({ ...base, appreciationRate: 0, years: 0 });
  const fvSell = sellNow.netProceeds * Math.pow(1 + a.altReturn, a.horizon);

  // Hold: yearly net cash flow, compounded forward at altReturn
  let fvCashFlows = 0;
  let cfYear1 = 0;
  for (let t = 1; t <= a.horizon; t++) {
    const rent = p.monthlyRent * 12 * Math.pow(1 + a.rentGrowth, t - 1) * (1 - a.maintenancePct);
    const other = p.monthlyOtherCosts * 12 * Math.pow(1.02, t - 1);
    const debt = (t * 12 <= p.remMonths) ? p.debtService * 12 : 0;
    const cf = rent - other - debt;
    if (t === 1) cfYear1 = cf;
    fvCashFlows += cf * Math.pow(1 + a.altReturn, a.horizon - t);
  }
  const sellLater = saleProceeds({ ...base, appreciationRate: a.appreciationRate, years: a.horizon });
  const fvHold = fvCashFlows + sellLater.netProceeds;

  // Appreciation rate at which holding matches selling now (scan 0–10%)
  let breakeven = null;
  for (let r = 0; r <= 0.10 + 1e-9; r += 0.0025) {
    let fvCF = 0;
    for (let t = 1; t <= a.horizon; t++) {
      const rent = p.monthlyRent * 12 * Math.pow(1 + a.rentGrowth, t - 1) * (1 - a.maintenancePct);
      const other = p.monthlyOtherCosts * 12 * Math.pow(1.02, t - 1);
      const debt = (t * 12 <= p.remMonths) ? p.debtService * 12 : 0;
      fvCF += (rent - other - debt) * Math.pow(1 + a.altReturn, a.horizon - t);
    }
    const later = saleProceeds({ ...base, appreciationRate: r, years: a.horizon });
    if (fvCF + later.netProceeds >= fvSell) { breakeven = r; break; }
  }

  return { sellNow, sellLater, fvSell, fvHold, fvCashFlows, cfYear1, breakeven, edge: fvHold - fvSell };
}
