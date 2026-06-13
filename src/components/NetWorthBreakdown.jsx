import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { money } from '../utils/format';

// Empower-style net-worth components. Buckets the per-type balances into
// Investments / Cash / Real estate / Debt, shows a current composition bar, and
// lets you tap a component to chart it over time (from dashboardSnapshots.byType).
const BUCKETS = [
  { key: 'total',    label: 'Net worth',   color: '#38bdf8' },
  { key: 'invest',   label: 'Investments', color: '#34d399' },
  { key: 'cash',     label: 'Cash',        color: '#60a5fa' },
  { key: 'realother',label: 'Real estate', color: '#a78bfa' },
  { key: 'debt',     label: 'Debt',        color: '#fb7185' },
];

// Sum a byType array (live or snapshot) into the four buckets (+ derived total).
function bucketize(byType) {
  const b = { invest: 0, cash: 0, realother: 0, debt: 0 };
  for (const g of byType || []) {
    const t = g.total || 0;
    if (g.id === 'investment') b.invest += t;
    else if (g.id === 'depository') b.cash += t;
    else if (g.id === 'real-estate' || g.id === 'other') b.realother += t;
    else if (g.side === 'liability') b.debt += t; // loan/credit/mortgage
  }
  b.total = b.invest + b.cash + b.realother - b.debt;
  return b;
}

export default function NetWorthBreakdown({ byType, snapshotHistory }) {
  const [sel, setSel] = useState('total');
  const cur = useMemo(() => bucketize(byType), [byType]);
  const assets = cur.invest + cur.cash + cur.realother;

  const series = useMemo(() => {
    return (snapshotHistory || [])
      .filter((sn) => sn.date && Array.isArray(sn.byType))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((sn) => { const b = bucketize(sn.byType); return { date: sn.date, value: sn[sel] === undefined ? b[sel] : b[sel] }; });
  }, [snapshotHistory, sel]);

  const selCfg = BUCKETS.find((x) => x.key === sel);
  const selVal = cur[sel];
  const compBar = [
    { key: 'invest', label: 'Investments', v: cur.invest, color: '#34d399' },
    { key: 'cash', label: 'Cash', v: cur.cash, color: '#60a5fa' },
    { key: 'realother', label: 'Real estate', v: cur.realother, color: '#a78bfa' },
  ];

  return (
    <section className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold">Net worth components</h2>
        <div className="flex gap-1 flex-wrap">
          {BUCKETS.map((b) => (
            <button key={b.key} onClick={() => setSel(b.key)}
              className={`text-xs px-2.5 py-1 rounded-lg whitespace-nowrap ${sel === b.key ? 'text-white' : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'}`}
              style={sel === b.key ? { background: b.color + '33', border: `1px solid ${b.color}`, color: b.color } : {}}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Current composition bar (assets) */}
      <div>
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-700">
          {compBar.filter((c) => c.v > 0).map((c) => (
            <div key={c.key} title={`${c.label}: ${money(c.v)}`} style={{ width: `${assets ? (c.v / assets) * 100 : 0}%`, background: c.color }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
          {compBar.map((c) => (
            <span key={c.key} className="text-slate-300"><span style={{ color: c.color }}>●</span> {c.label} {money(c.v)} <span className="text-slate-500">{assets ? Math.round((c.v / assets) * 100) : 0}%</span></span>
          ))}
          {cur.debt > 0 && <span className="text-slate-300"><span style={{ color: '#fb7185' }}>●</span> Debt {money(-cur.debt)}</span>}
        </div>
      </div>

      {/* Selected component over time */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm text-slate-400">{selCfg.label}</span>
          <span className="text-lg font-bold mono-nums" style={{ color: selCfg.color }}>{money(selVal)}</span>
        </div>
        {series.length >= 2 ? (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`g-${sel}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={selCfg.color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={selCfg.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(d) => d.slice(5)} minTickGap={28} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} formatter={(v) => money(v)} labelStyle={{ color: '#94a3b8' }} />
              <Area type="monotone" dataKey="value" stroke={selCfg.color} strokeWidth={2} fill={`url(#g-${sel})`} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-xs py-6 text-center">Trend builds as daily snapshots accumulate (one per day you open the app).</p>
        )}
      </div>
    </section>
  );
}
