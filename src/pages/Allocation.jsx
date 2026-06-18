import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ComposedChart, AreaChart, Area, Line, ReferenceLine, LabelList, Treemap } from 'recharts';

// Shared chart theming
const CHART_BG = '#0f172a';
const GRID_STROKE = '#1e293b';
const AXIS_COLOR = '#94a3b8';
const TOOLTIP_STYLE = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#e2e8f0',
  fontSize: 12,
};
const TOOLTIP_ITEM = { color: '#e2e8f0', padding: 0 };
const TOOLTIP_LABEL = { color: '#94a3b8', marginBottom: 4, fontSize: 11 };
import { money, pct } from '../utils/format';
import { ASSET_CLASSES, classifyHolding, allocateHoldings, targetAllocation } from '../utils/assetClass';
import { computeSectorTotals, computeSectorHoldings } from '../utils/sectorMap';
import { simulate } from '../utils/monteCarlo';
import { computeAge } from '../utils/dateUtils';
import { USER_PROFILE } from '../constants';

const CURRENT_AGE = computeAge(USER_PROFILE.birthdate) ?? 50;

// Sector palette — muted mid-tones tuned for the dark theme (less glare than pure brand colors).
const SECTOR_COLORS = {
  Technology: '#cda434',
  'Communication Services': '#5b8db8',
  'Consumer Cyclical': '#9b6fb0',
  'Consumer Defensive': '#cf8a52',
  'Financial Services': '#86b06a',
  Healthcare: '#cf7088',
  Industrials: '#7a8595',
  Energy: '#cc6b63',
  Utilities: '#8a7fc0',
  'Basic Materials': '#5fb3c0',
  'Real Estate': '#c9a06a',
  Diversified: '#64748b',
};

// Readable label color (dark on light fills, light on dark fills) via relative luminance.
function labelColor(hex) {
  const c = (hex || '').replace('#', '');
  if (c.length < 6) return '#f8fafc';
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#0f172a' : '#f8fafc';
}

// Preset allocation scenarios (stock / bond split)
const PRESETS = [
  { id: 'aggressive',   label: 'Aggressive',   stockPct: 0.90, bondPct: 0.10, description: '90/10 — max growth, max volatility' },
  { id: 'growth',       label: 'Growth',       stockPct: 0.80, bondPct: 0.20, description: '80/20 — typical pre-retirement' },
  { id: 'moderate',     label: 'Moderate',     stockPct: 0.70, bondPct: 0.30, description: '70/30 — near-retirement default' },
  { id: 'balanced',     label: 'Balanced',     stockPct: 0.60, bondPct: 0.40, description: '60/40 — classic split' },
  { id: 'conservative', label: 'Conservative', stockPct: 0.50, bondPct: 0.50, description: '50/50 — income-forward' },
  { id: 'defensive',    label: 'Defensive',    stockPct: 0.40, bondPct: 0.60, description: '40/60 — late retirement' },
];

