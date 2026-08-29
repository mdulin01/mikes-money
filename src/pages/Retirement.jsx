import { useMemo, useState, useEffect } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Legend } from 'recharts';
import { money, pct } from '../utils/format';
import { simulate } from '../utils/monteCarlo';
import { computeAge, humanDate, toLocalMonthStr } from '../utils/dateUtils';
import { effectiveCategory } from '../utils/classify';
import { useRangeTxns } from '../hooks/useRangeTxns';
import { USER_PROFILE } from '../constants';
import TransitionTimeline from '../components/TransitionTimeline';
import { DEFAULT_ENGAGEMENTS, engagementGross, grossAtAge, hoursPerWeekAtAge } from '../utils/engagements';
import { netFrom1099, rothRoomTo24, ssFactor, SOLO_401K } from '../utils/tax2026';
import RothRmdPlanner from '../components/RothRmdPlanner';

// Current age always computed from birthdate — stays correct as time passes.
const CURRENT_AGE = computeAge(USER_PROFILE.birthdate) ?? 50;

// Defaults reset Aug 2026 to the "runway brief" baseline: engagement-driven income,
// $11k/mo living spend, UNCC retiree health coverage, Folio budget as its own line,
// SS as PIA at FRA 67 claimed at 70, and NO inheritance in the base case (add it as a
// one-time event to see the upside — a plan that works without it is the plan).
// Override in the UI or save your own via "Save inputs".
const DEFAULTS = {
  startAge: CURRENT_AGE,
  retireAge: 60,              // legacy — ignored while engagements exist
  endAge: 95,
  annualContribution: 0,      // legacy — ignored while engagements exist
  contributionGrowthRate: 0,
  annualSpend: 132000,
  spendGrowthRate: -0.005,
  stockPct: 0.7,
  socialSecurity: 35000,      // PIA at FRA 67; claiming factor applied in the sim
  ssStartAge: 70,
  healthPre65: 4200,          // UNCC retiree plan $350/mo until Medicare
  healthPost65: 3000,         // UNCC $35/mo + Part B (IRMAA extra not modeled here)
  ventureAnnual: 40000,       // Folio cash budget, on top of living spend
  ventureYears: 2,
  withdrawalTaxRate: 0.20,    // blended tax on portfolio draws (~80% of the pool is pre-tax)
  engagements: DEFAULT_ENGAGEMENTS,
  lumpSums: [],
  runs: 1000,
};

