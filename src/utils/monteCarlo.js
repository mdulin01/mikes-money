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
 * @param {number} params.endAge               usually 95
 * @param {number} params.startingBalance      today's investable assets
 * @param {number} params.annualContribution   while working (real dollars)
 * @param {number} params.annualSpend          in retirement (real dollars)
 * @param {number} params.stockPct             0-1
 * @param {number} params.socialSecurity       starts at ssStartAge
 * @param {number} params.ssStartAge
 * @param {number} params.runs
 * @returns {{paths: number[][], ages: number[], successRate: number, percentiles: {p10:number[], p50:number[], p90:number[]}, medianEndBalance: number}}
 */
export function simulate({
  startAge = 40,
  retireAge = 65,
  endAge = 95,
  startingBalance = 0,
  annualContribution = 0,
  annualSpend = 0,
  stockPct = 0.7,
  socialSecurity = 0,
  ssStartAge = 67,
  runs = 1000,
}) {
  const years = endAge - startAge + 1;
  const ages = Array.from({ length: years }, (_, i) => startAge + i);
  const paths = [];
  let successes = 0;

  for (let r = 0; r < runs; r++) {
    let bal = startingBalance;
    const path = [bal];
    let depleted = false;

    for (let i = 1; i < years; i++) {
      const age = startAge + i;
      const ret = sampleReturn(stockPct);
      bal = bal * (1 + ret);

      if (age < retireAge) {
        bal += annualContribution;
      } else {
        const ss = age >= ssStartAge ? socialSecurity : 0;
        bal -= Math.max(0, annualSpend - ss);
      }

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