export default function Allocation({ holdings, investmentsTotal, data, netWorth, snapshotHistory = [] }) {
  // Default years-to-retirement computed from your age + planned retirement age.
  // Falls back to a saved preference if present, otherwise computes live.
  const defaultYTR = Math.max(
    0,
    (data?.retirement?.retireAge || 60) - CURRENT_AGE,
  );
  const [yearsToRetirement, setYears] = useState(
    () => data?.preferences?.yearsToRetirement ?? defaultYTR,
  );

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

  // Local state for the interactive fan chart
  const [selectedId, setSelectedId] = useState('current');

  // Monte Carlo across allocations using user's saved retirement inputs
  const scenarios = useMemo(() => {
    const r = data?.retirement;
    if (!r || !r.annualSpend) return null;
    const base = {
      ...r,
      startAge: CURRENT_AGE,
      startingBalance: r.startingBalance ?? (investmentsTotal || netWorth || 0),
      runs: 500,
    };
    const cases = [
      { id: 'current', label: 'Current', stockPct: currentStockPct, description: `${(currentStockPct * 100).toFixed(0)}/${((1 - currentStockPct) * 100).toFixed(0)} — what you actually hold today` },
      ...PRESETS,
    ];
    return cases.map(c => {
      const result = simulate({ ...base, stockPct: c.stockPct });
      return {
        ...c,
        ages: result.ages,
        percentiles: result.percentiles,
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

          <SectorBreakdown holdings={holdings} snapshotHistory={snapshotHistory} />

          <RebalancePanel allocation={allocation} target={target} investmentsTotal={investmentsTotal} />

          <AllocationOverTime snapshotHistory={snapshotHistory} />

          {/* Monte Carlo across allocation scenarios */}
          {scenarios ? (
            <AllocationScenarios
              scenarios={scenarios}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              retirementInputs={data.retirement}
              currentAge={CURRENT_AGE}
            />
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

/* -------------------- AllocationScenarios (interactive) -------------------- */

function AllocationScenarios({ scenarios, selectedId, setSelectedId, retirementInputs, currentAge }) {
  const selected = scenarios.find(s => s.id === selectedId) || scenarios[0];
  const endAge = retirementInputs?.endAge || 90;

  // Fan chart data for selected scenario
  const fanData = useMemo(() => {
    if (!selected?.ages) return [];
    return selected.ages.map((age, i) => ({
      age,
      p10: Math.round(selected.percentiles.p10[i]),
      p50: Math.round(selected.percentiles.p50[i]),
      p90: Math.round(selected.percentiles.p90[i]),
      p10to50: Math.round(selected.percentiles.p50[i] - selected.percentiles.p10[i]),
      p50to90: Math.round(selected.percentiles.p90[i] - selected.percentiles.p50[i]),
    }));
  }, [selected]);

  const best = [...scenarios].filter(s => s.id !== 'current').sort((a, b) => b.successRate - a.successRate)[0];
  const safest = [...scenarios].sort((a, b) => b.p10End - a.p10End)[0];
  const current = scenarios.find(s => s.id === 'current');

  const barFill = (s, isSelected) => {
    if (isSelected) return '#a855f7';       // purple — selected
    if (s.id === 'current') return '#f59e0b'; // amber — current
    if (s.successRate >= 0.9) return '#10b981';
    if (s.successRate >= 0.75) return '#3b82f6';
    return '#ef4444';
  };

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-200">Allocation stress test — Monte Carlo</h2>
        <p className="text-xs text-slate-500 mt-1">
          Each scenario runs 500 simulations using your saved retirement plan
          (age {currentAge} → {endAge}, spend {money(retirementInputs?.annualSpend || 0)}/yr,
          SS {money(retirementInputs?.socialSecurity || 0)}/yr at {retirementInputs?.ssStartAge || 63}).
          Click a row or bar to see its full projection cone below.
        </p>
      </div>

      {/* Success-rate bar chart with reference lines */}
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={scenarios} margin={{ top: 20, right: 24, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="label"
              stroke={AXIS_COLOR}
              tick={{ fill: AXIS_COLOR, fontSize: 11 }}
              tickLine={{ stroke: AXIS_COLOR }}
              axisLine={{ stroke: '#334155' }}
              angle={-15}
              textAnchor="end"
              height={50}
              interval={0}
            />
            <YAxis
              stroke={AXIS_COLOR}
              tick={{ fill: AXIS_COLOR, fontSize: 11 }}
              tickLine={{ stroke: AXIS_COLOR }}
              axisLine={{ stroke: '#334155' }}
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              width={44}
            />
            <ReferenceLine y={0.90} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5}
              label={{ value: 'Strong 90%', position: 'right', fill: '#10b981', fontSize: 10 }} />
            <ReferenceLine y={0.75} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5}
              label={{ value: 'Marginal 75%', position: 'right', fill: '#f59e0b', fontSize: 10 }} />
            <Tooltip
              cursor={{ fill: '#1e293b', opacity: 0.6 }}
              contentStyle={TOOLTIP_STYLE}
              itemStyle={TOOLTIP_ITEM}
              labelStyle={TOOLTIP_LABEL}
              formatter={(v, _k, item) => {
                const s = item?.payload;
                if (!s) return [pct(v, 0), 'Success'];
                return [pct(v, 0), 'Success rate'];
              }}
              labelFormatter={(label) => {
                const s = scenarios.find(x => x.label === label);
                if (!s) return label;
                return `${label}  ·  ${Math.round(s.stockPct * 100)}/${Math.round((1 - s.stockPct) * 100)}  ·  median ${money(s.medianEnd)}`;
              }}
            />
            <Bar dataKey="successRate" radius={[6, 6, 0, 0]} onClick={(d) => setSelectedId(d.id)} style={{ cursor: 'pointer' }}>
              {scenarios.map((s, i) => (
                <Cell key={i} fill={barFill(s, s.id === selectedId)} stroke={s.id === selectedId ? '#e9d5ff' : 'none'} strokeWidth={s.id === selectedId ? 2 : 0} />
              ))}
              <LabelList dataKey="successRate" position="top" fill="#e2e8f0" fontSize={11}
                formatter={(v) => pct(v, 0)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Fan chart for selected scenario */}
      <div className="bg-slate-900/50 border border-slate-700/60 rounded-lg p-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">Projection cone</div>
            <div className="text-lg font-semibold text-slate-100">
              {selected.label}
              <span className="text-sm text-slate-400 ml-2 font-normal">
                · {Math.round(selected.stockPct * 100)}/{Math.round((1 - selected.stockPct) * 100)}
              </span>
            </div>
          </div>
          <div className="flex gap-4 text-xs">
            <StatMini label="Success" value={pct(selected.successRate, 0)} tone={selected.successRate >= 0.9 ? 'text-emerald-400' : selected.successRate >= 0.75 ? 'text-amber-400' : 'text-rose-400'} />
            <StatMini label="p10" value={money(selected.p10End)} tone="text-rose-400" />
            <StatMini label="Median" value={money(selected.medianEnd)} tone="text-slate-100" />
            <StatMini label="p90" value={money(selected.p90End)} tone="text-emerald-400" />
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fanData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="coneFillAlloc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="age" stroke={AXIS_COLOR} tick={{ fill: AXIS_COLOR, fontSize: 10 }}
                tickLine={{ stroke: AXIS_COLOR }} axisLine={{ stroke: '#334155' }} />
              <YAxis stroke={AXIS_COLOR} tick={{ fill: AXIS_COLOR, fontSize: 10 }}
                tickLine={{ stroke: AXIS_COLOR }} axisLine={{ stroke: '#334155' }}
                tickFormatter={(v) => money(v)} width={72} />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={TOOLTIP_ITEM}
                labelStyle={TOOLTIP_LABEL}
                labelFormatter={(age) => `Age ${age}`}
                formatter={(v, k) => [money(v), k === 'p50' ? 'Median' : k === 'p10' ? 'Pessimistic (p10)' : 'Optimistic (p90)']}
              />
              <Area type="monotone" dataKey="p10" stackId="cone" stroke="none" fill="transparent" />
              <Area type="monotone" dataKey="p10to50" stackId="cone" stroke="none" fill="url(#coneFillAlloc)" />
              <Area type="monotone" dataKey="p50to90" stackId="cone" stroke="none" fill="url(#coneFillAlloc)" />
              <Line type="monotone" dataKey="p50" stroke="#a855f7" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="p10" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="p90" stroke="#10b981" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interactive scenario table */}
      <div className="overflow-hidden rounded-lg border border-slate-700/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/60 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left py-2 px-3 font-medium">Scenario</th>
              <th className="text-right py-2 px-2 font-medium">Split</th>
              <th className="text-right py-2 px-2 font-medium">Success</th>
              <th className="text-right py-2 px-2 font-medium">Median end</th>
              <th className="text-right py-2 px-2 font-medium">p10 (bad)</th>
              <th className="text-right py-2 px-3 font-medium">p90 (good)</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(s => {
              const isSelected = s.id === selectedId;
              const isCurrent = s.id === 'current';
              return (
                <tr
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`cursor-pointer transition-colors border-t border-slate-700/40 ${
                    isSelected ? 'bg-purple-900/30' : 'hover:bg-slate-700/30'
                  }`}
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200">{s.label}</span>
                      {isCurrent && <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded">you</span>}
                      {s.id === best?.id && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-900/50 text-emerald-300 rounded">top success</span>}
                      {s.id === safest?.id && s.id !== best?.id && <span className="text-[10px] px-1.5 py-0.5 bg-sky-900/50 text-sky-300 rounded">safest p10</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{s.description}</div>
                  </td>
                  <td className="text-right py-2 px-2 mono-nums text-slate-400">
                    {Math.round(s.stockPct * 100)}/{Math.round((1 - s.stockPct) * 100)}
                  </td>
                  <td className={`text-right py-2 px-2 mono-nums font-semibold ${
                    s.successRate >= 0.9 ? 'text-emerald-400' :
                    s.successRate >= 0.75 ? 'text-amber-300' : 'text-rose-400'
                  }`}>
                    {pct(s.successRate, 0)}
                  </td>
                  <td className="text-right py-2 px-2 mono-nums text-slate-200">{money(s.medianEnd)}</td>
                  <td className="text-right py-2 px-2 mono-nums text-rose-400">{money(s.p10End)}</td>
                  <td className="text-right py-2 px-3 mono-nums text-emerald-400">{money(s.p90End)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Interpretation */}
      <div className="text-xs text-slate-400 space-y-1.5 border-t border-slate-700/60 pt-3">
        {current && best && (
          <p>
            <span className="text-amber-400 font-medium">Current {Math.round(current.stockPct * 100)}/{Math.round((1 - current.stockPct) * 100)}</span>
            {' '}→ {pct(current.successRate, 0)} success, median {money(current.medianEnd)}, p10 {money(current.p10End)}.
          </p>
        )}
        {best && current && best.id !== 'current' && (
          <p>
            <span className="text-emerald-400 font-medium">Top success</span>: {best.label}
            {' '}({Math.round(best.stockPct * 100)}/{Math.round((1 - best.stockPct) * 100)})
            — {pct(best.successRate, 0)} success
            {best.successRate > current.successRate
              ? ` (+${pct(best.successRate - current.successRate, 1)} vs current)`
              : ''}.
          </p>
        )}
        {safest && current && safest.id !== 'current' && (
          <p>
            <span className="text-sky-400 font-medium">Safest downside</span>: {safest.label}
            {' '}({Math.round(safest.stockPct * 100)}/{Math.round((1 - safest.stockPct) * 100)})
            — p10 {money(safest.p10End)}
            {safest.p10End > current.p10End ? ` (${money(safest.p10End - current.p10End)} above current p10)` : ''}.
          </p>
        )}
        <p className="text-slate-500 pt-1">
          Higher stock % → higher expected return with wider p10–p90 band (more luck-dependent).
          Lower stock % → narrower outcomes but may fail to outpace withdrawals. The "right" answer depends on
          whether you optimize for expected value or worst-case floor.
        </p>
      </div>
    </section>
  );
}

function StatMini({ label, value, tone }) {
  return (
    <div className="text-right">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`mono-nums font-medium ${tone}`}>{value}</div>
    </div>
  );
}


/* -------------------- Sector breakdown (Empower-style) -------------------- */

function SectorCell(props) {
  const { x, y, width, height, name, value, total, root, onPick, selected } = props;
  if (!name || width <= 0 || height <= 0) return null;
  const denom = total || root?.value || 0;
  const p = denom ? value / denom : 0;
  const color = SECTOR_COLORS[name] || '#64748b';
  const txt = labelColor(color);
  const isSel = selected === name;
  const clipId = `secclip-${String(name).replace(/[^a-z0-9]/gi, '')}`;
  return (
    <g style={{ cursor: onPick ? 'pointer' : 'default' }} onClick={onPick ? () => onPick(name) : undefined}>
      <defs>
        <clipPath id={clipId}><rect x={x} y={y} width={width} height={height} /></clipPath>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill={color}
        fillOpacity={isSel ? 1 : 0.92} stroke={isSel ? '#f8fafc' : '#0f172a'} strokeWidth={isSel ? 2.5 : 2} />
      <g clipPath={`url(#${clipId})`}>
        {width > 46 && height > 18 && (
          <text x={x + 7} y={y + 16} fill={txt} fontSize={11} fontWeight={600}>{name}</text>
        )}
        {width > 46 && height > 34 && (
          <text x={x + 7} y={y + 31} fill={txt} fontSize={10} opacity={0.82}>{(p * 100).toFixed(1)}%</text>
        )}
      </g>
    </g>
  );
}

function SectorBreakdown({ holdings, snapshotHistory }) {
  const { rows, classified, diversifiedStock, totalStock, sectorHoldings } = useMemo(() => {
    const { totals, totalStock, diversifiedStock } = computeSectorTotals(holdings, classifyHolding);
    const rows = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const classified = rows.reduce((s, r) => s + r.value, 0);
    const sectorHoldings = computeSectorHoldings(holdings, classifyHolding);
    return { rows, classified, diversifiedStock, totalStock, sectorHoldings };
  }, [holdings]);
  const [sel, setSel] = useState(null);

  // 90-day drift: find the snapshot closest to ~90 days ago that has sector data.
  const priorMix = useMemo(() => {
    const hist = (snapshotHistory || []).filter(h => h.sectors && h.sectors.byS);
    if (hist.length < 2) return null;
    const target = new Date(); target.setDate(target.getDate() - 90);
    const targetStr = target.toISOString().slice(0, 10);
    const onOrBefore = hist.filter(h => h.date <= targetStr);
    const ref = onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : hist[0];
    const byS = ref.sectors.byS || {};
    const denom = Object.values(byS).reduce((s, v) => s + v, 0) || 0;
    if (!denom) return null;
    const pcts = {}; for (const [k, v] of Object.entries(byS)) pcts[k] = v / denom;
    return { date: ref.date, pcts };
  }, [snapshotHistory]);

  if (!totalStock || rows.length === 0) {
    return (
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-1">Stock sectors</h2>
        <p className="text-sm text-slate-400">No mapped single-sector or thematic funds yet — your holdings are all broadly diversified, so sector tilt isn't shown.</p>
      </section>
    );
  }

  const treeData = rows.map(r => ({ name: r.name, value: Math.round(r.value) }));

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-300">Stock sectors</h2>
        <p className="text-xs text-slate-500">
          Sector tilt from your mapped funds ({pct(classified / totalStock, 0)} of stock is sector-mapped; the rest is broad/diversified).
          {priorMix && <span> Δ columns compare to {priorMix.date}.</span>}
          <span className="text-slate-400"> Tap a box to see its holdings.</span>
        </p>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap data={treeData} dataKey="value" stroke="#0f172a" isAnimationActive={false}
            content={<SectorCell total={classified} onPick={setSel} selected={sel} />} />
        </ResponsiveContainer>
      </div>

      {sel && sectorHoldings[sel] && sectorHoldings[sel].length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: SECTOR_COLORS[sel] || '#64748b' }} />
              <span className="text-sm font-semibold text-slate-200">{sel}</span>
              <span className="text-xs text-slate-500 truncate">{money(rows.find(r => r.name === sel)?.value || 0)} · {pct((rows.find(r => r.name === sel)?.value || 0) / (classified || 1), 0)} of mapped</span>
            </div>
            <button onClick={() => setSel(null)} className="text-xs text-slate-400 hover:text-slate-200 shrink-0">✕ close</button>
          </div>
          <ul className="space-y-1">
            {sectorHoldings[sel].map((h, i) => (
              <li key={i} className="flex items-center text-sm gap-3">
                <span className="mono-nums text-slate-400 w-16 shrink-0">{h.ticker}</span>
                <span className="flex-1 text-slate-300 truncate">{h.name}</span>
                <span className="mono-nums text-slate-200 w-24 text-right shrink-0">{money(Math.round(h.value))}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500 mt-2">Each fund's estimated contribution to {sel} (fund equity value × its mapped sector weight).</p>
        </div>
      )}

      <ul className="divide-y divide-slate-700/60 text-sm">
        {rows.map(r => {
          const p = classified ? r.value / classified : 0;
          const prior = priorMix?.pcts?.[r.name];
          const drift = prior != null ? p - prior : null;
          return (
            <li key={r.name} onClick={() => setSel(sel === r.name ? null : r.name)} className={`py-2 flex items-center cursor-pointer rounded ${sel === r.name ? 'bg-slate-700/40' : 'hover:bg-slate-700/20'}`}>
              <span className="w-3 h-3 rounded-sm mr-3" style={{ background: SECTOR_COLORS[r.name] || '#64748b' }} />
              <span className="flex-1 text-slate-200">{r.name}</span>
              {drift != null && (
                <span className={`mono-nums text-xs w-16 text-right ${Math.abs(drift) < 0.01 ? 'text-slate-500' : drift > 0 ? 'text-emerald-400' : 'text-sky-400'}`}>
                  {drift > 0 ? '+' : ''}{pct(drift)}
                </span>
              )}
              <span className="mono-nums text-slate-400 w-16 text-right">{pct(p)}</span>
              <span className="mono-nums w-28 text-right">{money(r.value)}</span>
            </li>
          );
        })}
        {diversifiedStock > 0 && (
          <li className="py-2 flex items-center text-slate-500">
            <span className="w-3 h-3 rounded-sm mr-3" style={{ background: SECTOR_COLORS.Diversified }} />
            <span className="flex-1">Diversified (broad funds)</span>
            <span className="mono-nums w-28 text-right ml-auto">{money(diversifiedStock)}</span>
          </li>
        )}
      </ul>
    </section>
  );
}

/* -------------------- Quarterly rebalance panel -------------------- */

function RebalancePanel({ allocation, target, investmentsTotal }) {
  if (!investmentsTotal) return null;
  const rows = ASSET_CLASSES
    .filter(c => allocation.find(a => a.id === c.id) || target[c.id] != null)
    .map(c => {
      const cur = allocation.find(a => a.id === c.id);
      const curVal = cur?.value || 0;
      const curPct = cur?.pct || 0;
      const tgtPct = target[c.id]; // may be undefined for satellite classes
      const hasTarget = tgtPct != null;
      const tgtVal = hasTarget ? tgtPct * investmentsTotal : null;
      const move = hasTarget ? tgtVal - curVal : null;
      return { c, curVal, curPct, tgtPct, hasTarget, move };
    });
  const maxMove = Math.max(1, ...rows.filter(r => r.hasTarget).map(r => Math.abs(r.move)));
  const needsWork = rows.some(r => r.hasTarget && Math.abs(r.curPct - r.tgtPct) > 0.05);

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-300">Rebalance to target</h2>
        <span className={`text-xs px-2 py-0.5 rounded ${needsWork ? 'bg-amber-900/50 text-amber-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
          {needsWork ? 'drift > 5%' : 'on target'}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Dollar moves to bring the stock/bond/cash sleeve back to the glide-path target. Real-estate, alternatives &amp; crypto are treated as satellites (no target). Review each quarter.
      </p>
      <ul className="space-y-2 text-sm">
        {rows.map(({ c, curVal, curPct, tgtPct, hasTarget, move }) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
            <span className="flex-1 text-slate-200">{c.label}</span>
            <span className="mono-nums text-slate-300 w-14 text-right">{pct(curPct)}</span>
            <span className="text-slate-500 text-xs w-16 text-right">/ {hasTarget ? pct(tgtPct) : '—'}</span>
            <span className="w-28 text-right">
              {hasTarget
                ? <span className={`mono-nums text-xs ${Math.abs(move) < investmentsTotal * 0.01 ? 'text-slate-500' : move > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{move > 0 ? 'buy ' : 'sell '}{money(Math.abs(move))}</span>
                : <span className="text-slate-600 text-xs">satellite</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------- Allocation over time -------------------- */

function AllocationOverTime({ snapshotHistory }) {
  const data = useMemo(() => (snapshotHistory || [])
    .filter(s => Array.isArray(s.allocation) && s.allocation.length)
    .map(s => {
      const tot = s.allocation.reduce((a, b) => a + (b.value || 0), 0) || 1;
      const row = { date: s.date };
      for (const a of s.allocation) row[a.id] = (a.value || 0) / tot;
      return row;
    }), [snapshotHistory]);

  const seen = useMemo(() => {
    const set = new Set();
    for (const r of data) for (const k of Object.keys(r)) if (k !== 'date') set.add(k);
    return ASSET_CLASSES.filter(c => set.has(c.id));
  }, [data]);

  if (data.length < 2) {
    return (
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-1">Allocation over time</h2>
        <p className="text-sm text-slate-400">History accumulates one point per day you open the app. Come back after a few sessions to see how your mix drifts — useful for the quarterly rebalance.</p>
      </section>
    );
  }

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-300 mb-3">Allocation over time</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }} stackOffset="expand">
            <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="date" stroke={AXIS_COLOR} tick={{ fill: AXIS_COLOR, fontSize: 10 }} tickLine={{ stroke: AXIS_COLOR }} axisLine={{ stroke: '#334155' }} minTickGap={40} />
            <YAxis stroke={AXIS_COLOR} tick={{ fill: AXIS_COLOR, fontSize: 10 }} tickLine={{ stroke: AXIS_COLOR }} axisLine={{ stroke: '#334155' }} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={40} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_LABEL}
              formatter={(v, k) => [pct(v), ASSET_CLASSES.find(c => c.id === k)?.label || k]} />
            {seen.map(c => (
              <Area key={c.id} type="monotone" dataKey={c.id} stackId="a" stroke={c.color} fill={c.color} fillOpacity={0.85} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
