import { useMemo } from 'react';
import { money, pct } from '../utils/format';
import { grossAtAge } from '../utils/engagements';
import { netFrom1099 } from '../utils/tax2026';
import { computeAge } from '../utils/dateUtils';
import { USER_PROFILE } from '../constants';

// "This month's paycheck" — the decumulation view no commercial app ships.
// Settles the month (earned + retirement draws − spend) and, when the month
// didn't cover itself, prices the gap BOTH ways: in billable hours at the
// after-tax marginal rate, and in basis points of withdrawal if not worked.
// The point is ambient reassurance: a four-figure shortfall is either a day
// or two of clinic THIS YEAR, or a rounding error on the portfolio.

const CURRENT_AGE = computeAge(USER_PROFILE.birthdate) ?? 59;

export default function PaycheckCard({ flows, data, investmentsTotal }) {
  const engagements = data?.retirement?.engagements || [];

  const m = useMemo(() => {
    const earned = flows?.earned || 0;
    const draw = flows?.retirement || 0;
    const spend = flows?.spend || 0;
    const settled = earned + draw - spend;

    // Marginal after-tax value of one more billable hour at the top engagement
    // rate, given this year's engagement gross (numerical derivative).
    const gross = grossAtAge(engagements, CURRENT_AGE + 1);
    const topRate = engagements.reduce((r, e) => Math.max(r, Number(e.rate) || 0), 0) || 250;
    const marginal = (netFrom1099(gross + 1000).net - netFrom1099(gross).net) / 1000;
    const hourly = topRate * Math.max(0.5, marginal);

    return {
      earned, draw, spend, settled, hourly,
      hoursToCover: settled < 0 ? -settled / hourly : 0,
      rateToCover: settled < 0 && investmentsTotal > 0 ? -settled / investmentsTotal : 0,
    };
  }, [flows, engagements, investmentsTotal]);

  const dayOfMonth = new Date().getDate();
  if (!m.earned && !m.draw && !m.spend) return null;

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300">🧾 This month, settled</h2>
        {dayOfMonth <= 10 && <span className="text-xs text-slate-500">{dayOfMonth} days in — settles late-month</span>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Net</div>
          <div className={`text-2xl font-bold mono-nums mt-0.5 ${m.settled >= 0 ? 'text-emerald-400' : 'text-sky-300'}`}>
            {m.settled >= 0 ? '+' : '−'}{money(Math.abs(Math.round(m.settled)))}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            earned {money(m.earned)}{m.draw > 0 ? ` + draws ${money(m.draw)}` : ''} − spend {money(m.spend)}
          </div>
        </div>
        {m.settled >= 0 ? (
          <div className="lg:col-span-3 self-center text-sm text-slate-300">
            Work covered the month. Surplus stays invested — nothing to decide.
          </div>
        ) : (
          <>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">Covered by</div>
              <div className="text-2xl font-bold mt-0.5 text-slate-200">portfolio</div>
              <div className="text-xs text-slate-500 mt-0.5">that's what it's for</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">Priced in hours</div>
              <div className="text-2xl font-bold mono-nums mt-0.5 text-slate-200">≈ {m.hoursToCover.toFixed(0)} hrs</div>
              <div className="text-xs text-slate-500 mt-0.5">at ~{money(Math.round(m.hourly))}/hr after tax — this year, not per month</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide">Or priced in rate</div>
              <div className="text-2xl font-bold mono-nums mt-0.5 text-slate-200">+{pct(m.rateToCover, 2)}</div>
              <div className="text-xs text-slate-500 mt-0.5">added to the year's withdrawal rate if you don't work it</div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
