import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend, Sankey, Layer, Rectangle } from 'recharts';
import { money } from '../utils/format';
import { toLocalMonthStr, monthStart } from '../utils/dateUtils';
import { useRangeTxns } from '../hooks/useRangeTxns';
import { flowsByMonth, categorySpend } from '../utils/cashflow';
import { makeCatOf } from '../utils/classify';

// Cash Flow — same bucket recipe as the Dashboard (utils/cashflow.js), so the two
// can never disagree again. Live classification + credit-card pair-matching mean
// payment legs count nowhere; taxes get their own segment; card refunds net
// against spend instead of masquerading as income.

const CAT_LABEL = {
  housing: 'Housing', utilities: 'Utilities', groceries: 'Groceries', dining: 'Dining',
  transport: 'Transport', insurance: 'Insurance', health: 'Health', entertainment: 'Entertainment',
  shopping: 'Shopping', travel: 'Travel', subscriptions: 'Subscriptions', gifts: 'Gifts',
  fees: 'Fees', maintenance: 'Maintenance', mortgage: 'Mortgage', hoa: 'HOA',
  rental: 'Rental costs', licensing: 'Licensing', 'prof-dev': 'Prof dev',
  'other-exp': 'Other', uncategorized: 'Uncategorized',
};

export default function CashFlow({ recentTxns, data, accounts, acctById, netWorth }) {
  // Full 12-month window query — the 500-txn recentTxns cap rarely covers 12 months.
  const fromMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    return monthStart(toLocalMonthStr(d));
  }, []);
  const windowTxns = useRangeTxns(fromMonth);

  const src = windowTxns ?? recentTxns;
  const ignored = useMemo(() => new Set(data?.ignoredAccounts || []), [data?.ignoredAccounts]);
  const visible = useMemo(() => src.filter(t => !ignored.has(t.accountId)), [src, ignored]);

  // Pair-matching needs the FULL window, so build catOf here rather than reusing
  // the recentTxns-scoped one from useMoneyData.
  const catOf = useMemo(() => makeCatOf(visible, acctById || {}, data?.userRules), [visible, acctById, data?.userRules]);

  const byMonth = useMemo(
    () => flowsByMonth(visible, acctById, catOf).slice(-12).map(r => ({
      ...r, net: r.earned + r.retirement - r.spend - r.taxes,
    })),
    [visible, acctById, catOf],
  );

  // ── Month picker for the Sankey ──
  const monthsAvail = byMonth.map(r => r.month);
  const [selMonth, setSelMonth] = useState(null);
  const month = selMonth && monthsAvail.includes(selMonth) ? selMonth : monthsAvail[monthsAvail.length - 1];
  const monthRow = byMonth.find(r => r.month === month);

  const sankey = useMemo(() => {
    if (!monthRow) return null;
    const { byCategory } = categorySpend(visible, month, catOf);
    const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const top = cats.slice(0, 8);
    const otherSum = cats.slice(8).reduce((s, [, v]) => s + v, 0);
    const inflow = monthRow.earned + monthRow.retirement;
    const outSpend = monthRow.spend + monthRow.taxes;
    const surplus = inflow - outSpend;

    const nodes = [];
    const links = [];

    const srcNodes = [];
    if (monthRow.earned > 0) srcNodes.push(['Earned income', monthRow.earned]);
    if (monthRow.retirement > 0) srcNodes.push(['IRA / TIAA draw', monthRow.retirement]);
    if (surplus < 0) srcNodes.push(['From portfolio/cash', -surplus]);
    srcNodes.forEach(([name]) => nodes.push({ name }));
    const hubIdx = nodes.length;
    nodes.push({ name: month });
    srcNodes.forEach(([, v], i) => links.push({ source: i, target: hubIdx, value: Math.round(v) }));

    const addOut = (name, v) => {
      if (v > 0.5) {
        nodes.push({ name });
        links.push({ source: hubIdx, target: nodes.length - 1, value: Math.round(v) });
      }
    };
    top.forEach(([cat, v]) => addOut(CAT_LABEL[cat] || cat, v));
    if (otherSum > 0) addOut('Everything else', otherSum);
    if (monthRow.taxes > 0) addOut('Taxes', monthRow.taxes);
    if (surplus > 0) addOut('Surplus', surplus);
    if (!links.length) return null;
    return { nodes, links, inflow, outSpend, surplus };
  }, [monthRow, visible, month, catOf]);

  // ── Cash projection (depository balances only — NOT net worth; a $4M portfolio
  // can't be extrapolated from three months of checking-account net) ──
  const cashNow = useMemo(
    () => (accounts || []).filter(a => a.type === 'depository').reduce((s, a) => s + (a.balance || 0), 0),
    [accounts],
  );
  const avgNet = byMonth.length > 0
    ? byMonth.slice(-3).reduce((s, b) => s + b.net, 0) / Math.min(3, byMonth.length)
    : 0;
  const projection = useMemo(() => {
    const out = [];
    let bal = cashNow;
    let [y, m] = toLocalMonthStr().split('-').map(Number);
    for (let i = 0; i < 6; i++) {
      out.push({ month: `${y}-${String(m).padStart(2, '0')}`, balance: Math.round(bal) });
      bal += avgNet;
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }, [cashNow, avgNet]);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Cash Flow</h1>
        <p className="text-slate-400 text-sm">
          Last 12 months · avg net {money(avgNet)}/mo · live-classified, payment legs excluded
        </p>
      </header>

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Income vs spend</h2>
        <div className="h-72">
          {byMonth.length === 0 ? <EmptyMsg /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" style={{ fontSize: 11 }} tickFormatter={(v) => money(v)} />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                <Legend />
                <Bar dataKey="earned" name="earned income" stackId="in" fill="#10b981" />
                <Bar dataKey="retirement" name="IRA / TIAA draw" stackId="in" fill="#0ea5e9" />
                <Bar dataKey="spend" name="spend (refunds netted)" stackId="out" fill="#f43f5e" />
                <Bar dataKey="taxes" name="taxes" stackId="out" fill="#a855f7" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Same recipe as the Dashboard tiles: credit-card payments are transfers (keyword + pair-matched),
          card refunds net against spend, taxes shown separately so estimated-payment months don't read as lifestyle.
        </p>
      </section>

      {/* Where the month went — Sankey */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-300">Where {month} went</h2>
          <select
            value={month || ''}
            onChange={(e) => setSelMonth(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300"
          >
            {monthsAvail.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {sankey ? (
          <>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={{ nodes: sankey.nodes, links: sankey.links }}
                  nodePadding={24}
                  margin={{ top: 10, right: 130, bottom: 10, left: 10 }}
                  link={{ stroke: '#334155', strokeOpacity: 0.55 }}
                  node={<SankeyNode />}
                >
                  <Tooltip formatter={(v) => money(v)} contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                </Sankey>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {money(sankey.inflow)} in · {money(sankey.outSpend)} out ·{' '}
              {sankey.surplus >= 0
                ? <span className="text-emerald-400">{money(sankey.surplus)} surplus</span>
                : <span className="text-sky-300">{money(-sankey.surplus)} covered by portfolio/cash — some months that's the plan</span>}
            </p>
          </>
        ) : <EmptyMsg />}
      </section>

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Cash balance, projected 6 months</h2>
        <div className="h-64">
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
        <p className="text-xs text-slate-500 mt-2">
          Depository balances ({money(cashNow)}) carried forward at the 3-month average net.
          (The old chart projected total net worth from checking-account flows — apples from oranges.)
        </p>
      </section>
    </main>
  );
}

// Custom node: label beside the bar, readable on slate.
function SankeyNode({ x, y, width, height, index, payload, containerWidth }) {
  if (height == null || x == null) return null;
  const isOut = x > (containerWidth ? containerWidth / 2 : 300);
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={Math.max(2, height)} fill="#10b981" fillOpacity={0.85} radius={2} />
      <text
        x={isOut ? x + width + 6 : x - 6}
        y={y + Math.max(2, height) / 2}
        textAnchor={isOut ? 'start' : 'end'}
        dominantBaseline="middle"
        fill="#cbd5e1"
        fontSize={11}
      >
        {payload.name}
      </text>
    </Layer>
  );
}

function EmptyMsg() {
  return (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      No transactions in this window yet.
    </div>
  );
}
