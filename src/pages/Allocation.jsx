import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ComposedChart, Line } from 'recharts';
import { money, pct } from '../utils/format';
import { ASSET_CLASSES, classifyHolding, allocateHoldings, targetAllocation } from '../utils/assetClass';
import { simulate } from '../utils/monteCarlo';
import { computeAge } from '../utils/dateUtils';
import { USER_PROFILE } from '../constants';

const CURRENT_AGE = computeAge(USER_PROFILE.birthdate) ?? 50;

// Preset allocation scenarios (stock / bond split)
const PRESETS = [
  { id: 'aggressive',   label: 'Aggressive',   stockPct: 0.90, bondPct: 0.10, description: '90/10 — max growth, max volatility' },
  { id: 'growth',       label: 'Growth',       stockPct: 0.80, bondPct: 0.20, description: '80/20 — typical pre-retirement' },
  { id: 'moderate',     label: 'Moderate',     stockPct: 0.70, bondPct: 0.30, description: '70/30 — near-retirement default' },
  { id: 'balanced',     label: 'Balanced',     stockPct: 0.60, bondPct: 0.40, description: '60/40 — classic split' },
  { id: 'conservative', label: 'Conservative', stockPct: 0.50, bondPct: 0.50, description: '50/50 — income-forward' },
  { id: 'defensive',    label: 'Defensive',    stockPct: 0.40, bondPct: 0.60, description: '40/60 — late retirement' },
];

