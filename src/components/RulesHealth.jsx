import { useMemo, useState } from 'react';
import { money } from '../utils/format';
import { useRangeTxns } from '../hooks/useRangeTxns';
import { useToast } from './Toast';

// Rules health check — audits every ✨-saved user rule against this year's transactions.
//
// Why this exists: user rules run BEFORE built-ins and always win, so one overbroad
// keyword can silently poison everything downstream. A saved rule kw:['payment']
// once categorized $60k of card payments + Zelle rents as "Other Income" and skewed
// the savings rate for months before anyone noticed. These checks catch that on day one:
//   🚨 income category applied to money-out (or expense category to money-in)
//   ⚠ overbroad (>20 matches) · ⚠ matches both directions · ⚠ very short keyword
const OVERBROAD_AT = 20;

export default function RulesHealth({ data, removeUserRule }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const year = new Date().getFullYear();
  const txns = useRangeTxns(open ? `${year}-01-01` : null);
  const rules = data?.userRules || [];
  const catById = useMemo(() => Object.fromEntries((data?.categories || []).map(c => [c.id, c])), [data?.categories]);

  const report = useMemo(() => {
    if (!txns) return null;
    return rules.map(rule => {
      const kws = (rule.kw || []).map(k => String(k).toLowerCase());
      let inN = 0, outN = 0, inTot = 0, outTot = 0;
      for (const t of txns) {
        const payee = `${t.merchantName || ''} ${t.name || ''}`.toLowerCase();
        if (!kws.some(k => payee.includes(k))) continue;
        if ((t.amount || 0) < 0) { inN++; inTot += -t.amount; } else { outN++; outTot += t.amount; }
      }
      const n = inN + outN;
      const kind = rule.category ? catById[rule.category]?.kind : null;
      const flags = [];
      if (kind === 'income' && outN > 0 && outN >= inN) flags.push({ sev: 2, msg: `🚨 income category on ${outN} money-OUT txns` });
      if (kind === 'expense' && inN > 0 && inN >= outN) flags.push({ sev: 2, msg: `🚨 expense category on ${inN} money-IN txns` });
      if (n > OVERBROAD_AT) flags.push({ sev: 1, msg: `⚠ overbroad — ${n} matches` });
      if (inN > 0 && outN > 0 && !flags.some(f => f.sev === 2)) flags.push({ sev: 1, msg: `⚠ matches both directions (${inN} in / ${outN} out)` });
      if ((kws[0] || '').length < 6) flags.push({ sev: 1, msg: `⚠ very short keyword "${kws[0]}"` });
      const sev = Math.max(0, ...flags.map(f => f.sev));
      return { rule, kws, n, inN, outN, inTot, outTot, flags, sev };
    }).sort((a, b) => b.sev - a.sev || b.n - a.n);
  }, [txns, rules, catById]);

  const flagged = report?.filter(r => r.sev > 0).length ?? 0;

  return (
    <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">
          🩺 Rules health <span className="text-slate-500 font-normal">· {rules.length} saved rules</span>
        </h2>
        <button onClick={() => setOpen(o => !o)} className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg">
          {open ? 'Hide' : 'Run check'}
        </button>
      </div>
      {open && !report && <p className="text-sm text-slate-500 mt-3 animate-pulse">Auditing rules against {year} transactions…</p>}
      {open && report && (
        <>
          <p className={`text-xs mt-2 ${flagged ? 'text-amber-300' : 'text-emerald-400'}`}>
            {flagged ? `${flagged} rule${flagged === 1 ? '' : 's'} flagged — review below (worst first)` : '✓ No problems found'}
          </p>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1">Keyword</th>
                  <th className="text-left px-2">Sets</th>
                  <th className="text-right px-2">Matches</th>
                  <th className="text-right px-2">$ in / out</th>
                  <th className="text-left px-2">Flags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.map(({ rule, kws, n, inN, outN, inTot, outTot, flags, sev }) => (
                  <tr key={kws[0]} className={`border-t border-slate-700/50 ${sev === 2 ? 'bg-rose-950/30' : sev === 1 ? 'bg-amber-950/20' : ''}`}>
                    <td className="py-1.5 pr-2 text-slate-300 max-w-[220px] truncate" title={kws.join(', ')}>{kws[0]}</td>
                    <td className="px-2 text-slate-400 whitespace-nowrap">
                      {rule.category ? `${catById[rule.category]?.emoji || ''}${catById[rule.category]?.label || rule.category}` : '—'}
                      {rule.klass ? ` · ${rule.klass}` : ''}{rule.propertyId ? ` · ${rule.propertyId}` : ''}
                    </td>
                    <td className="px-2 text-right mono-nums">{n}{n > 0 && <span className="text-slate-600"> ({inN}↓/{outN}↑)</span>}</td>
                    <td className="px-2 text-right mono-nums text-slate-400">{inTot ? money(inTot) : '—'} / {outTot ? money(outTot) : '—'}</td>
                    <td className="px-2">
                      {flags.length === 0
                        ? <span className={n === 0 ? 'text-slate-600' : 'text-emerald-500'}>{n === 0 ? 'inactive this year' : '✓'}</span>
                        : flags.map((f, i) => <div key={i} className={f.sev === 2 ? 'text-rose-300' : 'text-amber-300'}>{f.msg}</div>)}
                    </td>
                    <td className="pl-2 text-right">
                      <button
                        onClick={() => { if (confirm(`Delete rule "${kws[0]}"? Already-stamped transactions keep their categories.`)) { removeUserRule(kws[0]); toast('Rule deleted', 'info'); } }}
                        className="text-slate-500 hover:text-rose-400">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            User rules run before built-ins and always win — an overbroad keyword silently rewrites everything it touches
            (a rule for "payment" once turned $60k of card payments into income). Deleting a rule doesn't re-categorize
            already-stamped transactions; run Auto-categorize after cleanup.
          </p>
        </>
      )}
    </section>
  );
}
