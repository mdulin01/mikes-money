import { useMemo, useState } from 'react';
import { matchAmazonOrder } from '../utils/amazon';
import { signedMoney } from '../utils/format';
import { humanDate } from '../utils/dateUtils';
import { CLASSES } from '../constants';
import { effectiveClass, classify, merchantKeyword } from '../utils/classify';
import { PROPERTIES, PROPERTY_BY_ID, effectiveProperty } from '../data/properties';
import { useToast } from '../components/Toast';

const CBYID = Object.fromEntries(CLASSES.map(c => [c.id, c]));

export default function Transactions({ data, recentTxns = [], categorizeTransaction, accounts = [], setTransactionClass, setTransactionProperty, addUserRule, applyRuleToTxns, autoCategorizeAll, amazonOrders = [] }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [largeOnly, setLargeOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const largeThreshold = data?.preferences?.largeTxnThreshold || 500;
  const categories = data?.categories || [];
  const userRules = data?.userRules || [];
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const acctById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);

  // Group categories for optgroups in the picker
  const catsByKind = useMemo(() => ({
    income: categories.filter(c => c.kind === 'income'),
    expense: categories.filter(c => c.kind === 'expense'),
    transfer: categories.filter(c => c.kind === 'transfer'),
  }), [categories]);

  // Set of merchant keywords already covered by a user rule (so we don't keep nagging).
  const userRuleKws = useMemo(() => {
    const s = new Set();
    for (const r of userRules) for (const k of (r.kw || [])) s.add(String(k).toLowerCase());
    return s;
  }, [userRules]);

  const isCoveredByRule = (txn) => {
    const payee = `${txn.merchantName || ''} ${txn.name || ''}`.toLowerCase();
    for (const k of userRuleKws) if (payee.includes(k)) return true;
    return false;
  };

  const rows = useMemo(() => recentTxns.map(t => {
    const sug = classify(t, acctById[t.accountId], userRules);
    return { ...t, _class: effectiveClass(t, acctById, userRules), _sugCat: sug?.category || null, _homeOffice: t.homeOffice || !!sug?.homeOffice, _property: effectiveProperty(t) };
  }), [recentTxns, acctById, userRules]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return rows.filter(t => {
      if (categoryFilter === 'review' ? !t.needsReview : (categoryFilter !== 'all' && (t.category || 'uncategorized') !== categoryFilter)) return false;
      if (classFilter !== 'all' && t._class !== classFilter) return false;
      if (propertyFilter !== 'all') { if (propertyFilter === 'none' ? t._property : t._property !== propertyFilter) return false; }
      if (largeOnly && Math.abs(t.amount || 0) < largeThreshold) return false;
      if (!s) return true;
      return (t.name || t.merchantName || '').toLowerCase().includes(s) || (t.category || '').toLowerCase().includes(s);
    });
  }, [rows, search, categoryFilter, classFilter, propertyFilter, largeOnly, largeThreshold]);

  const total = useMemo(() => filtered.reduce((s, t) => s + (t.amount || 0), 0), [filtered]);
  // Promote the current row's manual overrides to a saved user rule + apply to similar txns.
  const learnRule = async (txn) => {
    const kw = merchantKeyword(txn);
    if (!kw || !addUserRule || !applyRuleToTxns) return;
    const rule = { kw };
    if (txn.categorizedBy === 'user' && txn.category && txn.category !== 'uncategorized') rule.category = txn.category;
    if (txn.classBy === 'user' && txn.txClass) rule.klass = txn.txClass;
    if (txn.propertyBy === 'user' && txn.propertyId) rule.propertyId = txn.propertyId;
    if (!rule.category && !rule.klass && !rule.propertyId) return;
    await addUserRule(rule);
    // Apply to all transactions on screen (recentTxns), not just filtered, so propagation is global.
    const { applied } = await applyRuleToTxns(rule, recentTxns);
    // Lightweight feedback via title attribute on the next render — count includes the source row.
    console.log('[user-rule]', kw, '→', rule, `applied to ${applied} txns`);
  };

  const similarCount = (txn) => {
    const kw = merchantKeyword(txn);
    if (!kw) return 0;
    let n = 0;
    for (const t of recentTxns) {
      if (t.id === txn.id) continue;
      const payee = `${t.merchantName || ''} ${t.name || ''}`.toLowerCase();
      if (payee.includes(kw)) n++;
    }
    return n;
  };

  const uncatCount = useMemo(() => rows.filter(t => !t.category || t.category === 'uncategorized').length, [rows]);
  const reviewCount = useMemo(() => rows.filter(t => t.needsReview).length, [rows]);
  const classTotals = useMemo(() => { const m = {}; for (const t of rows) m[t._class] = (m[t._class] || 0) + (t.amount || 0); return m; }, [rows]);

  async function runAuto() {
    if (!autoCategorizeAll) return;
    if (!confirm(`Auto-categorize ${uncatCount} uncategorized transactions? High-confidence matches are applied; size-detected rent is flagged for review; anything unmatched stays uncategorized. Your manual picks always win.`)) return;
    setBusy(true);
    try { const r = await autoCategorizeAll(recentTxns, acctById); toast(`Done: ${r.applied} categorized · ${r.review} flagged for review · ${r.skipped} left uncategorized.`, 'success'); }
    catch (e) { toast('Failed: ' + e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-slate-400 text-sm">
            {filtered.length} items · net {signedMoney(-total, { cents: true })}
            {uncatCount > 0 && <span className="text-amber-400"> · {uncatCount} uncategorized</span>}
            {reviewCount > 0 && <span className="text-orange-400"> · {reviewCount} ⚑ review</span>}
          </p>
        </div>
        {uncatCount > 0 && (
          <button onClick={runAuto} disabled={busy}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-3 py-2">
            {busy ? 'Categorizing…' : `🪄 Auto-categorize (${uncatCount})`}
          </button>
        )}
      </header>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setLargeOnly(!largeOnly)}
          title={`Transactions of $${largeThreshold}+ (set preferences.largeTxnThreshold to change)`}
          className={`text-xs px-3 py-1.5 rounded-lg border ${largeOnly ? 'border-orange-400 bg-orange-900/30 text-orange-200' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>
          ⚠ Large (${largeThreshold}+)
        </button>
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
        <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          <option value="all">All properties</option>
          <option value="none">— no property —</option>
          {PROPERTIES.map(p => <option key={p.id} value={p.id}>🏠 {p.nickname}</option>)}
        </select>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          <option value="all">All classes</option><option value="uncategorized">Unclassed</option>
          {CLASSES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          <option value="all">All categories</option><option value="uncategorized">Uncategorized</option>
          {reviewCount > 0 && <option value="review">⚑ Needs review</option>}
          {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
      </div>

      {recentTxns.length === 0 && (
        <p className="text-slate-500 text-sm bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">No transactions yet. Link a bank account on the Accounts page.</p>
      )}

      <ul className="divide-y divide-slate-700/60 bg-slate-800 rounded-xl border border-slate-700">
        {filtered.map(t => {
          const sugCat = catById[t._sugCat];
          return (
            <li key={t.id} className="px-4 py-3 text-sm">
              {/* Top line: merchant + amount (amount stays right-aligned regardless of controls) */}
              <div className="flex items-baseline gap-3">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{t.merchantName || t.name || '—'}{t.needsReview && <span title="size-detected — verify" className="ml-1 text-orange-400">⚑</span>}{t._homeOffice && <span title="home office (partial business)" className="ml-1 text-[10px] text-emerald-400">🏠 home office</span>}</div>
                  <div className="text-slate-500 text-xs">{humanDate(t.date)} · {t.accountName || t.accountId}</div>
                  {(() => { const o = matchAmazonOrder(t, amazonOrders); return o ? (
                    <div className="text-[11px] text-amber-300/80 truncate" title={`Amazon order ${o.orderId} · ${o.date}`}>📦 {((o.items || []).join(' · ') || o.subject || '').slice(0, 95)}</div>
                  ) : null; })()}
                </div>
                <div className={`mono-nums text-right whitespace-nowrap font-medium ${t.amount < 0 ? 'text-emerald-400' : 'text-slate-100'}`}>{signedMoney(-t.amount, { cents: true })}</div>
              </div>
              {/* Second line: tagging controls wrap freely */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <select value={t.txClass || 'auto'} onChange={(e) => setTransactionClass(t.id, e.target.value === 'auto' ? null : e.target.value)}
                  className={`bg-slate-900 border rounded-lg px-2 py-1 text-xs ${t.txClass ? 'border-blue-500/60 text-blue-200' : 'border-slate-700 text-slate-400'}`}>
                  <option value="auto">{t._class === 'uncategorized' ? '— class —' : `auto: ${CBYID[t._class]?.emoji || ''} ${CBYID[t._class]?.label || ''}`}</option>
                  {CLASSES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
                {t._class === 'rental' && (
                  <select value={t.propertyId || (t._property ? `auto:${t._property}` : 'auto')}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTransactionProperty(t.id, v === 'auto' || v.startsWith('auto:') ? null : v);
                    }}
                    title="Rental property (Schedule E line)"
                    className={`bg-slate-900 border rounded-lg px-2 py-1 text-xs ${t.propertyId ? 'border-blue-500/60 text-blue-200' : 'border-slate-700 text-slate-400'}`}>
                    <option value="auto">{t._property ? `auto: 🏠 ${PROPERTY_BY_ID[t._property]?.nickname || t._property}` : '— property —'}</option>
                    {PROPERTIES.map(p => <option key={p.id} value={p.id}>🏠 {p.nickname}</option>)}
                  </select>
                )}
                <select value={(t.category && t.category !== 'uncategorized') ? t.category : 'auto'} onChange={(e) => categorizeTransaction(t.id, e.target.value === 'auto' ? 'uncategorized' : e.target.value)}
                  className={`bg-slate-900 border rounded-lg px-2 py-1 text-xs ${(t.category && t.category !== 'uncategorized') ? 'border-slate-700' : 'border-amber-600/50 text-slate-400'}`}>
                  <option value="auto">{sugCat ? `auto: ${sugCat.emoji} ${sugCat.label}` : 'Uncategorized'}</option>
                  {catsByKind.income.length > 0 && (<optgroup label="Income">{catsByKind.income.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}</optgroup>)}
                  {catsByKind.expense.length > 0 && (<optgroup label="Expenses">{catsByKind.expense.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}</optgroup>)}
                  {catsByKind.transfer.length > 0 && (<optgroup label="Transfer">{catsByKind.transfer.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}</optgroup>)}
                </select>
                {(() => {
                  const hasManual = t.categorizedBy === 'user' || t.classBy === 'user' || t.propertyBy === 'user';
                  if (!hasManual || isCoveredByRule(t)) return null;
                  const n = similarCount(t);
                  return (
                    <button onClick={() => learnRule(t)}
                      title={`Save '${merchantKeyword(t)}' as a rule and apply to ${n} other matching transaction${n === 1 ? '' : 's'}`}
                      className="text-xs px-2 py-1 rounded-md border border-emerald-700/60 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40">
                      ✨ Save{n > 0 ? ` +${n}` : ''}
                    </button>
                  );
                })()}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
