import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { money, pct } from '../utils/format';
import { ASSET_CLASSES, classifyHolding, allocateHoldings, targetAllocation } from '../utils/assetClass';

export default function Allocation({ holdings, investmentsTotal, data }) {
  const [yearsToRetirement, setYears] = useState(() => data?.preferences?.yearsToRetirement || 20);

  const allocation = useMemo(() => allocateHoldings(holdings), [holdings]);
  const target = useMemo(() => targetAllocation(yearsToRetirement), [yearsToRetirement]);

  // Concentration: any single security > 10% of total
  const concentrations = useMemo(() => {
    if (!investmentsTotal) return [];
    return holdings
      .filter(h => (h.institutionValue || 0) / investmentsTotal > 0.10)
      .sort((a, b) => (b.institutionValue || 0) - (a.institutionValue || 0))
      .map(h => ({
        ticker: h.ticker || h.name || '—',
        name: h.name,
        value: h.institutionValue,
        pct: h.institutionValue / investmentsTotal,
        class: classifyHolding(h),
      }));
  }, [holdings, investmentsTotal]);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Asset Allocation</h1>
        <p className="text-slate-400 text-sm">
          {holdings.length} positions · {money(investmentsTotal)}
        </p>
      </header>

      {holdings.length === 0 ? (
        <p className="text-slate-500 text-sm bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
          No holdings classified yet. Link a brokerage with Plaid's Investments product.
        </p>
      ) : (
        <>
          <section className="grid md:grid-cols-2 gap-4">
            {/* Pie chart */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Current allocation</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocation}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {allocation.map((c, i) => (
                        <Cell key={i} fill={c.color} stroke="#0f172a" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, _name, item) => [money(v), item.payload.label]}
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Target vs actual */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-slate-300">vs. target</h2>
                <label className="text-xs text-slate-400 flex items-center gap-2">
                  Years to retirement
                  <input
                    type="number"
                    value={yearsToRetirement}
                    onChange={(e) => setYears(Number(e.target.value))}
                    className="w-16 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-right mono-nums"
                  />
                </label>
              </div>
              <ul className="space-y-2 text-sm">
                {ASSET_CLASSES.filter(c => allocation.find(a => a.id === c.id) || target[c.id]).map(c => {
                  const current = (allocation.find(a => a.id === c.id)?.pct) || 0;
                  const goal = target[c.id] || 0;
                  const drift = current - goal;
                  const onTarget = Math.abs(drift) < 0.03;
                  return (
                    <li key={c.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                        <span className="flex-1 text-slate-200">{c.label}</span>
                        <span className="mono-nums text-slate-300 w-14 text-right">{pct(current)}</span>
                        <span className="text-slate-500 text-xs w-14 text-right">/ {pct(goal)}</span>
                        <span className={`text-xs w-12 text-right ${onTarget ? 'text-slate-500' : drift > 0 ? 'text-amber-400' : 'text-sky-400'}`}>
                          {drift > 0 ? '+' : ''}{pct(drift)}
                        </span>
                      </div>
                      <div className="h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
                        <div style={{ width: `${current * 100}%`, background: c.color }} className="h-full" />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-slate-500 mt-3">
                Target is a rough glide path (stocks heavier early, bonds heavier near retirement).
                Adjust years-to-retirement to see how the target shifts.
              </p>
            </div>
          </section>

          {concentrations.length > 0 && (
            <section className="bg-amber-950/40 border border-amber-900/60 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-amber-300 mb-2">
                ⚠ Concentration check — positions &gt;10% of portfolio
              </h2>
              <ul className="divide-y divide-amber-900/40">
                {concentrations.map(c => (
                  <li key={c.ticker} className="py-2 flex items-center text-sm">
                    <span className="font-mono text-amber-300 w-20">{c.ticker}</span>
                    <span className="flex-1 truncate text-slate-300">{c.name}</span>
                    <span className="mono-nums text-slate-200 w-28 text-right">{money(c.value)}</span>
                    <span className="mono-nums text-amber-300 w-16 text-right">{pct(c.pct)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400 mt-2">
                Rule of thumb: no single holding (other than diversified index funds) should exceed 5-10%.
                Employer stock is a common offender.
              </p>
            </section>
          )}

          <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Breakdown</h2>
            <ul className="divide-y divide-slate-700/60">
              {allocation.map(c => (
                <li key={c.id} className="py-2 flex items-center text-sm">
                  <span className="w-3 h-3 rounded-full mr-3" style={{ background: c.color }} />
                  <span className="flex-1">{c.label}</span>
                  <span className="mono-nums text-slate-400 w-16 text-right">{pct(c.pct)}</span>
                  <span className="mono-nums w-28 text-right">{money(c.value)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