export default function Retirement({ netWorth, investmentsTotal, data, updateConfig, recentTxns }) {
  const saved = data?.retirement || {};

  // Starting balance defaults to investments (liquid, growing). Net worth includes home equity which
  // usually isn't drawn down, but user can override.
  // Current age always comes from birthdate so it stays correct as time passes —
  // saved startAge is ignored so you can't end up with a stale age stuck in Firestore.
  const [inputs, setInputs] = useState(() => ({
    ...DEFAULTS,
    ...saved,
    startAge: CURRENT_AGE,
    startingBalance: saved.startingBalance ?? (investmentsTotal || netWorth || 0),
  }));

  const [result, setResult] = useState(null);
  const [stressResult, setStressResult] = useState(null);
  const [computing, setComputing] = useState(false);

  const run = () => {
    setComputing(true);
    // Let React paint the "computing" state before the blocking sim
    setTimeout(() => {
      setResult(simulate(inputs));
      setComputing(false);
    }, 20);
  };

  const runStressTest = () => {
    // Simulate an immediate 20% drawdown (sequence-of-returns shock at retirement)
    const stressed = simulate({
      ...inputs,
      startingBalance: inputs.startingBalance * 0.8,
    });
    setStressResult(stressed);
  };

  // Auto-run on mount + when inputs change (debounced via effect)
  useEffect(() => {
    const t = setTimeout(run, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inputs.startAge, inputs.retireAge, inputs.endAge, inputs.startingBalance,
    inputs.annualContribution, inputs.contributionGrowthRate,
    inputs.annualSpend, inputs.spendGrowthRate,
    inputs.stockPct, inputs.socialSecurity, inputs.ssStartAge,
    JSON.stringify(inputs.lumpSums || []), inputs.runs,
    JSON.stringify(inputs.engagements || []),
    inputs.healthPre65, inputs.healthPost65, inputs.ventureAnnual, inputs.ventureYears,
    inputs.withdrawalTaxRate,
  ]);

  // ── Engagement editing ──
  const addEngagement = () => setInputs(s => ({
    ...s,
    engagements: [...(s.engagements || []), { id: `e${Date.now()}`, label: 'New engagement', hoursPerWeek: 0, rate: 250, weeksPerYear: 46, annualAmount: 0, throughAge: CURRENT_AGE + 2 }],
  }));
  const updateEngagement = (i, patch) => setInputs(s => ({
    ...s,
    engagements: (s.engagements || []).map((e, idx) => idx === i ? { ...e, ...patch } : e),
  }));
  const removeEngagement = (i) => setInputs(s => ({
    ...s,
    engagements: (s.engagements || []).filter((_, idx) => idx !== i),
  }));

  // Year-1 work economics — the "what does this contract actually pay" readout.
  const work = useMemo(() => {
    const gross = grossAtAge(inputs.engagements || [], CURRENT_AGE + 1);
    const t = netFrom1099(gross);
    return {
      gross, net: t.net, effRate: t.effRate,
      rothRoom: rothRoomTo24(gross),
      hours: hoursPerWeekAtAge(inputs.engagements || [], CURRENT_AGE + 1),
    };
  }, [inputs.engagements]);

  const addLumpSum = () => setInputs(s => ({
    ...s,
    lumpSums: [...(s.lumpSums || []), { age: 67, amount: 0, label: 'Event' }],
  }));
  const updateLumpSum = (i, patch) => setInputs(s => ({
    ...s,
    lumpSums: (s.lumpSums || []).map((l, idx) => idx === i ? { ...l, ...patch } : l),
  }));
  const removeLumpSum = (i) => setInputs(s => ({
    ...s,
    lumpSums: (s.lumpSums || []).filter((_, idx) => idx !== i),
  }));

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

  // ── Actual retirement draws YTD (retirement-inc inflows — TIAA's ~$722/mo, IRA draws) ──
  const drawYear = new Date().getFullYear();
  const yearTxns = useRangeTxns(`${drawYear}-01-01`);
  const draws = useMemo(() => {
    return (yearTxns || [])
      .filter(t => (t.amount || 0) < 0 && effectiveCategory(t, null, data?.userRules) === 'retirement-inc')
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [yearTxns, data?.userRules]);
  const drawTotal = draws.reduce((s, t) => s + -(t.amount || 0), 0);
  const drawThisMonth = draws.filter(t => (t.date || '').startsWith(toLocalMonthStr()))
    .reduce((s, t) => s + -(t.amount || 0), 0);

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
            Age {CURRENT_AGE} · Monte Carlo · {inputs.runs.toLocaleString()} runs · real dollars
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runStressTest}
            className="text-xs bg-amber-900/40 hover:bg-amber-900/60 text-amber-200 border border-amber-900/60 px-3 py-1.5 rounded-lg"
            title="Simulate an immediate 20% market drop"
          >
            Stress test: -20%
          </button>
          <button onClick={save} className="text-xs text-slate-400 hover:text-slate-200">Save inputs</button>
        </div>
      </header>

      {/* Actual draws hitting the bank — TIAA's monthly ~$722 distribution + any IRA draws */}
      {draws.length > 0 && (
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-300">💸 Retirement distributions received — {drawYear}</h2>
            <div className="text-sm text-slate-400">
              YTD <span className="mono-nums text-sky-300 font-semibold">{money(drawTotal, { cents: true })}</span>
              {drawThisMonth > 0 && <span className="text-slate-500"> · this month {money(drawThisMonth, { cents: true })}</span>}
            </div>
          </div>
          <ul className="text-xs text-slate-400 space-y-1">
            {draws.slice(0, 6).map(t => (
              <li key={t.id} className="flex justify-between gap-3">
                <span className="truncate">{humanDate(t.date)} · {t.merchantName || t.name}{t.needsReview && <span className="text-orange-400" title="needs review"> ⚑</span>}</span>
                <span className="mono-nums text-sky-300">{money(-(t.amount || 0), { cents: true })}</span>
              </li>
            ))}
            {draws.length > 6 && <li className="text-slate-600">…and {draws.length - 6} more</li>}
          </ul>
          <p className="text-[11px] text-slate-500 mt-2">TIAA pays ~$722/mo. Counted as "IRA draw" on Cash Flow (not earned income) and 1099-R income on the Tax page.</p>
        </section>
      )}

      {stressResult && result && (
        <section className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-amber-200">Stress test — immediate 20% market drop</h2>
            <button onClick={() => setStressResult(null)} className="text-xs text-slate-400 hover:text-slate-200">Dismiss</button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">Success rate</div>
              <div className="text-xl font-bold mono-nums mt-0.5">
                <span className="text-slate-400">{pct(result.successRate, 0)}</span>
                <span className="text-slate-500 mx-1">→</span>
                <span className={stressResult.successRate >= 0.8 ? 'text-emerald-400' : stressResult.successRate >= 0.6 ? 'text-amber-300' : 'text-rose-400'}>
                  {pct(stressResult.successRate, 0)}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">Median ending</div>
              <div className="text-xl font-bold mono-nums mt-0.5">{money(stressResult.medianEndBalance)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">p10 ending</div>
              <div className="text-xl font-bold mono-nums mt-0.5 text-rose-400">{money(stressResult.p10EndBalance)}</div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Reruns the simulation with starting portfolio cut by 20% — approximates the classic "retire into a bad market"
            scenario. If this number is much lower than the base case, sequence-of-returns risk is your binding constraint.
            The fix is a larger cash buffer, not higher returns.
          </p>
        </section>
      )}

      {/* Headline */}
      {result && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Success rate" value={pct(successRate, 0)} big tone={successColor}
                hint={`% of runs where portfolio survives to age ${inputs.endAge}`} />
          <Tile label="Median ending" value={money(result.medianEndBalance)}
                tone="text-slate-100" />
          <Tile label="Pessimistic (p10)" value={money(result.p10EndBalance)}
                tone="text-rose-400" hint="Bottom-10% scenario" />
          <Tile label="Optimistic (p90)" value={money(result.p90EndBalance)}
                tone="text-emerald-400" hint="Top-10% scenario" />
        </section>
      )}

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
          (US stocks 5% real ±15%, bonds 2% ±6%). Social Security is entered as the PIA at FRA 67 — the sim applies
          the claiming factor ({pct(ssFactor(inputs.ssStartAge) - 1, 0)} at {inputs.ssStartAge}). Sequence-of-returns
          risk and correlation aren't modeled.
        </p>
      </section>

      {/* Work & engagements — hours × rate per client, feeding the projection directly */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-300">💼 Work & engagements</h2>
          <button onClick={addEngagement} className="text-xs text-emerald-400 hover:text-emerald-300">+ Add engagement</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Income is modeled per engagement (hours × rate, or a flat amount) through the age you set,
          taxed as 1099 (SE + 2026 federal + NC 3.99%). Surplus over spending is 60% invested.
        </p>
        {(inputs.engagements || []).length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
            <Tile label="Gross (next yr)" value={money(work.gross)} />
            <Tile label="After tax" value={money(Math.round(work.net))} hint={`${pct(work.effRate, 0)} total tax`} />
            <Tile label="Hours / wk sold" value={work.hours.toFixed(0)} hint="weekday hours not sold fund Folio" />
            <Tile label="Roth room at 24%" value={money(Math.round(work.rothRoom))}
                  tone={work.rothRoom > 0 ? 'text-emerald-400' : 'text-rose-400'}
                  hint="conversion room before the 32% bracket" />
            <Tile label="Solo-401(k) max" value={money(SOLO_401K.deferral + (CURRENT_AGE >= 60 && CURRENT_AGE <= 63 ? SOLO_401K.catchUp60to63 : SOLO_401K.catchUp50))}
                  hint="Roth deferral + catch-up (2026)" />
          </div>
        )}
        <ul className="space-y-2">
          {(inputs.engagements || []).map((e, i) => (
            <li key={e.id || i} className="grid grid-cols-12 gap-2 items-center text-sm">
              <input value={e.label || ''} onChange={(ev) => updateEngagement(i, { label: ev.target.value })}
                className="col-span-3 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1" />
              <label className="col-span-2 text-xs text-slate-500">hrs/wk
                <input type="number" value={e.hoursPerWeek ?? 0} onChange={(ev) => updateEngagement(i, { hoursPerWeek: Number(ev.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-right" /></label>
              <label className="col-span-2 text-xs text-slate-500">$/hr
                <input type="number" value={e.rate ?? 0} onChange={(ev) => updateEngagement(i, { rate: Number(ev.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-right" /></label>
              <label className="col-span-2 text-xs text-slate-500">flat $/yr
                <input type="number" value={e.annualAmount ?? 0} onChange={(ev) => updateEngagement(i, { annualAmount: Number(ev.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-right" /></label>
              <label className="col-span-1 text-xs text-slate-500">thru age
                <input type="number" value={e.throughAge ?? ''} onChange={(ev) => updateEngagement(i, { throughAge: Number(ev.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-right" /></label>
              <div className="col-span-1 text-right mono-nums text-slate-300 text-xs">{money(engagementGross(e))}</div>
              <button onClick={() => removeEngagement(i)} className="col-span-1 text-slate-500 hover:text-rose-400 text-xs">✕</button>
            </li>
          ))}
        </ul>
        {(inputs.engagements || []).length === 0 && (
          <p className="text-xs text-slate-500">No engagements — the sim falls back to the legacy retire-age / annual-contribution inputs below.</p>
        )}
      </section>

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
          <Field label={`Contribution growth (${((inputs.contributionGrowthRate || 0) * 100).toFixed(1)}%/yr)`}>
            <input type="number" step="0.001" value={inputs.contributionGrowthRate || 0} onChange={(e) => setField('contributionGrowthRate')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Annual spend (retirement)">
            <input type="number" value={inputs.annualSpend} onChange={(e) => setField('annualSpend')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label={`Spend growth (${((inputs.spendGrowthRate || 0) * 100).toFixed(1)}%/yr)`}>
            <input type="number" step="0.001" value={inputs.spendGrowthRate || 0} onChange={(e) => setField('spendGrowthRate')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label={`Stock / bond mix (${Math.round(inputs.stockPct * 100)}% / ${Math.round((1 - inputs.stockPct) * 100)}%)`}>
            <input type="range" min="0" max="1" step="0.05" value={inputs.stockPct} onChange={(e) => setField('stockPct')(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="Social Security ($/yr)">
            <input type="number" value={inputs.socialSecurity} onChange={(e) => setField('socialSecurity')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="SS start age">
            <input type="number" value={inputs.ssStartAge} onChange={(e) => setField('ssStartAge')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Health $/yr to 65 (UNCC $350/mo)">
            <input type="number" value={inputs.healthPre65 ?? 0} onChange={(e) => setField('healthPre65')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Health $/yr from 65 ($35/mo + Part B)">
            <input type="number" value={inputs.healthPost65 ?? 0} onChange={(e) => setField('healthPost65')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Folio budget $/yr (on top of spend)">
            <input type="number" value={inputs.ventureAnnual ?? 0} onChange={(e) => setField('ventureAnnual')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Folio years">
            <input type="number" value={inputs.ventureYears ?? 0} onChange={(e) => setField('ventureYears')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label={`Tax on portfolio draws (${Math.round((inputs.withdrawalTaxRate ?? 0) * 100)}%)`}>
            <input type="number" step="0.01" min="0" max="0.35" value={inputs.withdrawalTaxRate ?? 0} onChange={(e) => setField('withdrawalTaxRate')(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
        </div>

        {/* Lump-sum income events */}
        <div className="mt-4 pt-3 border-t border-slate-700/60">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">One-time income events</h3>
            <button onClick={addLumpSum} className="text-xs text-emerald-400 hover:text-emerald-300">+ Add event</button>
          </div>
          {(inputs.lumpSums || []).length === 0 && (
            <p className="text-xs text-slate-500">No events (e.g. inheritance, home sale, severance). Click "+ Add event".</p>
          )}
          <ul className="space-y-2">
            {(inputs.lumpSums || []).map((l, i) => (
              <li key={i} className="grid grid-cols-12 gap-2 items-center text-sm">
                <input
                  value={l.label || ''}
                  onChange={(e) => updateLumpSum(i, { label: e.target.value })}
                  placeholder="Label"
                  className="col-span-4 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                />
                <div className="col-span-3">
                  <input type="number" value={l.age || ''}
                    onChange={(e) => updateLumpSum(i, { age: Number(e.target.value) })}
                    placeholder="Age"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-right" />
                </div>
                <div className="col-span-4">
                  <input type="number" value={l.amount || ''}
                    onChange={(e) => updateLumpSum(i, { amount: Number(e.target.value) })}
                    placeholder="Amount (after tax)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-right" />
                </div>
                <button onClick={() => removeLumpSum(i)} className="col-span-1 text-slate-500 hover:text-rose-400 text-xs">✕</button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Age-based transition milestones: 59½ IRA draws → IRMAA lookback → Medicare → FRA → RMDs */}
      <TransitionTimeline data={data} updateConfig={updateConfig} investmentsTotal={investmentsTotal} recentTxns={recentTxns} />

      {/* Roth-conversion vs RMD/IRMAA trade-off (ROTH_IRMAA_PLAN.md open items #3/#4) */}
      <RothRmdPlanner data={data} updateConfig={updateConfig} />

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
