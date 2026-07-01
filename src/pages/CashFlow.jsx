import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend } from 'recharts';
import { money } from '../utils/format';
import { toLocalMonthStr, monthStart } from '../utils/dateUtils';
import { useRangeTxns } from '../hooks/useRangeTxns';

export default function CashFlow({ recentTxns, data, netWorth }) {
  // Full 12-month window query — the 500-txn recentTxns cap rarely covers 12 months.
  const fromMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    return monthStart(toLocalMonthStr(d));
  }, []);
  const windowTxns = useRangeTxns(fromMonth);

  // Aggregate last 12 months of income vs expense (IRA draws broken out from earned income).
  const byMonth = useMemo(() => {
    const ignored = new Set(data?.ignoredAccounts || []);
    const src = windowTxns ?? recentTxns;
    const buckets = {};
    for (const t of src) {
      if (!t.date || t.category === 'transfer' || ignored.has(t.accountId)) continue;
      const m = t.date.slice(0, 7);
      if (!buckets[m]) buckets[m] = { month: m, income: 0, iraDraw: 0, expense: 0 };
      if (t.amount < 0) {
        if (t.category === 'retirement-inc') buckets[m].iraDraw += -t.amount;
        else buckets[m].income += -t.amount;
      } else buckets[m].expense += t.amount;
    }
    return Object.values(buckets)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(b => ({ ...b, net: b.income + b.iraDraw - b.expense }))
      .slice(-12);
  }, [windowTxns, recentTxns, data?.ignoredAccounts]);

  // Projected balance next 6 months based on avg net
  const avgNet = byMonth.length > 0
    ? byMonth.slice(-3).reduce((s, b) => s + b.net, 0) / Math.min(3, byMonth.length)
    : 0;

  const projection = useMemo(() => {
    const out = [];
    let bal = netWorth;
    const now = toLocalMonthStr();
    let [y, m] = now.split('-').map(Number);
    for (let i = 0; i < 6; i++) {
      out.push({ month: `${y}-${String(m).padStart(2, '0')}`, balance: Math.round(bal) });
      bal += avgNet;
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }, [netWorth, avgNet]);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Cash Flow</h1>
        <p className="text-slate-400 text-sm">Last 12 months · projecting {money(avgNet)}/mo net</p>
      </header>

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Income vs Spend</h2>
        <div className="h-72">
          {byMonth.length === 0 ? <EmptyMsg /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} tickFormatter={(v) => money(v)} />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                <Legend />
                <Bar dataKey="income" name="earned income" stackId="in" fill="#10b981" />
                <Bar dataKey="iraDraw" name="IRA draw" stackId="in" fill="#0ea5e9" />
                <Bar dataKey="expense" fill="#f43f5e" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Projected net worth (6 mo, trend-based)</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projection}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} tickFormatter={(v) => money(v)} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
              <Line type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}

function EmptyMsg() {
  return (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      No transactions yet — link an account to see cash flow.
    </div>
  );
}
