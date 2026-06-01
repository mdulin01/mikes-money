import { useMemo, useState } from 'react';
import { money } from '../utils/format';
import { effectiveClass } from '../utils/classify';

// 2025 single-filer federal brackets (refine yearly). Std deduction single 2025 = 15000.
const BRACKETS = [[0,0.10],[11925,0.12],[48475,0.22],[103350,0.24],[197300,0.32],[250525,0.35],[626350,0.37]];
const STD_DED = 15000, SS_BASE = 176100, NC_STD = 12750, NC_RATE = 0.0425, ADDL_MED_THRESH = 200000;

function fedIncomeTax(taxable) {
  let t = 0;
  for (let i = 0; i < BRACKETS.length; i++) {
    const [lo, rate] = BRACKETS[i];
    const hi = BRACKETS[i + 1] ? BRACKETS[i + 1][0] : Infinity;
    if (taxable > lo) t += (Math.min(taxable, hi) - lo) * rate; else break;
  }
  return Math.round(t);
}
function computeTax(schC, schE, sep) {
  const seBase = Math.max(0, schC) * 0.9235;
  const seTax = Math.round(Math.min(seBase, SS_BASE) * 0.124 + seBase * 0.029 + Math.max(0, seBase - ADDL_MED_THRESH) * 0.009);
  const agi = schC + schE - sep - seTax / 2;
  const fed = fedIncomeTax(Math.max(0, agi - STD_DED));
  const nc = Math.round(Math.max(0, agi - NC_STD) * NC_RATE);
  return { seTax, agi: Math.round(agi), fed, nc, total: fed + seTax + nc };
}

const QUARTERS = [
  { id: 'q1', label: 'Q1', due: '2026-04-15' },
  { id: 'q2', label: 'Q2', due: '2026-06-15' },
  { id: 'q3', label: 'Q3', due: '2026-09-15' },
  { id: 'q4', label: 'Q4', due: '2027-01-15' },
];

