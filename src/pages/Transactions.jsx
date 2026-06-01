import { useMemo, useState } from 'react';
import { signedMoney } from '../utils/format';
import { humanDate } from '../utils/dateUtils';
import { CLASSES } from '../constants';
import { effectiveClass } from '../utils/classify';

const CBYID = Object.fromEntries(CLASSES.map(c => [c.id, c]));

export default function Transactions({ data, recentTxns = [], categorizeTransaction, accounts = [], setTransactionClass }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const categories = data?.categories || [];
  const acctById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);
  const withClass = useMemo(() => recentTxns.map(t => ({ ...t, _class: effectiveClass(t, acctById) })), [recentTxns, acctById]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return withClass.filter(t => {
      if (categoryFilter !== 'all' && (t.category || 'uncategorized') !== categoryFilter) return false;
      if (classFilter !== 'all' && t._class !== classFilter) return false;
      if (!s) return true;
      return (t.name || t.merchantName || '').toLowerCase().includes(s) || (t.category || '').toLowerCase().includes(s);
    });
  }, [withClass, search, categoryFilter, classFilter]);

  const total = useMemo(() => filtered.reduce((s, t) => s + (t.amount || 0), 0), [filtered]);
  const classTotals = useMemo(() => {
    const m = {};
    for (const t of withClass) m[t._class] = (m[t._class] || 0) + (t.amount || 0);
    return m;
  }, [withClass]);
  const unclassed = useMemo(() => withClass.filter(t => t._class === 'uncategorized').length, [withClass]);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-slate-400 text-sm">
          {filtered.length} items · net {signedMoney(-total, { cents: true })}
          {unclassed > 0 && <span className="text-amber-400"> · {unclassed} unclassed</span>}
        </p>
      </header>

      {/* class summary chips (tap to filter) */}
      <div className="flex gap-2 flex-wrap">
        {CLASSES.map(c => classTotals[c.id] != null && (
          <button key={c.id} onClick={() => setClassFilter(classFilter === c.id ? 'all' : c.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border ${classFilter === c.id ? 'border-blue-400 bg-blue-900/30 text-blue-200' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>
            {c.emoji} {c.label}: <span className="mono-nums">{signedMoney(-classTotals[c.id])}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <input placeholder="Search merchant or category…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          <option value="all">All classes</option>
          <option value="uncategorized">Unclassed</option>
          {CLASSES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          <option value="all">All categories</option>
          <option value="uncategorized">Uncategorized</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
      </div>

      {recentTxns.length === 0 && (
        <p className="text-slate-500 text-sm bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
          No transactions yet. Link a bank account on the Accounts page and transactions will sync here.
        </p>
      )}

      <ul className="divide-y divide-slate-700/60 bg-slate-800 rounded-xl border border-slate-700">
        {filtered.map(t => (
          <li key={t.id} className="px-4 py-3 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="truncate">{t.merchantName || t.name || '—'}</div>
              <div className="text-slate-500 text-xs">{humanDate(t.date)} · {t.accountName || t.accountId}</div>
            </div>
            <select
              value={t.txClass || 'auto'}
              onChange={(e) => setTransactionClass(t.id, e.target.value === 'auto' ? null : e.target.value)}
              title={t.txClass ? 'manually set' : 'auto-classified'}
              className={`bg-slate-900 border rounded-lg px-2 py-1 text-xs ${t.txClass ? 'border-blue-500/60 text-blue-200' : 'border-slate-700 text-slate-400'}`}>
              <option value="auto">{t._class === 'uncategorized' ? '— set class —' : `auto: ${CBYID[t._class]?.emoji || ''} ${CBYID[t._class]?.label || ''}`}</option>
              {CLASSES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
            <select value={t.category || 'uncategorized'} onChange={(e) => categorizeTransaction(t.id, e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs">
              <option value="uncategorized">Uncategorized</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
            <div className={`mono-nums w-24 text-right ${t.amount < 0 ? 'text-emerald-400' : 'text-slate-100'}`}>
              {signedMoney(-t.amount, { cents: true })}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
