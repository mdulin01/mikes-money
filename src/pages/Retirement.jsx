import { useMemo, useState, useEffect } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Legend } from 'recharts';
import { money, pct } from '../utils/format';
import { simulate } from '../utils/monteCarlo';

const DEFAULTS = {
  startAge: 45,
  retireAge: 65,
  endAge: 95,
  annualContribution: 40000,
  annualSpend: 120000,
  stockPct: 0.7,
  socialSecurity: 30000,
  ssStartAge: 67,
  runs: 1000,
};

export default function Retirement({ netWorth, investmentsTotal, data, updateConfig }) {
  const saved = data?.retirement || {};

  // Starting balance defaults to investments (liquid, growing). Net worth includes home equity which
  // usually isn't drawn down, but user can override.
  const [inputs, setInputs] = useState(() => ({
    ...DEFAULTS,
    ...saved,
    startingBalance: saved.startingBalance ?? (investmentsTotal || netWorth || 0),
  }));

  const [result, setResult] = useState(null);
  const [computing, setComputing] = useState(false);

  const run = () => {
    setComputing(true);
    // Let React paint the "computing" state before the blocking sim
    setTimeout(() => {
      setResult(simulate(inputs));
      setComputing(false);
    }, 20);
  };

  // Auto-run on mount + when inputs change (debounced via effect)
  useEffect(() => {
    const t = setTimeout(run, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inputs.startAge, inputs.retireAge, inputs.endAge, inputs.startingBalance,
    inputs.annualContribution, inputs.annualSpend, inputs.stockPct,
    inputs.socialSecurity, inputs.ssStartAge, inputs.runs,
  ]);

  const setField = (k) => (v) => setInputs(s => ({ ...s, [k]: v }));

  const save = () => {
    updateConfig({ retirement: inputs });
  };

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.ages.map((age, i) => ({
      age,
      p10: Math.round(result.percentiles.p10[i]),
      p50: Math.round(result.percentiles.p50[i]),
      p90: Math.round(result.percentiles.p90[i]),
      // Build a band via stacked area
      p10to50: Math.round(result.percentiles.p50[i] - result.percentiles.p10[i]),
      p50to90: Math.round(result.percentiles.p90[i] - result.percentiles.p50[i]),
    }));
  }, [result]);

  const successRate = result?.successRate ?? 0;
  const successColor =
    successRate >= 0.9 ? 'text-emerald-400' :
    successRate >= 0.75 ? 'text-amber-400' :
    'text-rose-400';

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Retirement Planner</h1>
          <p className="text-slate-400 text-sm">
            Monte Carlo simulation · {inputs.runs.toLocaleString()} runs · real dollars
          </p>
        </div>
        <button onClick={save} className="text-xs text-slate-400 hover:text-slate-200">Save inputs</button>
      </header>

      {/* Headline */}
      {result && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Success rate" value={pct(successRate, 0)} big tone={successColor}
                hint="% of runs where portfolio survives to age 95" />
          <Tile label="Median ending" value={money(result.medianEndBalance)}
                tone="text-slate-100" />
          <Tile label="Pessimistic (p10)" value={money(result.p10EndBalance)}
                tone="text-rose-400" hint="Bottom-10% scenario" />
          <Tile label="Optimistic (p90)" value={money(result.p90EndBalance)}
                tone="text-emerald-400" hint="Top-10% scenario" />
        </section>
      )}

      {/* Inputs */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Inputs</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Current age">
            <input type="number" value={inputs.startAge} onChange={(e) => setField('startAge')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Retirement age">
            <input type="number" value={inputs.retireAge} onChange={(e) => setField('retireAge')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Plan through age">
            <input type="number" value={inputs.endAge} onChange={(e) => setField('endAge')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Starting portfolio">
            <input type="number" value={inputs.startingBalance} onChange={(e) => setField('startingBalance')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Annual contribution">
            <input type="number" value={inputs.annualContribution} onChange={(e) => setField('annualContribution')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Annual spend (retirement)">
            <input type="number" value={inputs.annualSpend} onChange={(e) => setField('annualSpend')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label={`Stock / bond mix (${Math.round(inputs.stockPct * 100)}% / ${Math.round((1 - inputs.stockPct) * 100)}%)`}>
            <input type="range" min="0" max="1" step="0.05" value={inputs.stockPct} onChange={(e) => setField('stockPct')(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="Social Security ($/yr)">
            <input type="number" value={inputs.socialSecurity} onChange={(e) => setField('socialSecurity')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
        </div>
      </section>

      {/* Chart */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          Projected portfolio value (10th / 50th / 90th percentile)
        </h2>
        <div className="h-80">
          {computing ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm animate-pulse">
              Simulating {inputs.runs.toLocaleString()} scenarios…
            </div>
          ) : result && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="coneFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="age" stroke="#94a3b8" style={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} width={80}
                       tickFormatter={(v) => money(v)} />
                <Tooltip
                  formatter={(v, k) => [money(Math.round(v)), k === 'p50' ? 'Median' : k === 'p10' ? 'p10' : 'p90']}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="p10" stackId="cone" stroke="none" fill="transparent" />
                <Area type="monotone" dataKey="p10to50" stackId="cone" stroke="none" fill="url(#coneFill)" />
                <Area type="monotone" dataKey="p50to90" stackId="cone" stroke="none" fill="url(#coneFill)" />
                <Line type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="p10" stroke="#f43f5e" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="p90" stroke="#06b6d4" strokeWidth={1} dot={false} strokeDasharray="3 3" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : null}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Green line = median outcome. Shaded band = 10th to 90th percentile. Assumes independent annual returns
          (US stocks 7% real ±17%, bonds 2% ±6%). Sequence-of-returns risk and correlation aren't modeled.
        </p>
      </section>
    </main>
  );
}

function Tile({ label, value, big, tone = 'text-slate-100', hint }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`${big ? 'text-3xl md:text-4xl' : 'text-2xl'} font-bold mono-nums mt-1 ${tone}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}
