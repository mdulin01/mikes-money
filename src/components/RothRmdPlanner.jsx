import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { money } from '../utils/format';
import { USER_PROFILE } from '../constants';
import { IRMAA_TIERS, tierFor, tierIndex } from './TransitionTimeline';
import { grossAtAge } from '../utils/engagements';
import { rothRoomTo24, netFrom1099 } from '../utils/tax2026';

// Roth-conversion / RMD / IRMAA planner — the "open item #3/#4" from ROTH_IRMAA_PLAN.md.
//
// Deterministic year-by-year model of the PRE-TAX IRA pool only (rollover + SEP):
// grows at a real return, drained by planned draws, forced RMDs from age 75
// (SECURE 2.0, born 1960+, Uniform Lifetime Table), optionally shrunk by partial
// Roth conversions through a chosen year. Runs WITH vs WITHOUT conversions and
// flags where projected MAGI lands in the IRMAA tiers (premiums lag MAGI by 2 yrs).
//
// Deliberately NOT Monte Carlo: the point is tax-bracket/IRMAA cliff visibility,
// which a median path shows more honestly than a probability cone.

const BIRTH_YEAR = Number(USER_PROFILE.birthdate.slice(0, 4)); // 1967
const THIS_YEAR = new Date().getFullYear();

// IRS Uniform Lifetime Table (2022+), ages 75–95.
const RMD_FACTOR = {
  75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5,
  83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2,
  91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
};

const DEFAULTS = {
  preTax: 2248369,        // rollover + SEP, Vanguard 6/30/2026 (ROTH_IRMAA_PLAN.md)
  realReturn: 0.05,
  annualDraw: 72000,      // planned IRA draws before RMD age
  convertPerYear: 0,
  convertThrough: 2029,   // conversions after 2029 land in the age-63+ IRMAA lookback
  marginalRate: 0.35,
  otherIncome: 150000,    // consulting + rental MAGI while still working
  otherUntilAge: 62,
};

function project(inp, withConversions) {
  const rows = [];
  let bal = inp.preTax;
  let convTax = 0;
  for (let year = THIS_YEAR; BIRTH_YEAR + 92 >= year; year++) {
    const age = year - BIRTH_YEAR; // age reached during this year
    if (age > 92) break;
    const conv = withConversions && year <= inp.convertThrough
      ? Math.min(inp.convertPerYear, bal) : 0;
    const factor = RMD_FACTOR[Math.min(age, 95)];
    const rmd = age >= 75 && factor ? bal / factor : 0;
    const draw = Math.min(Math.max(inp.annualDraw, rmd), Math.max(0, bal - conv));
    const magi = draw + conv
      + (age >= (inp.ssStartAge || 67) ? 0.85 * (inp.ss || 0) : 0)
      + (age <= inp.otherUntilAge ? inp.otherIncome : 0);
    convTax += conv * inp.marginalRate;
    bal = Math.max(0, (bal - draw - conv) * (1 + inp.realReturn));
    rows.push({ year, age, conv, rmd, draw, magi, balEnd: bal, convTax });
  }
  return rows;
}

