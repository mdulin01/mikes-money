import { useMemo, useState } from 'react';
import { money } from '../utils/format';
import { toLocalMonthStr, monthStart, monthEnd } from '../utils/dateUtils';

// Retirement-target budget (realistic). Totals to ~$11K/mo baseline with slack to $13K.
const TARGET_BUDGET = {
  housing: 2000,
  utilities: 300,
  groceries: 900,
  dining: 1000,
  transport: 300,
  insurance: 360,
  health: 700,        // medical + wellness combined
  entertainment: 400,
  shopping: 600,
  travel: 2000,       // annualized $24k
  subscriptions: 200,
  gifts: 200,
  fees: 50,
  'other-exp': 2000,  // buffer
};

function nextNMonths(n, fromStr = toLocalMonthStr()) {
  const out = [];
  let [y, m] = fromStr.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export default function Budgets({ data, recentTxns, setBudget, deleteBudget, updateConfig }) {
  const [month, setMonth] = useState(toLocalMonthStr());
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyMonths, setApplyMonths] = useState(8); // May-Dec if run in May
  const [applying, setApplying] = useState(false);
  const categories = (data?.categories || []).filter(c => c.kind === 'expense');
  const budgets = data?.budgets?.[month] || {};

  const applyTarget = async () => {
    setApplying(true);
    try {
      const months = nextNMonths(applyMonths);
      const patch = {};
      for (const m of months) {
        patch[m] = { ...(data?.budgets?.[m] || {}), ...TARGET_BUDGET };
      }
      await updateConfig({ budgets: { ...(data?.budgets || {}), ...patch } });
      setApplyOpen(false);
    } catch (e) {
      console.error(e);
      alert('Failed to apply budget: ' + e.message);
    } finally {
      setApplying(false);
    }
  };

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
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="text-slate-400 text-sm">{month} · {money(totalActual)} of {money(totalBudget)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setApplyOpen(s => !s)}
            className="bg-slate-700 hover:bg-slate-600 text-slate-100 px-3 py-2 rounded-lg text-sm"
          >
            Apply target
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </header>

      {applyOpen && (
        <div className="bg-slate-800 border border-emerald-900/50 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-emerald-300">Apply retirement target budget</h2>
          <p className="text-xs text-slate-400">
            Sets baseline values for {Object.keys(TARGET_BUDGET).length} categories, total
            <span className="text-emerald-400 mx-1">
              {money(Object.values(TARGET_BUDGET).reduce((s, v) => s + v, 0))}/mo
            </span>
            across the next{' '}
            <input
              type="number"
              min="1"
              max="24"
              value={applyMonths}
              onChange={(e) => setApplyMonths(Number(e.target.value) || 1)}
              className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 mono-nums"
            />
            {' '}months. Existing values in those months for other categories are preserved.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 text-xs">
            {Object.entries(TARGET_BUDGET).map(([cat, amt]) => {
              const catDef = categories.find(c => c.id === cat);
              return (
                <div key={cat} className="flex justify-between bg-slate-900/60 rounded px-2 py-1">
                  <span className="text-slate-400">{catDef?.emoji} {catDef?.label || cat}</span>
                  <span className="mono-nums text-slate-200">{money(amt)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={applyTarget}
              disabled={applying}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
            >
              {applying ? 'Applying…' : `Apply to ${applyMonths} months`}
            </button>
            <button
              onClick={() => setApplyOpen(false)}
              className="text-slate-400 hover:text-slate-200 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
