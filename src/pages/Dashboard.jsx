import { useMemo } from 'react';
import { money, signedMoney, pnlClass, pct } from '../utils/format';
import { toLocalMonthStr } from '../utils/dateUtils';
import { ACCOUNT_TYPES } from '../constants';
import NetWorthChart from '../components/NetWorthChart';
import NetWorthBreakdown from '../components/NetWorthBreakdown';
import { simulate } from '../utils/monteCarlo';
import { generateInsights, cashRunwayMonths, estimatedMonthlySpend } from '../utils/insights';
import { actualDrawStats } from '../utils/cashflow';
import { makeCatOf } from '../utils/classify';
import { useMarketQuotes } from '../hooks/useMarketQuotes';
import { useDailySnapshot } from '../hooks/useDailySnapshot';
import { useRangeTxns } from '../hooks/useRangeTxns';
import { monthStart } from '../utils/dateUtils';
import PaycheckCard from '../components/PaycheckCard';

export default function Dashboard({ data, accounts, recentTxns, holdings, netWorth, investmentsTotal, currentMonthSpend, flows, netWorthHistory, snapshotHistory, catOf, acctById }) {
  const month = toLocalMonthStr();
  const dayOfMonth = new Date().getDate();

  // Group accounts by asset side
  const byType = useMemo(() => {
    const groups = {};
    for (const t of ACCOUNT_TYPES) groups[t.id] = { ...t, total: 0, items: [] };
    for (const a of accounts) {
      const group = groups[a.type] || groups.other;
      group.items.push(a);
      group.total += a.balance || 0;
    }
    for (const a of (data?.manualAccounts || [])) {
      const t = a.type || 'other';
      const group = groups[t] || groups.other;
      group.items.push({ ...a, manual: true });
      group.total += a.balance || 0;
    }
    return Object.values(groups).filter(g => g.items.length);
  }, [accounts, data]);

  // Month cash-flow buckets from useMoneyData (utils/cashflow.js): earned income only —
  // IRA draws + credit-card refunds are broken out separately so they can't inflate the rate.
  const monthIncome = flows?.earned || 0;

  // Lookup table for accountId → account display info
  const accountById = useMemo(
    () => Object.fromEntries(accounts.map(a => [a.id, a])),
    [accounts],
  );

  const accountLabel = (t) => {
    const a = accountById[t.accountId];
    if (!a) return null;
    const inst = a.institution || a.name || 'Account';
    const tail = a.mask ? `····${a.mask}` : '';
    return `${inst}${tail ? ' ' + tail : ''}`;
  };

  const savingsRate = flows?.savingsRate || 0;
  // Income coverage — the decumulation headline: did this month's work cover
  // this month's life? Under 100% isn't failure; it says how much of the month
  // the portfolio carried, which some months is the plan.
  const coverage = (flows?.spend || 0) > 0 ? (flows?.earned || 0) / flows.spend : null;

  const assets = byType.filter(g => g.side === 'asset').reduce((s, g) => s + g.total, 0);
  const liabilities = byType.filter(g => g.side === 'liability').reduce((s, g) => s + g.total, 0);

  // === Actual withdrawal pace — measured over a 12-month window, not planned ===
  const yearAgo = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 11);
    return monthStart(toLocalMonthStr(d));
  }, []);
  const yearTxns = useRangeTxns(yearAgo);
  const draw = useMemo(() => {
    const src = yearTxns ?? recentTxns;
    const c = yearTxns ? makeCatOf(yearTxns, accountById, data?.userRules) : catOf;
    return actualDrawStats(src, c || ((t) => t.category), investmentsTotal);
  }, [yearTxns, recentTxns, accountById, data?.userRules, catOf, investmentsTotal]);

  // === Retirement readiness (fast Monte Carlo) ===
  const readiness = useMemo(() => {
    const r = data?.retirement;
    if (!r || !r.annualSpend) return null;
    const sim = simulate({
      ...r,
      startingBalance: r.startingBalance ?? (investmentsTotal || netWorth || 0),
      runs: 250,  // smaller for dashboard perf
    });
    return { successRate: sim.successRate };
  }, [data?.retirement, investmentsTotal, netWorth]);

  const avgMonthlySpend = useMemo(() => estimatedMonthlySpend(recentTxns, catOf), [recentTxns, catOf]);
  // Unpaid invoices are near-cash for a consultant — count them in runway.
  const receivables = useMemo(
    () => (data?.business?.invoices || [])
      .filter(i => ['drafted', 'draft', 'sent'].includes(i.status))
      .reduce((s, i) => s + (i.amount || 0), 0),
    [data?.business?.invoices],
  );
  const runway = useMemo(
    () => cashRunwayMonths({ accounts, monthlySpend: avgMonthlySpend, receivables }),
    [accounts, avgMonthlySpend, receivables],
  );

  // === Live market quotes for the strong-day rebalance prompt ===
  const watchTickers = useMemo(() => {
    // Pull tickers for any holding > 5% of investments + always SPY/QQQ for market context
    const interesting = holdings
      .filter(h => h.ticker && h.institutionValue && investmentsTotal && h.institutionValue / investmentsTotal > 0.05)
      .map(h => h.ticker.toUpperCase());
    return [...new Set([...interesting, 'SPY', 'QQQ'])];
  }, [holdings, investmentsTotal]);

  const { quotes: marketQuotes, fetchedAt: quotesFetchedAt } = useMarketQuotes(watchTickers);

  // === Actionable insights ===
  const insights = useMemo(
    () => generateInsights({
      catOf,
      holdings, accounts, investmentsTotal, netWorth, recentTxns, netWorthHistory, data,
      monthlySpend: avgMonthlySpend, marketQuotes,
    }),
    [holdings, accounts, investmentsTotal, netWorth, recentTxns, netWorthHistory, data, avgMonthlySpend, marketQuotes],
  );

  // === Daily snapshot writer (for Rupert) ===
  // Idempotent: writes once per local day. No-op if today's doc already exists.
  useDailySnapshot({
    data,
    accounts,
    netWorth,
    assets,
    liabilities,
    savingsRate,
    monthIncome,
    currentMonthSpend,
    retirementSuccess: readiness?.successRate ?? null,
    withdrawalRate: draw.rate,
    cashRunwayMonths: runway,
    coverage,
    withdrawalRateActual: draw.rate,
    receivables,
    avgMonthlySpend,
    byType,
    investmentsTotal,
    holdings,
    insights,
    netWorthHistory,
  });

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-400 text-sm">{month}</p>
      </header>

      {/* Headline numbers — decumulation-first: coverage, measured withdrawal, runway.
          Savings rate is demoted to the month card below; a 25% savings target is a
          saver's scoreboard, and drawing on the portfolio some months is the plan. */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Net worth" value={money(netWorth)} big className="col-span-2 lg:col-span-1" tone={pnlClass(netWorth)} />
        <Tile
          label="Income coverage (mo)"
          value={coverage == null ? '—' : `${Math.round(coverage * 100)}%`}
          tone={coverage == null ? 'text-slate-400' : coverage >= 1 ? 'text-emerald-400' : 'text-slate-100'}
          hint={coverage == null ? 'No spend yet this month'
            : coverage >= 1 ? 'Work covered the month — surplus invested'
            : `Portfolio carried ${money(Math.max(0, (flows?.spend || 0) - (flows?.earned || 0)))} of the month`}
        />
        <Tile
          label="Withdrawal rate (ttm)"
          value={draw.rate != null && draw.annual > 0 ? pct(draw.rate, 1) : draw.annual === 0 ? '0%' : '—'}
          tone={draw.rate == null || draw.annual === 0 ? 'text-emerald-400' : draw.rate < 0.04 ? 'text-emerald-400' : draw.rate < 0.055 ? 'text-amber-400' : 'text-rose-400'}
          hint={draw.annual > 0
            ? `Measured: ${money(Math.round(draw.annual))}/yr of actual draws ÷ investable (${Math.round(draw.months)} mo window)`
            : 'No portfolio draws in the window'}
        />
        <Tile
          label="Runway"
          value={runway ? `${runway.toFixed(1)} mo` : '—'}
          tone={runway ? (runway >= (data?.preferences?.emergencyMonths || 6) ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-400'}
          hint={avgMonthlySpend
            ? `Cash${receivables > 0 ? ` + ${money(receivables)} unpaid invoices` : ''} ÷ ${money(avgMonthlySpend)} avg spend`
            : 'Need transaction history'}
        />
      </section>

      {/* This month's paycheck — settle the month, price the gap in hours and rate */}
      <PaycheckCard flows={flows} data={data} investmentsTotal={investmentsTotal} />

      {/* Retirement readiness + balance-sheet summary */}
      {readiness && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Tile
            label="Retirement success"
            value={pct(readiness.successRate, 0)}
            tone={readiness.successRate >= 0.9 ? 'text-emerald-400' : readiness.successRate >= 0.75 ? 'text-amber-400' : 'text-rose-400'}
            hint={`Monte Carlo survival probability to age ${data?.retirement?.endAge || 90}`}
          />
          <Tile label="Assets" value={money(assets)} tone="text-emerald-400" />
          <Tile label="Liabilities" value={money(-liabilities)} tone="text-rose-400" />
        </section>
      )}

      {/* This month's action items */}
      <ThisMonthCard insights={insights} />

      {/* Net worth history */}
      <NetWorthChart history={netWorthHistory} currentNetWorth={netWorth} />

      {/* Empower-style component breakdown + per-component trend */}
      <NetWorthBreakdown byType={byType} snapshotHistory={snapshotHistory} />

      {/* Asset/liability breakdown */}
      <section className="grid md:grid-cols-2 gap-4">
        <Panel title="Assets">
          {byType.filter(g => g.side === 'asset').map(g => (
            <Row key={g.id} label={`${g.emoji} ${g.label}`} value={money(g.total)} />
          ))}
        </Panel>
        <Panel title="Liabilities">
          {byType.filter(g => g.side === 'liability').map(g => (
            <Row key={g.id} label={`${g.emoji} ${g.label}`} value={money(-g.total)} valueClass="text-rose-400" />
          ))}
          {byType.filter(g => g.side === 'liability').length === 0 && (
            <p className="text-slate-500 text-sm">No liabilities tracked yet.</p>
          )}
        </Panel>
      </section>

      {/* Spending */}
      <section className="grid md:grid-cols-3 gap-4">
        <Panel title="This month's spending">
          <div className="text-3xl font-bold mono-nums">{money(currentMonthSpend)}</div>
          <p className="text-slate-400 text-sm mt-1">vs {money(monthIncome)} earned income</p>
          {coverage != null && coverage >= 1 && (
            <p className="text-emerald-400/90 text-xs mt-1">Savings rate {(savingsRate * 100).toFixed(0)}% of earned income</p>
          )}
          {(flows?.retirement > 0 || flows?.refunds > 0) && (
            <div className="mt-2 pt-2 border-t border-slate-700/60 space-y-1 text-xs text-slate-400">
              {flows.retirement > 0 && (
                <div className="flex justify-between">
                  <span>🏖️ IRA distributions</span>
                  <span className="mono-nums text-sky-300">{money(flows.retirement)}</span>
                </div>
              )}
              {flows.refunds > 0 && (
                <div className="flex justify-between">
                  <span>↩︎ Card refunds (netted vs spend)</span>
                  <span className="mono-nums text-slate-300">{money(flows.refunds)}</span>
                </div>
              )}
            </div>
          )}
        </Panel>
        <Panel title="Recent transactions" className="md:col-span-2">
          {recentTxns.length === 0 && <p className="text-slate-500 text-sm">No transactions yet. Link an account to sync.</p>}
          <ul className="divide-y divide-slate-700/60">
            {recentTxns.slice(0, 8).map(t => {
              const acct = accountLabel(t);
              return (
                <li key={t.id} className="flex justify-between py-2 text-sm">
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="text-slate-200 truncate">{t.merchantName || t.name || 'Transaction'}</div>
                    <div className="text-slate-500 text-xs truncate">
                      {t.date}
                      <span className="mx-1.5 text-slate-700">·</span>
                      {t.category || 'Uncategorized'}
                      {acct && (
                        <>
                          <span className="mx-1.5 text-slate-700">·</span>
                          <span className="text-slate-400">{acct}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`mono-nums shrink-0 ${t.amount < 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                    {signedMoney(-t.amount, { cents: true })}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>
    </main>
  );
}

function Tile({ label, value, big, tone = 'text-slate-100', hint, className = '' }) {
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-xl p-4 min-w-0 overflow-hidden ${className}`}>
      <div className="text-[11px] text-slate-400 uppercase tracking-wide truncate">{label}</div>
      <div
        className={`font-bold mono-nums mt-1 leading-none tracking-tight tabular-nums whitespace-nowrap ${tone}`}
        style={{ fontSize: 'clamp(1.05rem, 5vw, 1.5rem)' }}
      >{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1 truncate">{hint}</div>}
    </div>
  );
}

function ThisMonthCard({ insights }) {
  const headline = insights[0];
  const rest = insights.slice(1, 4);
  const toneClass = {
    warn: 'border-amber-900/50 text-amber-300',
    info: 'border-sky-900/50 text-sky-300',
    good: 'border-emerald-900/50 text-emerald-300',
  }[headline.severity];
  const icon = { warn: '!', info: 'i', good: '✓' }[headline.severity];

  return (
    <section className={`bg-slate-800 border ${toneClass.split(' ')[0]} rounded-xl p-4`}>
      <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">This month</div>
      <div className="flex items-start gap-3">
        <span className={`text-xl font-bold ${toneClass.split(' ')[1]}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-slate-100">{headline.title}</div>
          {headline.body && <div className="text-sm text-slate-400 mt-0.5">{headline.body}</div>}
          {headline.action && <div className="text-sm text-slate-300 mt-1">→ {headline.action}</div>}
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-slate-700/60 space-y-2 text-sm">
          {rest.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`text-xs mt-0.5 ${r.severity === 'warn' ? 'text-amber-400' : r.severity === 'info' ? 'text-sky-400' : 'text-emerald-400'}`}>
                {r.severity === 'warn' ? '!' : r.severity === 'info' ? 'i' : '✓'}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-slate-200">{r.title}</span>
                {r.action && <span className="text-slate-500"> — {r.action}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Panel({ title, children, className = '' }) {
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-xl p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-slate-300 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value, valueClass = 'text-slate-100' }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-slate-300">{label}</span>
      <span className={`mono-nums ${valueClass}`}>{value}</span>
    </div>
  );
}
