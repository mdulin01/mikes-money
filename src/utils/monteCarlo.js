// Monte Carlo retirement simulator.
// Independent annual returns drawn from a normal distribution based on asset mix.
// Real (inflation-adjusted) returns — so contributions and spending are in today's dollars.

// Real return assumptions. 7%/17% (long-run US history) was optimistic as a
// planning default at today's valuations; 5%/15% splits history and the major
// forward-looking capital-market assumptions. Overridable per-run via params.
const RETURNS = {
  stock: { mean: 0.05, stdev: 0.15 },  // US equities (was 0.07/0.17)
  bond:  { mean: 0.02, stdev: 0.06 },  // US aggregate bonds
};

import { ssFactor } from './tax2026';
import { workNetByAge as buildWorkNet } from './engagements';

// Box-Muller for standard normal
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleReturn(stockPct, stockMean, stockStdev) {
  const sPct = Math.max(0, Math.min(1, stockPct));
  const bPct = 1 - sPct;
  const stockR = (stockMean ?? RETURNS.stock.mean) + randn() * (stockStdev ?? RETURNS.stock.stdev);
  const bondR  = RETURNS.bond.mean  + randn() * RETURNS.bond.stdev;
  return sPct * stockR + bPct * bondR;
}

/**
 * Run many simulations.
 * @param {object} params
 * @param {number} params.startAge
 * @param {number} params.retireAge
 * @param {number} params.endAge                 usually 95
 * @param {number} params.startingBalance        today's investable assets
 * @param {number} params.annualContribution     while working (real dollars)
 * @param {number} params.contributionGrowthRate per-year real growth on contribution (e.g. 0.005 = +0.5%/yr)
 * @param {number} params.annualSpend            in retirement (real dollars)
 * @param {number} params.spendGrowthRate        per-year real change (e.g. -0.005 shrinks spending 0.5%/yr)
 * @param {number} params.stockPct               0-1
 * @param {number} params.socialSecurity         annual PIA at FRA 67, real — the claiming-age
 *                                               factor (70% at 62 … 124% at 70) is applied here
 * @param {number} params.ssStartAge
 * @param {Array}  params.engagements            work income as {label, hoursPerWeek, rate,
 *                                               weeksPerYear, annualAmount, throughAge}; when
 *                                               present, replaces retireAge/annualContribution
 *                                               (income is taxed as 1099, surplus × savingsRate
 *                                               is invested, deficits draw from the portfolio)
 * @param {number} params.savingsRate            share of work surplus invested (default 0.6)
 * @param {number} params.healthPre65            health premiums/yr before 65 (on top of spend)
 * @param {number} params.healthPost65           health premiums/yr from 65 (on top of spend)
 * @param {number} params.ventureAnnual          venture (Folio) budget/yr on top of spend
 * @param {number} params.ventureYears           years the venture budget runs, from year 1
 * @param {number} params.withdrawalTaxRate       blended tax on portfolio draws (0–0.35). ~80% of
 *                                                the portfolio is pre-tax IRA/SEP/TIAA, so a net
 *                                                dollar of spending costs ~1/(1-rate) gross —
 *                                                0.20 is a fair blend; 0 reproduces old behavior
 * @param {number} params.stockMean / .stockStdev override the stock return assumption
 * @param {Array}  params.lumpSums               [{age, amount}] one-time income events (e.g. inheritance)
 * @param {number} params.runs
 */
export function simulate({
  startAge = 40,
  retireAge = 65,
  endAge = 95,
  startingBalance = 0,
  annualContribution = 0,
  contributionGrowthRate = 0,
  annualSpend = 0,
  spendGrowthRate = 0,
  stockPct = 0.7,
  socialSecurity = 0,
  ssStartAge = 67,
  lumpSums = [],
  engagements = null,
  savingsRate = 0.6,
  healthPre65 = 0,
  healthPost65 = 0,
  ventureAnnual = 0,
  ventureYears = 0,
  withdrawalTaxRate = 0,
  stockMean,
  stockStdev,
  runs = 1000,
}) {
  const years = endAge - startAge + 1;
  const hasWork = Array.isArray(engagements) && engagements.length > 0;
  const workNet = hasWork ? buildWorkNet(engagements, startAge, endAge) : null;
  const ssAnnual = (socialSecurity || 0) * ssFactor(ssStartAge);
  const ages = Array.from({ length: years }, (_, i) => startAge + i);
  const paths = [];
  let successes = 0;

  // Index lump-sum events by age
  const lumpByAge = {};
  for (const l of lumpSums) {
    if (!l?.age || !l?.amount) continue;
    lumpByAge[l.age] = (lumpByAge[l.age] || 0) + Number(l.amount);
  }

  for (let r = 0; r < runs; r++) {
    let bal = startingBalance;
    const path = [bal];
    let depleted = false;

    for (let i = 1; i < years; i++) {
      const age = startAge + i;
      const ret = sampleReturn(stockPct, stockMean, stockStdev);
      bal = bal * (1 + ret);

      const health = age < 65 ? healthPre65 : healthPost65;
      const venture = i <= ventureYears ? ventureAnnual : 0;
      const ss = age >= ssStartAge ? ssAnnual : 0;

      if (hasWork) {
        // Engagement mode: work income (already after-tax) offsets spending every
        // year; surplus is partially invested, deficits draw from the portfolio.
        const spend = annualSpend * Math.pow(1 + spendGrowthRate, i) + health + venture;
        const net = (workNet[age] || 0) + ss - spend;
        // Deficits come out of the portfolio grossed-up for taxes on the draw.
        bal += net > 0 ? net * savingsRate : net / (1 - withdrawalTaxRate);
      } else if (age < retireAge) {
        const yearsContributing = i;
        const contrib = annualContribution * Math.pow(1 + contributionGrowthRate, yearsContributing);
        bal += contrib - health - venture;
      } else {
        const yearsRetired = age - retireAge;
        const spend = annualSpend * Math.pow(1 + spendGrowthRate, yearsRetired) + health + venture;
        bal -= Math.max(0, spend - ss) / (1 - withdrawalTaxRate);
      }

      // Apply one-time events (inheritance, windfall, etc.)
      if (lumpByAge[age]) bal += lumpByAge[age];

      if (bal <= 0) {
        bal = 0;
        depleted = true;
      }
      path.push(bal);
    }

    if (!depleted) successes++;
    paths.push(path);
  }

  // Percentiles per year
  const p10 = [], p50 = [], p90 = [];
  for (let i = 0; i < years; i++) {
    const col = paths.map(p => p[i]).sort((a, b) => a - b);
    p10.push(col[Math.floor(runs * 0.10)]);
    p50.push(col[Math.floor(runs * 0.50)]);
    p90.push(col[Math.floor(runs * 0.90)]);
  }

  const finalCol = paths.map(p => p[years - 1]).sort((a, b) => a - b);
  return {
    paths, ages,
    successRate: successes / runs,
    percentiles: { p10, p50, p90 },
    medianEndBalance: finalCol[Math.floor(runs * 0.50)],
    p10EndBalance: finalCol[Math.floor(runs * 0.10)],
    p90EndBalance: finalCol[Math.floor(runs * 0.90)],
  };
}
