import { useMemo, useState } from 'react';
import { money, pct } from '../utils/format';
import { computeAgeFractional } from '../utils/dateUtils';
import { USER_PROFILE } from '../constants';

// Retirement-transition timeline — the age-based milestones between "still consulting"
// and "fully retired on Medicare", personalized from the birthdate in constants.js.
//
// Born 1967 specifics baked in:
//  · SS Full Retirement Age = 67 (born 1960+)
//  · RMDs start at 75 (SECURE 2.0, born 1960+) — NOT 73
//  · IRMAA has a 2-year MAGI lookback: income from age 63 sets Medicare premiums at 65.

const BIRTH = USER_PROFILE.birthdate; // '1967-01-11'

function dateAtAge(age) {
  const [y, m, d] = BIRTH.split('-').map(Number);
  const dt = new Date(y + Math.floor(age), m - 1 + Math.round((age % 1) * 12), d);
  return dt;
}
const fmt = (dt) => dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

// IRMAA (single filer) — 2026 brackets from ROTH_IRMAA_PLAN.md (repo root; sourced from
// IRS/TheFinanceBuff). Thresholds inflation-index yearly (~15–25% higher nominal by 2032);
// surcharges are Part B + Part D monthly add-ons over the standard premium.
export const IRMAA_TIERS = [
  { upTo: 109000, b: 0, d: 0, label: '≤ $109k' },
  { upTo: 137000, b: 81.2, d: 14.5, label: '$109–137k' },
  { upTo: 171000, b: 202.9, d: 37.5, label: '$137–171k' },
  { upTo: 205000, b: 324.6, d: 60.4, label: '$171–205k' },
  { upTo: 500000, b: 446.3, d: 83.3, label: '$205–500k' },
  { upTo: Infinity, b: 487.0, d: 91.0, label: '> $500k' },
];
export const tierFor = (magi) => IRMAA_TIERS.find(t => magi <= t.upTo);
export const tierIndex = (magi) => IRMAA_TIERS.indexOf(tierFor(magi));

