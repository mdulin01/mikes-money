import { useMemo, useState } from 'react';
import { money, signedMoney } from '../utils/format';
import { humanDate } from '../utils/dateUtils';

export default function Transactions({ data, recentTxns, categorizeTransaction }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const categories = data?.categories || [];

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return recentTxns.filter(t => {
      if (categoryFilter !== 'all' && (t.category || 'uncategorized') !== categoryFilter) return false;
      if (!s) return true;
      return (t.name || t.merchantName || '').toLowerCase().includes(s)
        || (t.category || '').toLowerCase().includes(s);
    });
  }, [recentTxns, search, categoryFilter]);

  const total = useMemo(() => filtered.reduce((s, t) => s + (t.amount || 0), 0), [filtered]);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-slate-400 text-sm">{filtered.length} items · net {signedMoney(-total, { cents: true })}</p>
      </header>

      <div className="flex gap-2 flex-wrap">
        <input
          placeholder="Search merchant or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
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
              value={t.category || 'uncategorized'}
              onChange={(e) => categorizeTransaction(t.id, e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs"
            >
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