export default function Allocation({ holdings, investmentsTotal, data, netWorth }) {
  const [yearsToRetirement, setYears] = useState(() => data?.preferences?.yearsToRetirement || 20);

  const allocation = useMemo(() => allocateHoldings(holdings), [holdings]);
  const target = useMemo(() => targetAllocation(yearsToRetirement), [yearsToRetirement]);

  // Current actual stock% — exclude cash, treat real_estate + alternative + crypto as equity-like
  const currentStockPct = useMemo(() => {
    const equity = allocation
      .filter(a => ['us_stock', 'intl_stock', 'real_estate', 'alternative', 'crypto'].includes(a.id))
      .reduce((s, a) => s + a.value, 0);
    const bonds = allocation
      .filter(a => ['us_bond', 'intl_bond'].includes(a.id))
      .reduce((s, a) => s + a.value, 0);
    const denom = equity + bonds;
    return denom > 0 ? equity / denom : 0.7;
  }, [allocation]);

  // Monte Carlo across allocations using user's saved retirement inputs
  const scenarios = useMemo(() => {
    const r = data?.retirement;
    if (!r || !r.annualSpend) return null;
    const base = {
      ...r,
      startAge: CURRENT_AGE,
      startingBalance: r.startingBalance ?? (investmentsTotal || netWorth || 0),
      runs: 400,  // moderate — multiple sims on this page
    };
    const cases = [
      { id: 'current', label: 'Current', stockPct: currentStockPct, description: `${(currentStockPct * 100).toFixed(0)}/${((1 - currentStockPct) * 100).toFixed(0)} — what you actually hold today` },
      ...PRESETS,
    ];
    return cases.map(c => {
      const result = simulate({ ...base, stockPct: c.stockPct });
      return {
        ...c,
        successRate: result.successRate,
        medianEnd: result.medianEndBalance,
        p10End: result.p10EndBalance,
        p90End: result.p90EndBalance,
      };
    });
  }, [data?.retirement, investmentsTotal, netWorth, currentStockPct]);

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

          {/* Monte Carlo across allocation scenarios */}
          {scenarios ? (
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-slate-300">Allocation impact on retirement outcome</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Each scenario runs {400} Monte Carlo simulations using your saved retirement plan (age {CURRENT_AGE} → {data.retirement?.endAge || 90}, spend {money(data.retirement?.annualSpend || 0)}/yr, SS at {data.retirement?.ssStartAge || 63}).
                  Only the stock / bond split changes.
                </p>
              </div>

              {/* Bar chart of success rates */}
              <div className="h-56 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scenarios} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="label" stroke="#94a3b8" style={{ fontSize: 11 }} angle={-15} textAnchor="end" height={50} />
                    <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                    <Tooltip
                      formatter={(v, _k, item) => [pct(v, 0), 'Success rate']}
                      labelFormatter={(l) => `${l} (${Math.round((scenarios.find(s => s.label === l)?.stockPct || 0) * 100)}/${Math.round((1 - (scenarios.find(s => s.label === l)?.stockPct || 0)) * 100)})`}
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    />
                    <Bar dataKey="successRate">
                      {scenarios.map((s, i) => (
                        <Cell key={i}
                          fill={s.id === 'current' ? '#f59e0b' : s.successRate >= 0.9 ? '#10b981' : s.successRate >= 0.75 ? '#3b82f6' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table with detail */}
              <ul className="divide-y divide-slate-700/60 text-sm">
                <li className="py-2 flex items-center text-xs text-slate-500 uppercase tracking-wide">
                  <span className="flex-1">Scenario</span>
                  <span className="w-16 text-right">Stocks</span>
                  <span className="w-20 text-right">Success</span>
                  <span className="w-24 text-right">Median</span>
                  <span className="w-24 text-right">p10 (bad)</span>
                  <span className="w-24 text-right">p90 (good)</span>
                </li>
                {scenarios.map(s => {
                  const isCurrent = s.id === 'current';
                  return (
                    <li key={s.id} className={`py-2 flex items-center ${isCurrent ? 'bg-amber-950/20 -mx-4 px-4 rounded' : ''}`}>
                      <span className="flex-1">
                        <span className="text-slate-200">{s.label}</span>
                        {isCurrent && <span className="text-[10px] ml-2 px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded">you</span>}
                        <div className="text-[11px] text-slate-500">{s.description}</div>
                      </span>
                      <span className="mono-nums w-16 text-right text-slate-400">{Math.round(s.stockPct * 100)}%</span>
                      <span className={`mono-nums w-20 text-right font-medium ${s.successRate >= 0.9 ? 'text-emerald-400' : s.successRate >= 0.75 ? 'text-amber-300' : 'text-rose-400'}`}>
                        {pct(s.successRate, 0)}
                      </span>
                      <span className="mono-nums w-24 text-right">{money(s.medianEnd)}</span>
                      <span className="mono-nums w-24 text-right text-rose-400">{money(s.p10End)}</span>
                      <span className="mono-nums w-24 text-right text-emerald-400">{money(s.p90End)}</span>
                    </li>
                  );
                })}
              </ul>

              {/* Takeaway */}
              <div className="mt-3 pt-3 border-t border-slate-700/60 text-xs text-slate-400 space-y-1">
                {(() => {
                  const current = scenarios.find(s => s.id === 'current');
                  const best = [...scenarios].filter(s => s.id !== 'current').sort((a, b) => b.successRate - a.successRate)[0];
                  const safest = [...scenarios].sort((a, b) => a.p10End - b.p10End).at(-1);
                  if (!current || !best) return null;
                  return (
                    <>
                      <p>
                        <span className="text-amber-400">Your current {Math.round(current.stockPct * 100)}/{Math.round((1 - current.stockPct) * 100)} portfolio</span>:
                        success rate {pct(current.successRate, 0)}, median {money(current.medianEnd)}, p10 {money(current.p10End)}.
                      </p>
                      <p>
                        <span className="text-emerald-400">Highest success rate</span>: {best.label} ({Math.round(best.stockPct * 100)}/{Math.round((1 - best.stockPct) * 100)}) at {pct(best.successRate, 0)}.
                      </p>
                      <p>
                        <span className="text-sky-400">Best downside protection (highest p10)</span>: {safest.label} ({Math.round(safest.stockPct * 100)}/{Math.round((1 - safest.stockPct) * 100)}) — p10 of {money(safest.p10End)}.
                      </p>
                      <p className="text-slate-500 pt-1">
                        Rule of thumb: higher stock % → higher expected return but wider p10-p90 spread (more luck-dependent).
                        Lower stock % → lower variance but may fail to outrun withdrawals.
                      </p>
                    </>
                  );
                })()}
              </div>
            </section>
          ) : (
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-sm text-slate-400">
                Save your retirement inputs on the Retire tab to see how different allocations would have affected
                your Monte Carlo success rate.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