export default function TransitionTimeline({ data, updateConfig, investmentsTotal, recentTxns }) {
  const ageNow = computeAgeFractional(BIRTH);

  // Actual IRA draw pace from tagged transactions (last 90 days, annualized).
  const draw = useMemo(() => {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const total = (recentTxns || [])
      .filter(t => t.category === 'retirement-inc' && (t.amount || 0) < 0 && (t.date || '') >= cutoff)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const annual = total * (365 / 90);
    return { monthly: total / 3, annual, rate: investmentsTotal > 0 ? annual / investmentsTotal : null };
  }, [recentTxns, investmentsTotal]);

  const [magi, setMagi] = useState(data?.retirement?.irmaaMagi ?? 150000);
  const tier = tierFor(magi);
  const saveMagi = (v) => updateConfig({ retirement: { ...(data?.retirement || {}), irmaaMagi: v } });

  const milestones = [
    { age: 59.5, title: 'Penalty-free IRA withdrawals', note: 'Monthly distributions are penalty-free — ordinary income only. Log them under the Retirement Income category so the Tax page set-aside stays right.' },
    { age: 63, title: 'IRMAA lookback begins', note: 'Medicare premiums at 65 are set by MAGI from this year (2-year lookback). Big Roth conversions / capital gains after this point raise your first Medicare premiums.' },
    { age: 64.75, title: 'Medicare enrollment window opens', note: 'Initial Enrollment Period = 3 months before the month you turn 65 through 3 months after. Missing it means late penalties on Part B for life.' },
    { age: 65, title: 'Medicare starts', note: 'Part B premium depends on the IRMAA tier below. Compare Medigap vs Medicare Advantage before the window.' },
    { age: 67, title: 'Social Security FRA', note: 'Full retirement age (born 1960+). Claiming at 62 cuts ~30%; each year of delay past 67 adds 8% until 70.' },
    { age: 70, title: 'Max Social Security', note: 'No benefit to delaying past 70 — claim by now.' },
    { age: 75, title: 'RMDs begin', note: 'SECURE 2.0: born 1960+ → first Required Minimum Distribution at 75 (2042), not 73. Years 65–75 are the window for Roth conversions at lower brackets.' },
  ];

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-300 mb-1">🗺️ Transition timeline</h2>
      <p className="text-xs text-slate-500 mb-4">Age {ageNow?.toFixed(1)} · milestones computed from your birthdate</p>

      {/* Current draw pace */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="IRA draw (mo avg)" value={draw.monthly > 0 ? money(draw.monthly) : '—'}
          hint={draw.monthly > 0 ? 'last 90 days' : 'no retirement-inc txns yet'} />
        <Stat label="Annualized draw" value={draw.annual > 0 ? money(draw.annual) : '—'} />
        <Stat label="Draw rate" value={draw.rate != null && draw.annual > 0 ? pct(draw.rate, 1) : '—'}
          hint="of investable assets · <4% is sustainable"
          tone={draw.rate == null || draw.annual === 0 ? undefined : draw.rate < 0.04 ? 'text-emerald-400' : draw.rate < 0.05 ? 'text-amber-300' : 'text-rose-400'} />
      </div>

      {/* Timeline */}
      <ol className="relative border-l border-slate-700 ml-2 space-y-4 mb-5">
        {milestones.map((m) => {
          const past = ageNow >= m.age;
          const next = !past && milestones.filter(x => ageNow < x.age)[0]?.age === m.age;
          return (
            <li key={m.age} className="ml-4">
              <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${past ? 'bg-emerald-500' : next ? 'bg-amber-400' : 'bg-slate-600'}`} />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`text-sm font-semibold ${past ? 'text-emerald-300' : next ? 'text-amber-200' : 'text-slate-200'}`}>
                  {m.title}
                </span>
                <span className="text-xs text-slate-500 mono-nums">age {m.age} · {fmt(dateAtAge(m.age))}{past ? ' ✓' : ''}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{m.note}</p>
            </li>
          );
        })}
      </ol>

      {/* IRMAA estimator */}
      <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Medicare premium (IRMAA) estimator</h3>
          <label className="text-xs text-slate-400 flex items-center gap-2">
            Expected MAGI at 63+
            <input type="number" value={magi}
              onChange={e => setMagi(Number(e.target.value) || 0)}
              onBlur={e => saveMagi(Number(e.target.value) || 0)}
              className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 mono-nums text-right" />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {IRMAA_TIERS.map(t => (
            <span key={t.label}
              className={`px-2 py-1 rounded text-[11px] mono-nums ${t === tier ? 'bg-emerald-900/60 border border-emerald-700 text-emerald-300' : 'bg-slate-800 border border-slate-700/60 text-slate-500'}`}>
              {t.label} → {t.b === 0 ? 'no surcharge' : `+$${t.b.toFixed(0)} B / +$${t.d.toFixed(0)} D /mo`}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Single filer, 2026 brackets (they inflation-index yearly — see ROTH_IRMAA_PLAN.md in the repo). Surcharges are on TOP of the
          standard Part B premium. MAGI = AGI + tax-exempt interest — consulting income, rents, IRA withdrawals and Roth CONVERSIONS
          all count; Roth WITHDRAWALS don't. At {money(magi)} MAGI: {tier.b === 0 ? 'no IRMAA surcharge' : `≈+$${((tier.b + tier.d) * 12).toFixed(0)}/yr in surcharges`}.
          Your 2032 Day-1 premium is set by your <span className="text-slate-300">2030 return</span> — large Roth conversions of the $2.2M
          rollover IRA are cheapest before 2029, and shrink the age-75 RMD wave.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, hint, tone = 'text-slate-100' }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-3">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold mono-nums mt-0.5 ${tone}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
