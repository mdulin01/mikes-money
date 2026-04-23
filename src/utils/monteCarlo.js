// Monte Carlo retirement simulator.
// Independent annual returns drawn from a normal distribution based on asset mix.
// Real (inflation-adjusted) returns — so contributions and spending are in today's dollars.

// Historical real returns (very rough, long-term US):
const RETURNS = {
  stock: { mean: 0.07, stdev: 0.17 },  // US equities
  bond:  { mean: 0.02, stdev: 0.06 },  // US aggregate bonds
};

// Box-Muller for standard normal
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleReturn(stockPct) {
  const sPct = Math.max(0, Math.min(1, stockPct));
  const bPct = 1 - sPct;
  const stockR = RETURNS.stock.mean + randn() * RETURNS.stock.stdev;
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
 * @param {number} params.socialSecurity         annual, real
 * @param {number} params.ssStartAge
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
  runs = 1000,
}) {
  const years = endAge - startAge + 1;
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
      const ret = sampleReturn(stockPct);
      bal = bal * (1 + ret);

      if (age < retireAge) {
        const yearsContributing = i;
        const contrib = annualContribution * Math.pow(1 + contributionGrowthRate, yearsContributing);
        bal += contrib;
      } else {
        const yearsRetired = age - retireAge;
        const ss = age >= ssStartAge ? socialSecurity : 0;
        const spend = annualSpend * Math.pow(1 + spendGrowthRate, yearsRetired);
        bal -= Math.max(0, spend - ss);
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
