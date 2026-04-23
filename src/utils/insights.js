// Rule-driven insights for the "This month" action card on Dashboard.
// Each rule returns null if not triggered, or { severity, title, body, action }.
// severity: 'warn' | 'info' | 'good'

import { classifyHolding } from './assetClass';
import { computeSectorTotals } from './sectorMap';

export function cashRunwayMonths({ accounts, monthlySpend }) {
  if (!monthlySpend) return null;
  const cash = accounts
    .filter(a => a.type === 'depository')
    .reduce((s, a) => s + (a.balance || 0), 0);
  return cash / monthlySpend;
}

export function estimatedMonthlySpend(recentTxns) {
  // Average of top-3 recent months (ignores partial current month)
  const byMonth = {};
  for (const t of recentTxns) {
    if (!t.date || t.category === 'transfer' || t.amount <= 0) continue;
    const m = t.date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + t.amount;
  }
  const months = Object.values(byMonth).sort((a, b) => b - a).slice(0, 3);
  if (!months.length) return null;
  return months.reduce((s, v) => s + v, 0) / months.length;
}

export function withdrawalRate({ netWorth, investmentsTotal, annualSpend, annualIncome = 0 }) {
  const denom = investmentsTotal || netWorth;
  if (!denom || !annualSpend) return null;
  const portfolioDraw = Math.max(0, annualSpend - annualIncome);
  return portfolioDraw / denom;
}

export function generateInsights({
  holdings,
  accounts,
  investmentsTotal,
  netWorth,
  recentTxns,
  data,
  monthlySpend,
}) {
  const rules = [];

  // 1. Cash runway
  const runway = cashRunwayMonths({ accounts, monthlySpend });
  if (runway !== null) {
    const target = data?.preferences?.emergencyMonths || 6;
    if (runway < target) {
      rules.push({
        severity: 'warn',
        title: `Cash buffer below ${target} months`,
        body: `${runway.toFixed(1)} months of spending in cash. Target is ${target}+ months.`,
        action: `Move from bonds or trim discretionary spending to rebuild.`,
      });
    } else if (runway > target * 3) {
      rules.push({
        severity: 'info',
        title: `Cash buffer is ${runway.toFixed(0)} months — above target`,
        body: `Excess cash earning near-zero real returns. At 4% HYSA vs 7% real stock, that's ${Math.round((runway - target) * monthlySpend * 0.03).toLocaleString()} / yr of forgone return.`,
        action: `Consider investing the excess above ${target * monthlySpend >= 1000 ? '$' + Math.round(target * monthlySpend).toLocaleString() : 'target'}.`,
      });
    }
  }

  // 2. Sector concentration
  if (holdings.length && investmentsTotal) {
    const { totals, totalStock } = computeSectorTotals(holdings, classifyHolding);
    if (totalStock > 0) {
      const hot = Object.entries(totals)
        .map(([s, v]) => ({ sector: s, pct: v / totalStock, value: v }))
        .filter(r => r.pct > 0.30)
        .sort((a, b) => b.pct - a.pct);
      if (hot.length) {
        const top = hot[0];
        rules.push({
          severity: 'warn',
          title: `${top.sector} is ${Math.round(top.pct * 100)}% of stock sleeve`,
          body: `Single-sector concentration increases volatility. Rule of thumb: cap at 30%.`,
          action: `On a strong market day, trim toward broad index funds (VTI, VOO, VTSAX).`,
        });
      }
    }
  }

  // 3. Single-security concentration (non-index)
  if (investmentsTotal) {
    const INDEX_TICKERS = new Set(['VTI','VOO','VTSAX','VXUS','BND','AGG','VFIAX','FXAIX','SPY','IVV','FSKAX','SWTSX','ITOT']);
    const big = holdings
      .filter(h => {
        const t = (h.ticker || '').toUpperCase();
        return !INDEX_TICKERS.has(t) && (h.institutionValue || 0) / investmentsTotal > 0.10;
      })
      .sort((a, b) => (b.institutionValue || 0) - (a.institutionValue || 0));
    if (big.length) {
      const top = big[0];
      const pct = (top.institutionValue / investmentsTotal) * 100;
      rules.push({
        severity: 'warn',
        title: `${top.ticker || top.name} is ${pct.toFixed(0)}% of portfolio`,
        body: `Single-security concentration above 10% adds idiosyncratic risk.`,
        action: `Tax-aware diversification: offset in tax-advantaged accounts first.`,
      });
    }
  }

  // 4. Current month spend trending hot
  if (monthlySpend && recentTxns.length) {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const thisMonthSpend = recentTxns
      .filter(t => (t.date || '').startsWith(thisMonth) && t.amount > 0 && t.category !== 'transfer')
      .reduce((s, t) => s + t.amount, 0);
    const projected = thisMonthSpend * (daysInMonth / Math.max(1, dayOfMonth));
    if (projected > monthlySpend * 1.2 && dayOfMonth >= 10) {
      rules.push({
        severity: 'warn',
        title: `On pace for ${Math.round((projected / monthlySpend - 1) * 100)}% over baseline this month`,
        body: `${Math.round(thisMonthSpend).toLocaleString()} spent already; projected ${Math.round(projected).toLocaleString()}.`,
        action: `Review recent transactions — dining / subscriptions are common culprits.`,
      });
    }
  }

  // 5. No holdings yet (getting-started nudge)
  if (!holdings.length && accounts.length) {
    rules.push({
      severity: 'info',
      title: 'No investment holdings tracked yet',
      body: 'Holdings enable Allocation, Checkup, and Retire analyses.',
      action: 'Link a brokerage via Plaid or bulk import from your broker statement.',
    });
  }

  if (!rules.length) {
    rules.push({
      severity: 'good',
      title: 'Nothing urgent',
      body: 'Cash buffer healthy, sectors diversified, no concentration warnings.',
      action: null,
    });
  }

  return rules;
}
