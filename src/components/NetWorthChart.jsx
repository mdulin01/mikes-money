import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase-config';
import { money, signedMoney, pnlClass } from '../utils/format';
import { useToast } from './Toast';


const RANGES = [
  { id: 'M', label: '1M', days: 30 },
  { id: '3M', label: '3M', days: 90 },
  { id: 'Y', label: '1Y', days: 365 },
  { id: 'ALL', label: 'All', days: Infinity },
];

export default function NetWorthChart({ history, currentNetWorth }) {
  const [range, setRange] = useState('3M');
  const [snapshotting, setSnapshotting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const toast = useToast();

  const runImport = async () => {
    setImporting(true);
    try {
      const parsed = JSON.parse(importText);
      if (!Array.isArray(parsed)) throw new Error('Top level must be an array');
      const fn = httpsCallable(functions, 'importNetWorthHistory');
      const res = await fn({ records: parsed });
      toast?.(`Imported ${res.data.imported} snapshots`, 'success');
      setImportText('');
      setImportOpen(false);
    } catch (e) {
      console.error(e);
      toast?.(e.message || 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const rangeCfg = RANGES.find(r => r.id === range);

  const data = useMemo(() => {
    if (!history?.length) return [];
    const cutoff = Date.now() - rangeCfg.days * 24 * 60 * 60 * 1000;
    return history
      .filter(h => new Date(h.date + 'T12:00:00').getTime() >= cutoff)
      .map(h => ({ date: h.date, netWorth: h.netWorth }));
  }, [history, rangeCfg]);

  const delta = useMemo(() => {
    if (data.length < 2) return null;
    return data.at(-1).netWorth - data[0].netWorth;
  }, [data]);

  const takeSnapshot = async () => {
    setSnapshotting(true);
    try {
      const fn = httpsCallable(functions, 'snapshotNetWorth');
      const res = await fn({});
      toast?.(`Snapshot saved: ${money(res.data.netWorth)}`, 'success');
    } catch (e) {
      console.error(e);
      toast?.('Snapshot failed — check functions logs', 'error');
    } finally {
      setSnapshotting(false);
    }
  };

  if (!history?.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-300">Net worth over time</h2>
            <p className="text-xs text-slate-500 mt-1">No history yet — first snapshot seeds the chart.</p>
          </div>
          <button
            onClick={takeSnapshot}
            disabled={snapshotting}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
          >
            {snapshotting ? 'Snapshotting…' : 'Take first snapshot'}
          </button>
        </div>
        <p className="text-slate-500 text-sm text-center py-8">
          Daily snapshots run at 7am ET. Click above to capture one now.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-300">Net worth over time</h2>
          {delta !== null && (
            <p className={`text-xs mt-1 ${pnlClass(delta)}`}>
              {signedMoney(delta)} over {rangeCfg.label}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 rounded-lg border border-slate-700 p-0.5">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  range === r.id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={takeSnapshot}
            disabled={snapshotting}
            className="text-slate-400 hover:text-slate-200 text-xs"
            title="Take a snapshot now"
          >
            {snapshotting ? '…' : '↻'}
          </button>
          <button
            onClick={() => setImportOpen(s => !s)}
            className="text-slate-400 hover:text-slate-200 text-xs"
            title="Backfill history (JSON paste)"
          >
            ⇪
          </button>
        </div>
      </div>

      {importOpen && (
        <div className="mb-3 bg-slate-900/60 border border-slate-700 rounded-lg p-3 space-y-2">
          <p className="text-xs text-slate-400">
            Paste a JSON array: <code className="text-emerald-400">{"[{\"date\":\"2025-01-01\",\"netWorth\":2550000}, …]"}</code>
          </p>
          <textarea
            rows={6}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
            placeholder='[{"date":"2024-04-12","netWorth":2280000}]'
          />
          <div className="flex gap-2">
            <button onClick={runImport} disabled={importing || !importText.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg">
              {importing ? 'Importing…' : 'Import'}
            </button>
            <button onClick={() => { setImportOpen(false); setImportText(''); }}
              className="text-slate-400 hover:text-slate-200 text-xs">Cancel</button>
          </div>
        </div>
      )}
      <div className="h-56 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: 10 }}
              tickFormatter={(d) => d.slice(5)} />
            <YAxis stroke="#64748b" style={{ fontSize: 10 }} width={70}
              tickFormatter={(v) => money(v)} />
            <Tooltip
              formatter={(v) => money(v)}
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            />
            <Area type="monotone" dataKey="netWorth" stroke="#10b981" strokeWidth={2}
              fill="url(#nwFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
