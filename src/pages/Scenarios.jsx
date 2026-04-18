import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { money } from '../utils/format';

/**
 * Simple scenario modeler.
 * A scenario is: { id, name, startingBalance, monthlyContribution, annualReturn, years, monthlyWithdrawal }
 * Output: projected balance over `years` at monthly compounding.
 */
function project(s) {
  const months = s.years * 12;
  const r = (s.annualReturn || 0) / 12;
  const out = [];
  let bal = s.startingBalance || 0;
  for (let i = 0; i <= months; i++) {
    out.push({ month: i, balance: Math.round(bal) });
    bal = bal * (1 + r) + (s.monthlyContribution || 0) - (s.monthlyWithdrawal || 0);
  }
  return out;
}

export default function Scenarios({ data, netWorth, addScenario, updateScenario, deleteScenario }) {
  const scenarios = data?.scenarios || [];
  const [editing, setEditing] = useState(null);
  const blank = {
    name: 'New scenario',
    startingBalance: Math.round(netWorth || 0),
    monthlyContribution: 3000,
    annualReturn: 0.07,
    years: 20,
    monthlyWithdrawal: 0,
  };

  const chartData = useMemo(() => {
    const rows = {};
    for (const s of scenarios) {
      const points = project(s);
      for (const p of points) {
        if (!rows[p.month]) rows[p.month] = { month: p.month };
        rows[p.month][s.name] = p.balance;
      }
    }
    return Object.values(rows);
  }, [scenarios]);

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7', '#06b6d4'];

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Scenarios</h1>
          <p className="text-slate-400 text-sm">What-if models · {scenarios.length} active</p>
        </div>
        <button
          onClick={() => setEditing({ ...blank })}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm"
        >
          + New
        </button>
      </header>

      {editing && (
        <ScenarioForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (s) => {
            if (s.id) await updateScenario(s.id, s);
            else await addScenario(s);
            setEditing(null);
          }}
        />
      )}

      {scenarios.length > 0 && (
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Projected balances</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: 11 }}
                  tickFormatter={(m) => m % 12 === 0 ? `Y${m / 12}` : ''} />
                <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} tickFormatter={(v) => money(v)} />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                <Legend />
                {scenarios.map((s, i) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.name}
                    stroke={colors[i % colors.length]}
                    dot={false}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="space-y-2">
        {scenarios.map(s => (
          <div key={s.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{s.name}</div>
              <div className="text-slate-500 text-xs">
                Start {money(s.startingBalance)} · +{money(s.monthlyContribution)}/mo · {(s.annualReturn * 100).toFixed(1)}% · {s.years}y
              </div>
            </div>
            <div className="mono-nums text-emerald-400">
              {money(project(s).at(-1)?.balance)}
            </div>
            <button onClick={() => setEditing(s)} className="text-slate-400 hover:text-slate-200 text-xs">Edit</button>
            <button onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteScenario(s.id); }} className="text-slate-500 hover:text-rose-400 text-xs">Delete</button>
          </div>
        ))}
        {scenarios.length === 0 && !editing && (
          <p className="text-slate-500 text-sm text-center py-8">
            No scenarios yet. Create one to model retirement, a home purchase, or a career change.
          </p>
        )}
      </section>
    </main>
  );
}

function ScenarioForm({ initial, onSave, onCancel }) {
  const [s, setS] = useState(initial);
  const set = (k) => (e) => setS(prev => ({ ...prev, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  return (
    <div className="bg-slate-800 border border-emerald-900/40 rounded-xl p-4 space-y-3">
      <input value={s.name} onChange={set('name')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <Field label="Start balance"><input type="number" value={s.startingBalance} onChange={set('startingBalance')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-sm" /></Field>
        <Field label="Monthly add"><input type="number" value={s.monthlyContribution} onChange={set('monthlyContribution')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-sm" /></Field>
        <Field label="Monthly withdraw"><input type="number" value={s.monthlyWithdrawal} onChange={set('monthlyWithdrawal')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-sm" /></Field>
        <Field label="Annual return"><input type="number" step="0.01" value={s.annualReturn} onChange={set('annualReturn')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-sm" /></Field>
        <Field label="Years"><input type="number" value={s.years} onChange={set('years')} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 mono-nums text-sm" /></Field>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave(s)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm">Save</button>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-200 text-sm">Cancel</button>
      </div>
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
