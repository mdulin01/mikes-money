import { useMemo, useState } from 'react';
import { money } from '../utils/format';
import { toLocalMonthStr, monthStart, monthEnd } from '../utils/dateUtils';

export default function Budgets({ data, recentTxns, setBudget, deleteBudget }) {
  const [month, setMonth] = useState(toLocalMonthStr());
  const categories = (data?.categories || []).filter(c => c.kind === 'expense');
  const budgets = data?.budgets?.[month] || {};

  // Actual spend per category for this month
  const actual = useMemo(() => {
    const start = monthStart(month);
    const end = monthEnd(month);
    const map = {};
    for (const t of recentTxns) {
      if (!t.date || t.date < start || t.date > end) continue;
      if (t.amount <= 0) continue;
      if (t.category === 'transfer') continue;
      const key = t.category || 'uncategorized';
      map[key] = (map[key] || 0) + t.amount;
    }
    return map;
  }, [recentTxns, month]);

  const totalBudget = Object.values(budgets).reduce((s, v) => s + (v || 0), 0);
  const totalActual = Object.values(actual).reduce((s, v) => s + v, 0);

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="text-slate-400 text-sm">{month} · {money(totalActual)} of {money(totalBudget)}</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        />
      </header>

      <ul className="bg-slate-800 border border-slate-700 rounded-xl divide-y divide-slate-700/60">
        {categories.map(c => {
          const budget = budgets[c.id] || 0;
          const spent = actual[c.id] || 0;
          const pct = budget > 0 ? Math.min(1, spent / budget) : 0;
          const over = spent > budget && budget > 0;
          return (
            <li key={c.id} className="px-4 py-3">
              <div className="flex items-center gap-3 text-sm mb-1">
                <span className="flex-1">{c.emoji} {c.label}</span>
                <span className={`mono-nums ${over ? 'text-rose-400' : 'text-slate-300'}`}>
                  {money(spent)} /
                </span>
                <input
                  type="number"
                  defaultValue={budget || ''}
                  placeholder="—"
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!v) deleteBudget(month, c.id);
                    else if (v !== budget) setBudget(month, c.id, v);
                  }}
                  className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right mono-nums text-sm"
                />
              </div>
              {budget > 0 && (
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${over ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.max(2, pct * 100)}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-slate-500">
        Tip: set a budget per category per month. Unused categories don't count. Transfers are excluded.
      </p>
    </main>
  );
}
