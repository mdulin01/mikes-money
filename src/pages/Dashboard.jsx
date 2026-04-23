import { useMemo } from 'react';
import { money, signedMoney, pnlClass } from '../utils/format';
import { toLocalMonthStr, monthStart } from '../utils/dateUtils';
import { ACCOUNT_TYPES } from '../constants';
import NetWorthChart from '../components/NetWorthChart';

export default function Dashboard({ data, accounts, recentTxns, netWorth, currentMonthSpend, netWorthHistory }) {
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

  const savingsRate = monthIncome > 0 ? (monthIncome - currentMonthSpend) / monthIncome : 0;

  const assets = byType.filter(g => g.side === 'asset').reduce((s, g) => s + g.total, 0);
  const liabilities = byType.filter(g => g.side === 'liability').reduce((s, g) => s + g.total, 0);

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
            {recentTxns.slice(0, 8).map(t => (
              <li key={t.id} className="flex justify-between py-2 text-sm">
                <div className="min-w-0 flex-1 pr-3 truncate">
                  <div className="text-slate-200 truncate">{t.merchantName || t.name || 'Transaction'}</div>
                  <div className="text-slate-500 text-xs">{t.date} · {t.category || 'Uncategorized'}</div>
                </div>
                <div className={`mono-nums ${t.amount < 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {signedMoney(-t.amount, { cents: true })}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </main>
  );
}

function Tile({ label, value, big, tone = 'text-slate-100' }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`${big ? 'text-3xl md:text-4xl' : 'text-2xl'} font-bold mono-nums mt-1 ${tone}`}>{value}</div>
    </div>
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
