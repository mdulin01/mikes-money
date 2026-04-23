import { useMemo, useState } from 'react';
import { money, pct } from '../utils/format';

export default function Holdings({ holdings, accounts, investmentsTotal }) {
  const [groupBy, setGroupBy] = useState('account'); // 'account' | 'type' | 'ticker'

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map(a => [a.id, a])),
    [accounts],
  );

  const groups = useMemo(() => {
    const g = {};
    for (const h of holdings) {
      let key;
      if (groupBy === 'account') key = accountById[h.accountId]?.name || 'Unknown account';
      else if (groupBy === 'type') key = h.type || 'Other';
      else key = h.ticker || h.name || h.securityId;
      if (!g[key]) g[key] = { key, items: [], total: 0 };
      g[key].items.push(h);
      g[key].total += h.institutionValue || 0;
    }
    return Object.values(g).sort((a, b) => b.total - a.total);
  }, [holdings, groupBy, accountById]);

  const costBasisTotal = holdings.reduce((s, h) => s + (h.costBasis || 0), 0);
  const unrealized = costBasisTotal > 0 ? investmentsTotal - costBasisTotal : null;

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Holdings</h1>
          <p className="text-slate-400 text-sm">
            {holdings.length} positions · {money(investmentsTotal)}
            {unrealized !== null && (
              <> · unrealized {money(unrealized)} ({pct(unrealized / costBasisTotal)})</>
            )}
          </p>
        </div>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="account">Group: Account</option>
          <option value="type">Group: Type</option>
          <option value="ticker">Group: Ticker</option>
        </select>
      </header>

      {holdings.length === 0 && (
        <p className="text-slate-500 text-sm bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
          No holdings yet. Link a brokerage or retirement account — Plaid's Investments product
          pulls positions, quantities, and cost basis when the bank supports it.
        </p>
      )}

      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.key} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2 flex justify-between items-center bg-slate-800/60 border-b border-slate-700/60">
              <div className="font-medium text-slate-200">{g.key}</div>
              <div className="mono-nums text-emerald-400">{money(g.total)}</div>
            </div>
            <ul className="divide-y divide-slate-700/60">
              {g.items.map(h => {
                const pnl = (h.costBasis != null) ? h.institutionValue - h.costBasis : null;
                const pnlPct = (h.costBasis > 0) ? pnl / h.costBasis : null;
                return (
                  <li key={h.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="truncate">
                        <span className="font-mono text-emerald-300">{h.ticker || '—'}</span>
                        <span className="text-slate-400 ml-2 text-xs">{h.name}</span>
                      </div>
                      <div className="text-slate-500 text-xs">
                        {h.quantity?.toFixed(4)} units
                        {h.institutionPrice ? ` @ ${money(h.institutionPrice, { cents: true })}` : ''}
                        {h.type ? ` · ${h.type}` : ''}
                      </div>
                    </div>
                    {pnl !== null && (
                      <div className={`text-xs mono-nums ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pnl >= 0 ? '+' : ''}{money(pnl)}{pnlPct != null ? ` (${pct(pnlPct)})` : ''}
                      </div>
                    )}
                    <div className="w-24 text-right mono-nums">{money(h.institutionValue)}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
