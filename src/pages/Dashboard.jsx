import { useMemo } from 'react';
import { money, signedMoney, pnlClass, pct } from '../utils/format';
import { toLocalMonthStr, monthStart } from '../utils/dateUtils';
import { ACCOUNT_TYPES } from '../constants';
import NetWorthChart from '../components/NetWorthChart';
import { simulate } from '../utils/monteCarlo';
import { generateInsights, cashRunwayMonths, estimatedMonthlySpend, withdrawalRate } from '../utils/insights';

export default function Dashboard({ data, accounts, recentTxns, holdings, netWorth, investmentsTotal, currentMonthSpend, netWorthHistory }) {
  const month = toLocalMonthStr();

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

  const monthIncome = recentTxns
    .filter(t => (t.date || '') >= monthStart(month) && t.amount < 0 && t.category !== 'transfer')
    .reduce((s, t) => s + Math.abs(t.amount), 0);

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

  const savingsRate = monthIncome > 0 ? (monthIncome - currentMonthSpend) / monthIncome : 0;

  const assets = byType.filter(g => g.side === 'asset').reduce((s, g) => s + g.total, 0);
  const liabilities = byType.filter(g => g.side === 'liability').reduce((s, g) => s + g.total, 0);

  // === Retirement readiness (fast Monte Carlo) ===
  const readiness = useMemo(() => {
    const r = data?.retirement;
    if (!r || !r.annualSpend) return null;
    const sim = simulate({
      ...r,
      startingBalance: r.startingBalance ?? (investmentsTotal || netWorth || 0),
      runs: 250,  // smaller for dashboard perf
    });
    const wRate = withdrawalRate({
      netWorth, investmentsTotal,
      annualSpend: r.annualSpend,
      annualIncome: (r.socialSecurity || 0), // very rough — doesn't include part-time work
    });
    return { successRate: sim.successRate, wRate };
  }, [data?.retirement, investmentsTotal, netWorth]);

  const avgMonthlySpend = useMemo(() => estimatedMonthlySpend(recentTxns), [recentTxns]);
  const runway = useMemo(
    () => cashRunwayMonths({ accounts, monthlySpend: avgMonthlySpend }),
    [accounts, avgMonthlySpend],
  );

  // === Actionable insights ===
  const insights = useMemo(
    () => generateInsights({
      holdings, accounts, investmentsTotal, netWorth, recentTxns, netWorthHistory, data,
      monthlySpend: avgMonthlySpend,
    }),
    [holdings, accounts, investmentsTotal, netWorth, recentTxns, netWorthHistory, data, avgMonthlySpend],
  );

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-400 text-sm">{month}</p>
      </header>

      {/* Headline numbers */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Net worth" value={money(netWorth)} big tone={pnlClass(netWorth)} />
        <Tile label="Assets" value={money(assets)} tone="text-emerald-400" />
        <Tile label="Liabilities" value={money(-liabilities)} tone="text-rose-400" />
        <Tile label="Savings rate (mo)" value={`${(savingsRate * 100).toFixed(0)}%`} tone={savingsRate >= (data?.preferences?.targetSavingsRate || 0.25) ? 'text-emerald-400' : 'text-amber-400'} />
      </section>

      {/* Retirement readiness + runway */}
      {readiness && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Tile
            label="Retirement success"
            value={pct(readiness.successRate, 0)}
            tone={readiness.successRate >= 0.9 ? 'text-emerald-400' : readiness.successRate >= 0.75 ? 'text-amber-400' : 'text-rose-400'}
            hint={`Monte Carlo survival probability to age ${data?.retirement?.endAge || 90}`}
          />
          <Tile
            label="Withdrawal rate"
            value={readiness.wRate ? pct(readiness.wRate, 1) : '—'}
            tone={(readiness.wRate || 0) < 0.04 ? 'text-emerald-400' : (readiness.wRate || 0) < 0.05 ? 'text-amber-400' : 'text-rose-400'}
            hint="Annual portfolio draw as % of investable assets"
          />
          <Tile
            label="Cash runway"
            value={runway ? `${runway.toFixed(1)} mo` : '—'}
            tone={runway ? (runway >= (data?.preferences?.emergencyMonths || 6) ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-400'}
            hint={avgMonthlySpend ? `At ${money(avgMonthlySpend)} avg monthly spend` : 'Need transaction history'}
          />
        </section>
      )}

      {/* This month's action items */}
      <ThisMonthCard insights={insights} />

      {/* Net worth history */}
      <NetWorthChart history={netWorthHistory} currentNetWorth={netWorth} />

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
          <p className="text-slate-400 text-sm mt-1">vs {money(monthIncome)} income</p>
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

function Tile({ label, value, big, tone = 'text-slate-100', hint }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`${big ? 'text-3xl md:text-4xl' : 'text-2xl'} font-bold mono-nums mt-1 ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
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