export default function RothRmdPlanner({ data, updateConfig }) {
  const saved = data?.rothPlanner || {};
  const [inp, setInp] = useState({
    ...DEFAULTS,
    ss: data?.retirement?.socialSecurity ?? 34632,
    ssStartAge: data?.retirement?.ssStartAge ?? 67,
    ...saved,
  });
  const set = (k) => (e) => setInp(s => ({ ...s, [k]: Number(e.target.value) || 0 }));
  const save = () => updateConfig({ rothPlanner: inp });

  // Boldin-style suggestion: fill the 24% bracket with conversions in the
  // low-income window (now → convertThrough), sized from the engagements the
  // Retirement page already knows. Conservative: uses the SMALLEST room across
  // the window years so one number fits every year.
  const engagements = data?.retirement?.engagements || [];
  const suggestion = useMemo(() => {
    const startAge = THIS_YEAR - BIRTH_YEAR;
    const endAge = (inp.convertThrough || THIS_YEAR) - BIRTH_YEAR;
    if (endAge < startAge) return null;
    const rows = [];
    for (let age = startAge; age <= endAge; age++) {
      const gross = grossAtAge(engagements, age + 1);
      rows.push({ year: BIRTH_YEAR + age, gross, room: rothRoomTo24(gross) });
    }
    const room = Math.min(...rows.map(r => r.room));
    return { rows, room };
  }, [engagements, inp.convertThrough]);
  const applySuggestion = () => {
    if (!suggestion) return;
    const gross = grossAtAge(engagements, THIS_YEAR - BIRTH_YEAR + 1);
    setInp(s => ({
      ...s,
      convertPerYear: Math.round(suggestion.room / 1000) * 1000,
      marginalRate: 0.24 + 0.0399,                     // conversions priced at 24% fed + NC
      otherIncome: Math.round(netFrom1099(gross).taxable),  // taxable comp from engagements
    }));
  };

  const base = useMemo(() => project(inp, false), [inp]);
  const plan = useMemo(() => project(inp, true), [inp]);
  const hasConv = inp.convertPerYear > 0;

  const byYear = useMemo(() => base.map((b, i) => ({
    year: b.year, age: b.age,
    baseBal: Math.round(b.balEnd), planBal: Math.round(plan[i]?.balEnd ?? 0),
    baseMagi: Math.round(b.magi), planMagi: Math.round(plan[i]?.magi ?? 0),
    baseRmd: Math.round(b.rmd), planRmd: Math.round(plan[i]?.rmd ?? 0),
    conv: Math.round(plan[i]?.conv ?? 0),
    draw: Math.round(plan[i]?.draw ?? 0),
  })), [base, plan]);

  const at = (age, rows) => rows.find(r => r.age === age);
  const rmdYear = at(75, byYear);
  const irmaaYear = at(63, byYear);           // 2030 MAGI → Day-1 Medicare premium (2032)
  const totalConvTax = plan.length ? plan[plan.length - 1].convTax : 0;

  // Lifetime IRMAA surcharge estimate (65+; premium year uses MAGI from 2 yrs prior)
  const irmaaCost = (rows, key) => {
    let sum = 0;
    for (const r of rows) {
      if (r.age < 65) continue;
      const src = rows.find(x => x.age === r.age - 2);
      const t = tierFor(src ? src[key] : 0);
      sum += (t.b + t.d) * 12;
    }
    return sum;
  };
  const baseIrmaa = useMemo(() => irmaaCost(byYear, 'baseMagi'), [byYear]);
  const planIrmaa = useMemo(() => irmaaCost(byYear, 'planMagi'), [byYear]);

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-300">🔄 Roth conversion / RMD / IRMAA planner</h2>
        <button onClick={save} className="text-xs text-slate-400 hover:text-slate-200">Save inputs</button>
      </div>
      {suggestion && (
        <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-3 mb-3 text-xs text-slate-400">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              💡 Engagement-aware suggestion: convert <span className="mono-nums text-emerald-300">{money(suggestion.room)}</span>/yr
              through {inp.convertThrough} — fills the 24% bracket in every window year without spilling into 32%.
            </span>
            <button onClick={applySuggestion} className="text-emerald-400 hover:text-emerald-300">apply</button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
            {suggestion.rows.map(r => (
              <span key={r.year} className="mono-nums">{r.year}: room {money(r.room)}</span>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500 mb-4">
        Pre-tax IRA pool only (rollover + SEP), real dollars, deterministic. Conversions before age 63 ({BIRTH_YEAR + 63}) never touch
        your Medicare premium; RMDs start at 75 ({BIRTH_YEAR + 75}). See ROTH_IRMAA_PLAN.md for the full strategy write-up.
      </p>

      {/* Inputs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
        <Field label="Pre-tax IRA today">
          <input type="number" value={inp.preTax} onChange={set('preTax')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
        </Field>
        <Field label={`Real return (${(inp.realReturn * 100).toFixed(1)}%/yr)`}>
          <input type="number" step="0.005" value={inp.realReturn} onChange={set('realReturn')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
        </Field>
        <Field label="Planned IRA draw ($/yr)">
          <input type="number" value={inp.annualDraw} onChange={set('annualDraw')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
        </Field>
        <Field label={`Marginal rate on conversions (${Math.round(inp.marginalRate * 100)}%)`}>
          <input type="number" step="0.01" value={inp.marginalRate} onChange={set('marginalRate')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
        </Field>
        <Field label="Roth conversion ($/yr)">
          <input type="number" step="10000" value={inp.convertPerYear} onChange={set('convertPerYear')} className="w-full bg-slate-900 border border-emerald-700/60 rounded-lg px-2 py-1 mono-nums" />
        </Field>
        <Field label="Convert through year">
          <input type="number" value={inp.convertThrough} onChange={set('convertThrough')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
        </Field>
        <Field label="Other income ($/yr, MAGI)">
          <input type="number" value={inp.otherIncome} onChange={set('otherIncome')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
        </Field>
        <Field label="…earned through age">
          <input type="number" value={inp.otherUntilAge} onChange={set('otherUntilAge')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
        </Field>
      </div>

      {/* Headline comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label={`First RMD (age 75, ${BIRTH_YEAR + 75})`}
          value={rmdYear ? money(hasConv ? rmdYear.planRmd : rmdYear.baseRmd) : '—'}
          sub={hasConv && rmdYear ? `vs ${money(rmdYear.baseRmd)} without conversions` : null}
          tone={rmdYear && (hasConv ? rmdYear.planRmd : rmdYear.baseRmd) > 200000 ? 'text-rose-400' : 'text-slate-100'} />
        <Stat label={`MAGI at 63 (${BIRTH_YEAR + 63}) → Day-1 premium`}
          value={irmaaYear ? `${money(hasConv ? irmaaYear.planMagi : irmaaYear.baseMagi)}` : '—'}
          sub={irmaaYear ? `IRMAA tier: ${tierFor(hasConv ? irmaaYear.planMagi : irmaaYear.baseMagi).label}` : null}
          tone={irmaaYear && tierIndex(hasConv ? irmaaYear.planMagi : irmaaYear.baseMagi) > 0 ? 'text-amber-300' : 'text-emerald-400'} />
        <Stat label="Tax paid on conversions"
          value={hasConv ? money(Math.round(totalConvTax)) : '—'}
          sub={hasConv ? `${money(inp.convertPerYear)}/yr × ${Math.round(inp.marginalRate * 100)}% through ${inp.convertThrough}` : 'set a conversion amount'} />
        <Stat label="Lifetime IRMAA surcharges (65–92)"
          value={money(Math.round(hasConv ? planIrmaa : baseIrmaa))}
          sub={hasConv ? `vs ${money(Math.round(baseIrmaa))} without · ${planIrmaa <= baseIrmaa ? 'saves' : 'ADDS'} ${money(Math.round(Math.abs(baseIrmaa - planIrmaa)))}` : null}
          tone={hasConv && planIrmaa < baseIrmaa ? 'text-emerald-400' : 'text-slate-100'} />
      </div>

      {/* Balance paths */}
      <div className="h-64 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={byYear}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="age" stroke="#94a3b8" style={{ fontSize: 11 }} />
            <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} width={70} tickFormatter={(v) => money(v)} />
            <Tooltip formatter={(v, k) => [money(v), k]} labelFormatter={(a) => `Age ${a}`}
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
            <Legend />
            <Line type="monotone" dataKey="baseBal" name="pre-tax IRA (no conversions)" stroke="#64748b" strokeWidth={2} dot={false} />
            {hasConv && <Line type="monotone" dataKey="planBal" name="with conversions" stroke="#10b981" strokeWidth={2} dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Year table */}
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-800">
            <tr className="text-slate-500">
              <th className="text-left py-1">Year</th><th className="text-right px-2">Age</th>
              <th className="text-right px-2">Conversion</th><th className="text-right px-2">Draw / RMD</th>
              <th className="text-right px-2">MAGI</th><th className="text-right px-2">IRMAA tier caused</th>
              <th className="text-right pl-2">Pre-tax bal</th>
            </tr>
          </thead>
          <tbody>
            {byYear.filter(r => r.age <= 85).map(r => {
              const magi = hasConv ? r.planMagi : r.baseMagi;
              const t = tierFor(magi);
              const ti = tierIndex(magi);
              const affectsPremium = r.age >= 63; // MAGI from 63 on sets premiums at 65+
              const worse = hasConv && tierIndex(r.planMagi) > tierIndex(r.baseMagi) && affectsPremium;
              return (
                <tr key={r.year} className={`border-t border-slate-700/50 ${r.age === 63 || r.age === 75 ? 'bg-slate-900/50' : ''}`}>
                  <td className="py-1">{r.year}{r.age === 63 ? ' ★' : r.age === 75 ? ' ⚑' : ''}</td>
                  <td className="text-right px-2 mono-nums">{r.age}</td>
                  <td className="text-right px-2 mono-nums text-emerald-300">{r.conv ? money(r.conv) : '—'}</td>
                  <td className="text-right px-2 mono-nums">{r.draw ? money(r.draw) : '—'}{(hasConv ? r.planRmd : r.baseRmd) > (r.draw || 0) - 1 && r.age >= 75 ? ' (RMD)' : ''}</td>
                  <td className="text-right px-2 mono-nums">{money(magi)}</td>
                  <td className={`text-right px-2 whitespace-nowrap ${!affectsPremium ? 'text-slate-600' : worse ? 'text-rose-400' : ti > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {affectsPremium ? `${t.label}${ti > 0 ? ` (+$${Math.round((t.b + t.d) * 12)}/yr)` : ''}` : 'pre-lookback'}
                  </td>
                  <td className="text-right pl-2 mono-nums text-slate-300">{money(hasConv ? r.planBal : r.baseBal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        ★ = age 63, the first year whose MAGI sets a Medicare premium (2-yr lookback). ⚑ = RMDs begin.
        "Pre-lookback" years are the free window: conversions there cost income tax at {Math.round(inp.marginalRate * 100)}% but never raise premiums.
        IRMAA brackets held at 2026 levels in real dollars; SS counted at 85% taxable. Estimates — confirm big conversions with your CPA.
      </p>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value, sub, tone = 'text-slate-100' }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-3">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold mono-nums mt-0.5 ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