export default function Tax({ data, recentTxns = [], accounts = [], updateConfig }) {
  const tc = data?.taxConfig || {};
  const priorFed = tc.priorFedTax ?? 53772;
  const priorState = tc.priorStateTax ?? 9997;
  const priorAGI = tc.priorAGI ?? 247974;
  const sep = tc.sepPlanned ?? 15000;
  const paid = tc.quarterlyPaid || {};
  const shPct = priorAGI > 150000 ? 1.10 : 1.0;

  const acctById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);
  const year = new Date().getFullYear();
  const monthsElapsed = new Date().getMonth() + 1;

  // YTD nets by class from tagged transactions (amount>0 = outflow/expense, <0 = income).
  const ytd = useMemo(() => {
    const cur = recentTxns.filter(t => (t.date || '').startsWith(String(year)));
    let bizInc = 0, bizExp = 0, rentInc = 0, rentExp = 0, splitExp = 0;
    for (const t of cur) {
      const c = effectiveClass(t, acctById); const a = t.amount || 0;
      if (c === 'business') { if (a < 0) bizInc += -a; else bizExp += a; }
      else if (c === 'work-travel') { if (a > 0) bizExp += a; }
      else if (c === 'rental') { if (a < 0) rentInc += -a; else rentExp += a; }
      else if (c === 'split') { if (a > 0) splitExp += a; }
    }
    const schC = bizInc - bizExp - splitExp * 0.5;
    const schE = rentInc - rentExp - splitExp * 0.5;
    return { bizInc, bizExp, rentInc, rentExp, splitExp, schC, schE };
  }, [recentTxns, acctById, year]);

  const ann = monthsElapsed > 0 ? 12 / monthsElapsed : 1;
  const [projC, setProjC] = useState(Math.round(ytd.schC * ann));
  const [projE, setProjE] = useState(Math.round(ytd.schE * ann));
  const proj = useMemo(() => computeTax(projC, projE, sep), [projC, projE, sep]);

  const shFedAnnual = Math.round(priorFed * shPct);
  const shStateAnnual = priorState; // NC: prior-year method
  const shQ = { fed: Math.round(shFedAnnual / 4), state: Math.round(shStateAnnual / 4) };
  const paidFed = Object.values(paid).reduce((s, q) => s + (q?.fed || 0), 0);
  const paidState = Object.values(paid).reduce((s, q) => s + (q?.state || 0), 0);

  const save = (patch) => updateConfig({ taxConfig: { ...tc, ...patch } });
  const setPaid = (qid, field, val) => save({ quarterlyPaid: { ...paid, [qid]: { ...(paid[qid] || {}), [field]: Number(val) || 0 } } });

  const setAside = Math.max(0, proj.total - paidFed - paidState);

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Estimated Taxes</h1>
        <p className="text-slate-400 text-sm">Sole prop · Schedule C + E · single · NC. Estimates — confirm with your CPA.</p>
      </header>

      {/* Safe harbor — the penalty-proof floor */}
      <section className="bg-slate-800 border border-emerald-700/50 rounded-xl p-4">
        <h2 className="font-semibold text-emerald-300 mb-1">🛡️ Safe-harbor floor (avoids penalty)</h2>
        <p className="text-xs text-slate-400 mb-3">{Math.round(shPct * 100)}% of 2025 tax (AGI {money(priorAGI)} &gt; $150k). Pay these on time and you owe no underpayment penalty, regardless of how 2026 turns out.</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-slate-900/50 rounded-lg p-3"><div className="text-xs text-slate-500">Federal / quarter</div><div className="text-xl font-bold">{money(shQ.fed)}</div><div className="text-[11px] text-slate-500">{money(shFedAnnual)}/yr</div></div>
          <div className="bg-slate-900/50 rounded-lg p-3"><div className="text-xs text-slate-500">NC / quarter</div><div className="text-xl font-bold">{money(shQ.state)}</div><div className="text-[11px] text-slate-500">{money(shStateAnnual)}/yr</div></div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-slate-500 text-xs"><th className="text-left">Quarter</th><th className="text-left">Due</th><th className="text-right">Fed paid</th><th className="text-right">NC paid</th></tr></thead>
          <tbody>
            {QUARTERS.map(q => (
              <tr key={q.id} className="border-t border-slate-700/60">
                <td className="py-1.5">{q.label}</td>
                <td className="text-slate-400">{q.due}</td>
                <td className="text-right"><input type="number" value={paid[q.id]?.fed || ''} placeholder={String(shQ.fed)} onChange={e => setPaid(q.id, 'fed', e.target.value)} className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-xs" /></td>
                <td className="text-right"><input type="number" value={paid[q.id]?.state || ''} placeholder={String(shQ.state)} onChange={e => setPaid(q.id, 'state', e.target.value)} className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-xs" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs text-slate-400 mt-2">Paid so far: {money(paidFed)} fed · {money(paidState)} NC · remaining to floor: {money(Math.max(0, shFedAnnual - paidFed))} fed / {money(Math.max(0, shStateAnnual - paidState))} NC</div>
      </section>

      {/* Projected actual from YTD class-tagged data */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="font-semibold mb-1">📈 Projected 2026 actual</h2>
        <p className="text-xs text-slate-400 mb-3">From your class-tagged transactions, annualized ({monthsElapsed} mo of data). 2026 is all-1099 with no withholding, so this usually exceeds the floor — set the difference aside for April.</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-xs text-slate-400">Projected Schedule C net (business)
            <input type="number" value={projC} onChange={e => setProjC(Number(e.target.value) || 0)} className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-slate-400">Projected Schedule E net (rental)
            <input type="number" value={projE} onChange={e => setProjE(Number(e.target.value) || 0)} className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm" /></label>
        </div>
        <div className="text-[11px] text-slate-500 mb-3">YTD tagged: biz income {money(ytd.bizInc)} − exp {money(ytd.bizExp)} · rental {money(ytd.rentInc)} − {money(ytd.rentExp)} · Liam/split {money(ytd.splitExp)} (50/50). Less SEP {money(sep)}.</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[['SE tax', proj.seTax], ['Fed income', proj.fed], ['NC', proj.nc], ['Total', proj.total]].map(([l, v]) => (
            <div key={l} className={`rounded-lg p-2 ${l === 'Total' ? 'bg-blue-900/40 border border-blue-700' : 'bg-slate-900/50'}`}>
              <div className="text-[10px] text-slate-500">{l}</div><div className="text-sm font-bold">{money(v)}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm">Projected total {money(proj.total)} − paid {money(paidFed + paidState)} = <span className="font-bold text-amber-300">{money(setAside)} to set aside</span> for the April balance.</div>
      </section>

      {/* Assumptions (editable) */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="font-semibold mb-2 text-sm">Assumptions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-400">
          {[['priorFedTax', '2025 fed tax', priorFed], ['priorStateTax', '2025 NC tax', priorState], ['priorAGI', '2025 AGI', priorAGI], ['sepPlanned', 'SEP planned', sep]].map(([k, l, v]) => (
            <label key={k}>{l}<input type="number" defaultValue={v} onBlur={e => save({ [k]: Number(e.target.value) || 0 })} className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100" /></label>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Note: QBI deduction not modeled — medical consulting is an SSTB and likely phases out at your income, but confirm with your CPA. NC rate {Math.round(NC_RATE * 1000) / 10}%.</p>
      </section>
    </main>
  );
}
