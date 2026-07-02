// Amortization + refinance math. Real loan terms, nominal dollars.

// Standard payment for principal P, annual rate r, n months.
export function monthlyPI(P, annualRate, months) {
  if (!P || !annualRate || !months) return 0;
  const i = annualRate / 12;
  return P * i / (1 - Math.pow(1 + i, -months));
}

export function monthsUntil(dateStr, from = new Date()) {
  if (!dateStr) return null;
  const [y, m] = dateStr.split('-').map(Number);
  return Math.max(1, (y - from.getFullYear()) * 12 + (m - 1 - from.getMonth()));
}

// Project a loan's balance forward given a fixed monthly payment (extra allowed).
// Returns { points: [{month, balance}], months, totalInterest }.
export function project(balance, annualRate, monthlyPayment, maxMonths = 480) {
  const i = annualRate / 12;
  let bal = balance, totalInterest = 0;
  const points = [{ month: 0, balance: Math.round(bal) }];
  let m = 0;
  while (bal > 0.01 && m < maxMonths) {
    m++;
    const interest = bal * i;
    totalInterest += interest;
    bal = Math.max(0, bal + interest - monthlyPayment);
    if (m % 6 === 0 || bal <= 0.01) points.push({ month: m, balance: Math.round(bal) });
  }
  return { points, months: m, totalInterest };
}

// Refinance comparison: keep paying the same TOTAL monthly amount vs the new required
// payment. closingCosts can be financed (rolled into the new balance).
export function refiCompare({ balance, rate, monthlyPayment, newRate, newTermMonths, closingCosts = 0, financeCosts = true }) {
  const current = project(balance, rate, monthlyPayment);
  const newBalance = balance + (financeCosts ? closingCosts : 0);
  const newPI = monthlyPI(newBalance, newRate, newTermMonths);
  const refi = project(newBalance, newRate, newPI, newTermMonths + 1);
  const monthlySavings = monthlyPayment - newPI;
  const upfront = financeCosts ? 0 : closingCosts;
  const breakevenMonths = monthlySavings > 0 ? Math.ceil((upfront + (financeCosts ? closingCosts : 0)) / monthlySavings) : null;
  return {
    newPI,
    monthlySavings,
    breakevenMonths,
    currentTotalInterest: current.totalInterest,
    refiTotalInterest: refi.totalInterest,
    lifetimeInterestDelta: current.totalInterest - refi.totalInterest,
    currentMonths: current.months,
    refiMonths: refi.months,
  };
}
