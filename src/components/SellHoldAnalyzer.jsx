import { useMemo, useState } from 'react';
import { money, pct } from '../utils/format';
import { MORTGAGES, PURCHASES } from '../data/mortgages';
import { monthsUntil } from '../utils/amortize';
import { compare, yearsHeld } from '../utils/sellHold';

// Sell-vs-hold analyzer — per rental: after-tax proceeds if sold now (invested at the
// alternative return) vs holding (cash flows + sale at the horizon), future-value
// compared at the horizon. The breakeven column is the headline: the appreciation
// rate each property must deliver for holding to beat selling.

const DEFAULTS = {
  sellingCostPct: 0.06,
  ltcgRate: 0.15,
  recaptureRate: 0.25,
  ncRate: 0.0425,
  buildingPct: 0.80,
  appreciationRate: 0.03,
  rentGrowth: 0.02,
  maintenancePct: 0.08,
  altReturn: 0.06,
  horizon: 10,
};

export default function SellHoldAnalyzer({ data, updateConfig }) {
  const saved = data?.sellHold || {};
  const [a, setA] = useState({ ...DEFAULTS, ...(saved.assumptions || {}) });
  const [overrides, setOverrides] = useState(saved.overrides || {});
  const set = (k) => (e) => setA(s => ({ ...s, [k]: Number(e.target.value) || 0 }));
  const save = () => updateConfig({ sellHold: { assumptions: a, overrides } });
  const setOv = (id, k, v) => setOverrides(o => ({ ...o, [id]: { ...(o[id] || {}), [k]: Number(v) || 0 } }));

  const rows = useMemo(() => MORTGAGES
    .filter(m => m.schedule === 'rental' && PURCHASES[m.id])
    .map(m => {
      const pu = PURCHASES[m.id];
      const ov = overrides[m.id] || {};
      const p = {
        id: m.id, nickname: m.nickname,
        purchasePrice: pu.purchasePrice, purchaseDate: pu.purchaseDate,
        estValue: ov.estValue ?? pu.estValue,
        monthlyRent: ov.monthlyRent ?? pu.monthlyRent,
        monthlyOtherCosts: ov.monthlyOtherCosts ?? pu.monthlyOtherCosts,
        balance: m.balance, rate: m.rate,
        remMonths: monthsUntil(m.maturity) || 340,
        debtService: m.monthlyEquivalent,
      };
      return { p, r: compare(p, a) };
    })
    .sort((x, y) => x.r.edge - y.r.edge), [a, overrides]);

  const totalSellNow = rows.reduce((s, { r }) => s + r.sellNow.netProceeds, 0);

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-300">⚖️ Sell vs hold analyzer</h2>
        <button onClick={save} className="text-xs text-slate-400 hover:text-slate-200">Save inputs</button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Purchase data from Redfin sale records (all four bought 2024 — hence the 7% mortgages). Depreciation estimated at
        {' '}{Math.round(a.buildingPct * 100)}% building basis / 27.5-yr SL; your CPA's schedules refine it. Not advice — a decision aid.
      </p>

      {/* Assumptions */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2 text-xs mb-4">
        {[
          ['appreciationRate', `Appreciation %/yr`, 0.0025],
          ['altReturn', `Alt return %/yr`, 0.0025],
          ['horizon', 'Horizon (yrs)', 1],
          ['sellingCostPct', 'Selling cost %', 0.0025],
          ['maintenancePct', 'Maintenance % rent', 0.005],
          ['rentGrowth', 'Rent growth %/yr', 0.0025],
          ['ltcgRate', 'LTCG rate', 0.0025],
          ['recaptureRate', 'Recapture rate', 0.0025],
          ['ncRate', 'NC rate', 0.0025],
          ['buildingPct', 'Building % of basis', 0.025],
        ].map(([k, label, step]) => (
          <label key={k} className="block">
            <div className="text-slate-500 mb-0.5 truncate">{label}</div>
            <input type="number" step={step} value={a[k]} onChange={set(k)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 mono-nums" />
          </label>
        ))}
      </div>

      {/* Verdict table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left py-1">Property</th>
              <th className="text-right px-2">Held</th>
              <th className="text-right px-2">Value / rent / costs (edit)</th>
              <th className="text-right px-2">Cash flow yr 1</th>
              <th className="text-right px-2">Sell now nets</th>
              <th className="text-right px-2">FV sell vs hold ({a.horizon}y)</th>
              <th className="text-right px-2">Breakeven appr.</th>
              <th className="text-right pl-2">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, r }) => {
              const verdict = r.edge > 15000 ? { t: 'HOLD', c: 'text-emerald-400' }
                : r.edge < -15000 ? { t: 'SELL', c: 'text-rose-400' }
                : { t: 'CLOSE', c: 'text-amber-300' };
              return (
                <tr key={p.id} className="border-t border-slate-700/60 align-top">
                  <td className="py-2 pr-1">
                    <div className="text-slate-200 font-medium">{p.nickname}</div>
                    <div className="text-[10px] text-slate-500">bought {p.purchaseDate.slice(0, 7)} · {money(p.purchasePrice)}</div>
                  </td>
                  <td className="px-2 text-right mono-nums text-slate-400">{yearsHeld(p.purchaseDate).toFixed(1)}y</td>
                  <td className="px-2 text-right">
                    <div className="flex flex-col gap-0.5 items-end">
                      <input type="number" value={p.estValue} onChange={e => setOv(p.id, 'estValue', e.target.value)} className="w-24 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right mono-nums" title="Est. market value" />
                      <div className="flex gap-1">
                        <input type="number" value={p.monthlyRent} onChange={e => setOv(p.id, 'monthlyRent', e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right mono-nums" title="Monthly rent" />
                        <input type="number" value={p.monthlyOtherCosts} onChange={e => setOv(p.id, 'monthlyOtherCosts', e.target.value)} className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right mono-nums" title="Monthly HOA / non-escrowed tax+ins" />
                      </div>
                    </div>
                  </td>
                  <td className={`px-2 text-right mono-nums ${r.cfYear1 >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(Math.round(r.cfYear1 / 12))}/mo</td>
                  <td className="px-2 text-right mono-nums text-slate-200" title={`Friction: ${money(Math.round(r.sellNow.totalFriction))} (costs ${money(Math.round(r.sellNow.saleValue - r.sellNow.netSale))} + fed ${money(Math.round(r.sellNow.fedTax))} + NC ${money(Math.round(r.sellNow.ncTax))}) · payoff ${money(Math.round(r.sellNow.loanBal))}`}>
                    {money(Math.round(r.sellNow.netProceeds))}
                  </td>
                  <td className="px-2 text-right mono-nums text-slate-400">{money(Math.round(r.fvSell / 1000))}k / {money(Math.round(r.fvHold / 1000))}k</td>
                  <td className="px-2 text-right mono-nums text-slate-300">{r.breakeven == null ? '>10%' : pct(r.breakeven, 2)}</td>
                  <td className={`pl-2 text-right font-bold ${verdict.c}`}>{verdict.t}<div className="text-[10px] font-normal text-slate-500">{r.edge >= 0 ? '+' : ''}{money(Math.round(r.edge / 1000))}k</div></td>
                </tr>
              );
            })}
            <tr className="border-t border-slate-600">
              <td className="py-2 font-semibold" colSpan={4}>Liquidate everything today</td>
              <td className="px-2 text-right mono-nums font-bold text-slate-100">{money(Math.round(totalSellNow))}</td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500 mt-3">
        How to read it: <span className="text-slate-300">Breakeven appr.</span> is the annual appreciation a property must deliver for holding to beat
        selling now and investing the proceeds at {pct(a.altReturn, 1)} — below your expectation ⇒ hold, above ⇒ sell. Verdicts compare
        future value at year {a.horizon}; ±$15k is a coin flip. Hover "Sell now nets" for the friction breakdown. Selling stacks gains onto
        the same 2027–2029 low-income window as Roth conversions and the 2030 IRMAA lookback — sequence with the Retirement page planners.
        Estimates only — confirm basis/depreciation with your CPA before listing anything.
      </p>
    </section>
  );
}
