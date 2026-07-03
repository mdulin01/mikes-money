import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { money, pct } from '../utils/format';
import { MORTGAGES, MORTGAGES_AS_OF } from '../data/mortgages';
import { monthlyPI, monthsUntil, project, refiCompare } from '../utils/amortize';
import SellHoldAnalyzer from '../components/SellHoldAnalyzer';

// Mortgages — portfolio debt overview + payoff projections + refinance planner.
// Loan facts hand-captured from the Rocket servicing portal (see data/mortgages.js);
// live balances join from Plaid where the loan is linked (masks 4904/3780/0576).

const COLORS = { hillcrest: '#10b981', 'prairie-trail': '#f59e0b', 'green-crest': '#38bdf8', 'north-elm': '#a78bfa', 'n-church': '#64748b' };

export default function Mortgages({ accounts = [], data, updateConfig }) {
  const loans = useMemo(() => MORTGAGES.map(l => {
    // Prefer live Plaid balance when the loan is linked
    const plaid = l.plaidMask ? accounts.find(a => a.mask === l.plaidMask && ['loan', 'mortgage'].includes(a.type)) : null;
    const balance = plaid?.balance || l.balance;
    const remMonths = monthsUntil(l.maturity);
    const pi = balance && l.rate && remMonths ? monthlyPI(balance, l.rate, remMonths) : null;
    const escrowEst = pi && l.monthlyEquivalent ? Math.max(0, l.monthlyEquivalent - pi) : null;
    return { ...l, balance, live: !!plaid, remMonths, pi, escrowEst };
  }), [accounts]);

  const rentals = loans.filter(l => l.schedule === 'rental' && l.balance);
  const totalDebt = rentals.reduce((s, l) => s + l.balance, 0);
  const weightedRate = totalDebt > 0 ? rentals.reduce((s, l) => s + l.balance * l.rate, 0) / totalDebt : 0;
  const totalMonthly = loans.reduce((s, l) => s + (l.monthlyEquivalent || 0), 0);
  const totalEquity = rentals.reduce((s, l) => s + (l.estEquity || 0), 0);
  const annualInterest = rentals.reduce((s, l) => s + l.balance * l.rate, 0);

  // Payoff projection chart (rentals with known terms)
  const chartData = useMemo(() => {
    const series = rentals.map(l => ({ id: l.id, proj: project(l.balance, l.rate, l.monthlyEquivalent) }));
    const byMonth = {};
    for (const s of series) {
      for (const p of s.proj.points) {
        (byMonth[p.month] = byMonth[p.month] || { month: p.month })[s.id] = p.balance;
      }
    }
    return Object.values(byMonth).sort((a, b) => a.month - b.month).filter(r => r.month % 12 === 0).map(r => ({ ...r, year: 2026 + Math.round(r.month / 12) }));
  }, [rentals]);

  // ---- Refi planner state ----
  const [refiId, setRefiId] = useState('prairie-trail');
  const [newRate, setNewRate] = useState(0.0625);
  const [newTerm, setNewTerm] = useState(360);
  const [costs, setCosts] = useState(4500);
  const target = loans.find(l => l.id === refiId);
  const refi = useMemo(() => {
    if (!target?.balance || !target.rate) return null;
    return refiCompare({ balance: target.balance, rate: target.rate, monthlyPayment: target.pi || target.monthlyEquivalent, newRate, newTermMonths: newTerm, closingCosts: costs, financeCosts: true });
  }, [target, newRate, newTerm, costs]);

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Mortgages</h1>
        <p className="text-slate-400 text-sm">Captured from Rocket servicing {MORTGAGES_AS_OF} · Plaid-linked balances live</p>
      </header>

      {/* Portfolio headline */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label="Rental mortgage debt" value={money(totalDebt)} tone="text-rose-400" />
        <Tile label="Weighted rate" value={pct(weightedRate, 2)} hint="rental loans, balance-weighted" />
        <Tile label="Interest cost / yr" value={money(Math.round(annualInterest))} hint="at current balances (deductible on Sch E)" />
        <Tile label="Total debt service" value={`${money(Math.round(totalMonthly))}/mo`} hint="incl. N. Church (Guild)" />
        <Tile label="Rocket-estimated equity" value={money(totalEquity)} tone="text-emerald-400" hint="rentals (excl. Prairie — no estimate)" />
      </section>

      {/* Per-loan cards */}
      <section className="grid md:grid-cols-2 gap-4">
        {loans.map(l => (
          <div key={l.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-slate-100">{l.nickname}</h2>
              <span className="text-xs text-slate-500">{l.servicer}{l.live ? ' · live balance' : ''}</span>
            </div>
            <div className="text-2xl font-bold mono-nums mt-1">{l.balance ? money(l.balance) : '— unknown —'}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs text-slate-400">
              <Row k="Rate" v={l.rate ? pct(l.rate, 3) : '?'} warn={l.rate >= 0.075} />
              <Row k="Payment" v={`${money(l.paymentPerDraft)} ${l.paySchedule === 'biweekly' ? '×2/mo' : '/mo'}`} />
              {l.pi != null && <Row k="P&I / escrow (est)" v={`${money(Math.round(l.pi))} / ${money(Math.round(l.escrowEst))}`} />}
              {l.maturity && <Row k="Maturity" v={l.maturity.slice(0, 7)} />}
              {l.estEquity != null && <Row k="Est. equity" v={money(l.estEquity)} good />}
              {l.extraPrincipalPaid > 0 && <Row k="Extra principal → saved" v={`${money(l.extraPrincipalPaid)} → ${money(Math.round(l.interestSaved))} (${l.payoffEarlierBy} early)`} good />}
              {l.loanNo && <Row k="Loan #" v={l.loanNo} />}
            </div>
            {!l.rate && (
              <p className="text-[11px] text-amber-300/80 mt-2">Rate/balance unknown — fill in data/mortgages.js from a statement to include it in projections.</p>
            )}
            {l.id === 'n-church' && l.rate && (
              <p className="text-[11px] text-slate-500 mt-2">Cheapest debt in the portfolio at {pct(l.rate, 2)} — keep it; payment includes escrow (bal. $4,015 on 7/2).</p>
            )}
          </div>
        ))}
      </section>

      {/* Payoff projection */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Payoff trajectories (current payments, incl. biweekly effect)</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="year" stroke="#94a3b8" style={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} width={70} tickFormatter={(v) => money(v)} />
              <Tooltip formatter={(v, k) => [money(v), k]} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              <Legend />
              {rentals.map(l => (
                <Line key={l.id} type="monotone" dataKey={l.id} name={l.nickname} stroke={COLORS[l.id]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Biweekly loans (Hillcrest, Green Crest, N. Elm) make 13 monthly-equivalent payments a year — that's the
          Rocket-reported {money(17010 + 14750 + 10995)} of interest already saved across the three.
        </p>
      </section>

      {/* Refinance planner */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-1">🔄 Refinance planner</h2>
        <p className="text-xs text-slate-500 mb-3">
          The 7.5% loans (Prairie, Green Crest) are the refi candidates — the 6.99% pair needs a bigger rate drop to clear costs.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
          <Field label="Loan">
            <select value={refiId} onChange={e => setRefiId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
              {loans.filter(l => l.balance && l.rate).map(l => <option key={l.id} value={l.id}>{l.nickname} · {pct(l.rate, 2)}</option>)}
            </select>
          </Field>
          <Field label={`New rate (${(newRate * 100).toFixed(2)}%)`}>
            <input type="number" step="0.00125" value={newRate} onChange={e => setNewRate(Number(e.target.value) || 0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="New term (months)">
            <input type="number" step="60" value={newTerm} onChange={e => setNewTerm(Number(e.target.value) || 360)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
          <Field label="Closing costs (financed)">
            <input type="number" step="500" value={costs} onChange={e => setCosts(Number(e.target.value) || 0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums" />
          </Field>
        </div>
        {refi && target && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="New P&I" value={`${money(Math.round(refi.newPI))}/mo`}
              hint={`vs ${money(Math.round(target.pi || target.monthlyEquivalent))} now`} />
            <Tile label="Monthly savings" value={refi.monthlySavings > 0 ? `${money(Math.round(refi.monthlySavings))}/mo` : '— none —'}
              tone={refi.monthlySavings > 0 ? 'text-emerald-400' : 'text-rose-400'} />
            <Tile label="Breakeven" value={refi.breakevenMonths ? `${refi.breakevenMonths} mo` : 'n/a'}
              hint="months of savings to cover financed costs"
              tone={refi.breakevenMonths && refi.breakevenMonths <= 36 ? 'text-emerald-400' : 'text-amber-300'} />
            <Tile label="Lifetime interest" value={`${refi.lifetimeInterestDelta >= 0 ? 'saves' : 'ADDS'} ${money(Math.round(Math.abs(refi.lifetimeInterestDelta)))}`}
              hint={`${Math.round(refi.currentMonths / 12)}yr now vs ${Math.round(refi.refiMonths / 12)}yr refi — watch term resets`}
              tone={refi.lifetimeInterestDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-3">
          Investment-property refis price ~0.5–0.75% above owner-occupied. A term reset can show monthly savings while ADDING
          lifetime interest — the fourth tile is the honest number. Also consider: Rocket "rate drop" offers to existing
          customers sometimes waive costs. Estimates — confirm real quotes before acting.
        </p>
      </section>

      {/* Sell vs hold — after-tax proceeds vs holding through the horizon */}
      <SellHoldAnalyzer data={data} updateConfig={updateConfig} />
    </main>
  );
}

function Tile({ label, value, hint, tone = 'text-slate-100' }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 min-w-0">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide truncate">{label}</div>
      <div className={`text-xl font-bold mono-nums mt-1 ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function Row({ k, v, good, warn }) {
  return (
    <div className="flex justify-between gap-2 min-w-0">
      <span className="text-slate-500 shrink-0">{k}</span>
      <span className={`mono-nums text-right truncate ${good ? 'text-emerald-300' : warn ? 'text-amber-300' : 'text-slate-300'}`}>{v}</span>
    </div>
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
