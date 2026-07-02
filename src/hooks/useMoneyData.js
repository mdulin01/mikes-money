import { classify, effectiveCategory } from '../utils/classify';
import { monthFlows } from '../utils/cashflow';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  doc, setDoc, onSnapshot, deleteField, getDocs,
  collection, query, where, orderBy, limit, updateDoc, writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase-config';
import { COLLECTIONS, USER_DOC_ID, DEFAULT_CATEGORIES } from '../constants';
import { toLocalMonthStr } from '../utils/dateUtils';

const stripUndefined = (obj) => JSON.parse(JSON.stringify(obj));

const DEFAULT_DATA = {
  categories: DEFAULT_CATEGORIES,
  budgets: {},          // { 'YYYY-MM': { categoryId: amount } }
  scenarios: [],        // user-defined forecasts
  manualAccounts: [],   // accounts not on Plaid (home value, 529s, crypto wallets)
  manualHoldings: [],   // positions entered by hand (TIAA, 401k, accounts Plaid can't reach)
  ignoredAccounts: [],  // Plaid accountIds to exclude from all calculations + UI
  userRules: [],        // Learned merchant rules: [{ kw: string[], category?, klass?, propertyId?, homeOffice?, createdAt }]
  preferences: {
    emergencyMonths: 6,
    targetSavingsRate: 0.25,
  },
};

export function useMoneyData(user) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [recentTxns, setRecentTxns] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [netWorthHistory, setNetWorthHistory] = useState([]);
  const [snapshotHistory, setSnapshotHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Main config doc (single-user)
  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const docRef = doc(db, COLLECTIONS.FINANCE_DATA, USER_DOC_ID);
    const unsub = onSnapshot(docRef, (snap) => {
      const snapData = snap.data() || {};
      // Merge defaults without clobbering user arrays
      const merged = { ...DEFAULT_DATA, ...snapData };
      // Categories: keep the user's saved list + order, but append any newly-shipped
      // default categories the saved list doesn't have yet (matched by id).
      const userCats = snapData.categories?.length ? snapData.categories : DEFAULT_CATEGORIES;
      const haveIds = new Set(userCats.map(c => c.id));
      const missingDefaults = DEFAULT_CATEGORIES.filter(c => !haveIds.has(c.id));
      merged.categories = missingDefaults.length ? [...userCats, ...missingDefaults] : userCats;
      setData(merged);
      setLoading(false);
    }, (err) => {
      console.error('finance data listener error:', err);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  // One-time label cleanup: the bulk-imported holdings were named "Empower
  // Portfolio" — Mike wants them shown as just his portfolio. Renames in place
  // (idempotent; runs only if the old label is still present).
  useEffect(() => {
    if (!data?.manualHoldings?.length) return;
    if (!data.manualHoldings.some((h) => /empower/i.test(h.accountName || ''))) return;
    const fixed = data.manualHoldings.map((h) => /empower/i.test(h.accountName || '')
      ? { ...h, accountName: (h.accountName || '').replace(/empower\s*/i, '').trim() || 'Portfolio' }
      : h);
    updateConfig({ manualHoldings: fixed });
  }, [data?.manualHoldings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accounts (written by Plaid sync or manual edits from functions)
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, COLLECTIONS.ACCOUNTS), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('accounts listener error:', err));
    return unsub;
  }, [user?.uid]);

  // Recent transactions (last 500). Larger queries paginate via dedicated hook.
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, COLLECTIONS.TRANSACTIONS),
      orderBy('date', 'desc'),
      limit(500),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRecentTxns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('transactions listener error:', err));
    return unsub;
  }, [user?.uid]);

  // Amazon orders parsed from Gmail by mikeslife /api/cron-amazon (read-only here).
  const [amazonOrders, setAmazonOrders] = useState([]);
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(collection(db, 'amazonOrders'), (snap) => {
      setAmazonOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.warn('amazonOrders listener (rules published?):', e.message));
    return unsub;
  }, [user?.uid]);

  // Investment holdings (positions, securities)
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(collection(db, COLLECTIONS.HOLDINGS), (snap) => {
      setHoldings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('holdings listener error:', err));
    return unsub;
  }, [user?.uid]);

  // Liabilities (credit cards, mortgages, student loans — metadata)
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(collection(db, COLLECTIONS.LIABILITIES), (snap) => {
      setLiabilities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('liabilities listener error:', err));
    return unsub;
  }, [user?.uid]);

  // Net worth daily snapshots
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, COLLECTIONS.NET_WORTH_HISTORY), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setNetWorthHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('netWorthHistory listener error:', err));
    return unsub;
  }, [user?.uid]);

  // Dashboard snapshots (used for allocation/sector over-time + quarterly rebalance review)
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, COLLECTIONS.DASHBOARD_SNAPSHOTS), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setSnapshotHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('snapshotHistory listener error:', err));
    return unsub;
  }, [user?.uid]);

  // --- Writers ---

  const updateConfig = useCallback((patch) => {
    const ref = doc(db, COLLECTIONS.FINANCE_DATA, USER_DOC_ID);
    return setDoc(ref, stripUndefined(patch), { merge: true });
  }, []);

  // Freshest underlying-data timestamp across synced collections — the "as of" indicator.
  const dataAsOf = useMemo(() => {
    let max = 0;
    const scan = (arr) => {
      for (const x of arr || []) {
        const ts = x.updatedAt?.toMillis?.() ?? (x.updatedAt ? new Date(x.updatedAt).getTime() : 0);
        if (ts > max) max = ts;
      }
    };
    scan(accounts); scan(holdings); scan(liabilities);
    return max || null;
  }, [accounts, holdings, liabilities]);

  // On-demand Plaid pull: sync every linked institution. The realtime Firestore
  // listeners then surface the fresh accounts/holdings/transactions automatically.
  const removePlaidItem = useCallback(async (itemId) => {
    const fn = httpsCallable(functions, 'removeItem');
    return fn({ itemId });
  }, []);

  const refreshData = useCallback(async () => {
    if (refreshing) return { ok: 0, failed: 0, total: 0, busy: true };
    setRefreshing(true);
    try {
      const itemsSnap = await getDocs(collection(db, COLLECTIONS.PLAID_ITEMS));
      const sync = httpsCallable(functions, 'syncItem');
      const results = await Promise.allSettled(itemsSnap.docs.map(d => sync({ itemId: d.id })));
      const ok = results.filter(r => r.status === 'fulfilled').length;
      // Surface investment-holdings sync outcome (Plaid often returns balances but
      // not positions for Vanguard) so it isn't a silent mystery.
      let holdingsSynced = 0; const holdingsErrors = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          holdingsSynced += (r.value.holdingsSynced || 0);
          if (r.value.holdingsError) holdingsErrors.push(r.value.holdingsError);
        }
      }
      return { ok, failed: results.length - ok, total: results.length, holdingsSynced, holdingsErrors };
    } catch (e) {
      console.error('refreshData failed:', e);
      return { ok: 0, failed: 1, total: 1, error: e?.message };
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const setBudget = useCallback((monthStr, categoryId, amount) => {
    return updateConfig({ budgets: { [monthStr]: { [categoryId]: amount } } });
  }, [updateConfig]);

  const deleteBudget = useCallback((monthStr, categoryId) => {
    const ref = doc(db, COLLECTIONS.FINANCE_DATA, USER_DOC_ID);
    return updateDoc(ref, { [`budgets.${monthStr}.${categoryId}`]: deleteField() });
  }, []);

  const addScenario = useCallback((scenario) => {
    const next = [...(data?.scenarios || []), { id: crypto.randomUUID(), ...scenario }];
    return updateConfig({ scenarios: next });
  }, [data, updateConfig]);

  const updateScenario = useCallback((id, patch) => {
    const next = (data?.scenarios || []).map(s => s.id === id ? { ...s, ...patch } : s);
    return updateConfig({ scenarios: next });
  }, [data, updateConfig]);

  const deleteScenario = useCallback((id) => {
    const next = (data?.scenarios || []).filter(s => s.id !== id);
    return updateConfig({ scenarios: next });
  }, [data, updateConfig]);

  const addManualAccount = useCallback((acct) => {
    const next = [...(data?.manualAccounts || []), { id: crypto.randomUUID(), ...acct }];
    return updateConfig({ manualAccounts: next });
  }, [data, updateConfig]);

  const updateManualAccount = useCallback((id, patch) => {
    const next = (data?.manualAccounts || []).map(a => a.id === id ? { ...a, ...patch } : a);
    return updateConfig({ manualAccounts: next });
  }, [data, updateConfig]);

  const deleteManualAccount = useCallback((id) => {
    const next = (data?.manualAccounts || []).filter(a => a.id !== id);
    return updateConfig({ manualAccounts: next });
  }, [data, updateConfig]);

  const addManualHolding = useCallback((h) => {
    const next = [...(data?.manualHoldings || []), { id: crypto.randomUUID(), ...h }];
    return updateConfig({ manualHoldings: next, manualHoldingsUpdatedAt: new Date().toISOString() });
  }, [data, updateConfig]);

  const updateManualHolding = useCallback((id, patch) => {
    const next = (data?.manualHoldings || []).map(h => h.id === id ? { ...h, ...patch } : h);
    return updateConfig({ manualHoldings: next, manualHoldingsUpdatedAt: new Date().toISOString() });
  }, [data, updateConfig]);

  // Clear the bulk-imported manual holdings that now duplicate live Plaid data,
  // but KEEP anything Plaid can't reach (TIAA) — matched by accountName.
  const clearManualHoldings = useCallback(() => {
    const keep = (data?.manualHoldings || []).filter(h => /tiaa/i.test(h.accountName || ''));
    return updateConfig({ manualHoldings: keep, manualHoldingsUpdatedAt: new Date().toISOString() });
  }, [data, updateConfig]);

  const deleteManualHolding = useCallback((id) => {
    const next = (data?.manualHoldings || []).filter(h => h.id !== id);
    return updateConfig({ manualHoldings: next });
  }, [data, updateConfig]);

  const toggleAccountIgnored = useCallback((accountId) => {
    const current = data?.ignoredAccounts || [];
    const next = current.includes(accountId)
      ? current.filter(x => x !== accountId)
      : [...current, accountId];
    return updateConfig({ ignoredAccounts: next });
  }, [data, updateConfig]);

  const categorizeTransaction = useCallback((txnId, category) => {
    const ref = doc(db, COLLECTIONS.TRANSACTIONS, txnId);
    return updateDoc(ref, { category, categorizedBy: 'user' });
  }, []);

  // Tax/ownership class. null clears back to auto-rule classification.
  const setTransactionClass = useCallback((txnId, txClass) => {
    const ref = doc(db, COLLECTIONS.TRANSACTIONS, txnId);
    return updateDoc(ref, { txClass: txClass || null, classBy: txClass ? 'user' : null });
  }, []);

  // Which rental property the txn belongs to (Schedule E line). null clears.
  const setTransactionProperty = useCallback((txnId, propertyId) => {
    const ref = doc(db, COLLECTIONS.TRANSACTIONS, txnId);
    return updateDoc(ref, { propertyId: propertyId || null, propertyBy: propertyId ? 'user' : null });
  }, []);

  // --- User-learned rules ----------------------------------------------------------
  // Persist a merchant-keyword → category/class/property mapping. Auto-categorize
  // checks these BEFORE built-in RULES, so later imports of the same merchant
  // get the user's preferred categorization without manual work.
  const addUserRule = useCallback((rule) => {
    if (!rule || !rule.kw || (Array.isArray(rule.kw) ? !rule.kw.length : !String(rule.kw).trim())) return;
    const current = data?.userRules || [];
    const kwArr = Array.isArray(rule.kw) ? rule.kw.map(k => String(k).toLowerCase()) : [String(rule.kw).toLowerCase()];
    // Dedupe: if a rule with the same first keyword already exists, replace it (so the latest wins).
    const filtered = current.filter(r => !(r.kw && r.kw[0] === kwArr[0]));
    const entry = {
      kw: kwArr,
      ...(rule.category ? { category: rule.category } : {}),
      ...(rule.klass ? { klass: rule.klass } : {}),
      ...(rule.propertyId ? { propertyId: rule.propertyId } : {}),
      ...(rule.homeOffice ? { homeOffice: true } : {}),
      createdAt: new Date().toISOString(),
    };
    return updateConfig({ userRules: [...filtered, entry] });
  }, [data, updateConfig]);

  const removeUserRule = useCallback((kw) => {
    const current = data?.userRules || [];
    const k = String(kw).toLowerCase();
    return updateConfig({ userRules: current.filter(r => !(r.kw && r.kw[0] === k)) });
  }, [data, updateConfig]);

  // Apply a rule (or rule-shaped object) to all matching transactions in `txns`.
  // Returns { applied } count. Matches against `kw` (substring of merchantName + name).
  // Skips transactions that already have a manual override on the field being set.
  const applyRuleToTxns = useCallback(async (rule, txns) => {
    if (!rule || !rule.kw) return { applied: 0 };
    const kws = (Array.isArray(rule.kw) ? rule.kw : [rule.kw]).map(k => String(k).toLowerCase());
    const matches = (txns || []).filter(t => {
      const payee = `${t.merchantName || ''} ${t.name || ''}`.toLowerCase();
      return kws.some(k => payee.includes(k));
    });
    let applied = 0;
    for (let i = 0; i < matches.length; i += 450) {
      const batch = writeBatch(db);
      let n = 0;
      for (const t of matches.slice(i, i + 450)) {
        const upd = {};
        if (rule.category && (!t.category || t.category === 'uncategorized' || t.categorizedBy === 'auto')) {
          upd.category = rule.category; upd.categorizedBy = 'rule';
        }
        if (rule.klass && (!t.txClass || t.classBy === 'auto')) {
          upd.txClass = rule.klass; upd.classBy = 'rule';
        }
        if (rule.propertyId && (!t.propertyId || t.propertyBy === 'auto')) {
          upd.propertyId = rule.propertyId; upd.propertyBy = 'rule';
        }
        if (rule.homeOffice && !t.homeOffice) upd.homeOffice = true;
        if (Object.keys(upd).length === 0) continue;
        batch.update(doc(db, COLLECTIONS.TRANSACTIONS, t.id), upd);
        applied++; n++;
      }
      if (n > 0) await batch.commit();
    }
    return { applied };
  }, []);


  // Bulk auto-categorize: assigns spending category (+ class + home-office flag) to every
  // uncategorized txn using the rules engine. High-confidence applied; size-detected rent
  // flagged needsReview; unmatched left uncategorized for manual review. Batched (Firestore 500 cap).
  const autoCategorizeAll = useCallback(async (txns, acctById) => {
    const todo = (txns || []).filter(t => !t.category || t.category === 'uncategorized');
    const userRules = data?.userRules || [];
    let applied = 0, review = 0, skipped = 0;
    for (let i = 0; i < todo.length; i += 450) {
      const batch = writeBatch(db);
      let n = 0;
      for (const t of todo.slice(i, i + 450)) {
        const c = classify(t, acctById && acctById[t.accountId], userRules);
        if (!c || !c.category) { skipped++; continue; }
        const upd = { category: c.category, categorizedBy: 'auto' };
        if (!t.txClass && c.klass) { upd.txClass = c.klass; upd.classBy = 'auto'; }
        if (!t.propertyId && c.propertyId) { upd.propertyId = c.propertyId; upd.propertyBy = 'auto'; }
        if (c.homeOffice) upd.homeOffice = true;
        if (c.conf === 'review') { upd.needsReview = true; review++; }
        batch.update(doc(db, COLLECTIONS.TRANSACTIONS, t.id), upd);
        applied++; n++;
      }
      if (n > 0) await batch.commit();
    }
    return { applied, review, skipped };
  }, [data]);

  // --- Derived ---

  const netWorth = useMemo(() => {
    // visibleAccounts is computed below — use raw accounts here filtered inline to avoid TDZ
    const ignored = new Set(data?.ignoredAccounts || []);
    const plaid = accounts.filter(a => !ignored.has(a.id)).reduce((sum, a) => {
      const sign = ['loan', 'credit', 'mortgage'].includes(a.type) ? -1 : 1;
      return sum + sign * (a.balance || 0);
    }, 0);
    const manual = (data?.manualAccounts || []).reduce((sum, a) => {
      const sign = a.side === 'liability' ? -1 : 1;
      return sum + sign * (a.balance || 0);
    }, 0);
    return plaid + manual;
  }, [accounts, data]);

  // Current-month cash-flow buckets (earned / retirement draws / refunds / spend).
  // Spend nets credit-card refunds; savings rate uses EARNED income only — see utils/cashflow.js.
  const flows = useMemo(() => {
    const m = toLocalMonthStr();
    const ignored = new Set(data?.ignoredAccounts || []);
    const acctById = Object.fromEntries(accounts.map(a => [a.id, a]));
    // Live classification (user rules + built-ins) so uncategorized txns bucket correctly.
    const catOf = (t) => { const c = effectiveCategory(t, acctById, data?.userRules); return c === 'uncategorized' ? null : c; };
    return monthFlows(recentTxns.filter(t => !ignored.has(t.accountId)), acctById, m, catOf);
  }, [recentTxns, accounts, data]);

  const currentMonthSpend = flows.spend;

  // Account ignore-list — filtered out of net worth, holdings, transactions, allocations.
  // Use case: shared / family / business accounts that Plaid pulled but shouldn't count.
  const ignoredIds = useMemo(
    () => new Set(data?.ignoredAccounts || []),
    [data?.ignoredAccounts],
  );

  const visibleAccounts = useMemo(
    () => accounts.filter(a => !ignoredIds.has(a.id)),
    [accounts, ignoredIds],
  );
  const visibleTxns = useMemo(
    () => recentTxns.filter(t => !ignoredIds.has(t.accountId)),
    [recentTxns, ignoredIds],
  );
  const visibleHoldings = useMemo(
    () => holdings.filter(h => !ignoredIds.has(h.accountId)),
    [holdings, ignoredIds],
  );

  // Merge Plaid-synced + manually-entered holdings. Manual ones get a `manual: true` flag.
  const allHoldings = useMemo(() => {
    const manual = (data?.manualHoldings || []).map(h => ({ ...h, manual: true }));
    return [...visibleHoldings, ...manual];
  }, [visibleHoldings, data]);

  const investmentsTotal = useMemo(
    () => allHoldings.reduce((s, h) => s + (h.institutionValue || 0), 0),
    [allHoldings],
  );

  return {
    data,
    loading,
    accounts: visibleAccounts,         // default — ignored accounts excluded
    allAccounts: accounts,             // full list incl. ignored (for Accounts page UI)
    ignoredAccountIds: ignoredIds,     // Set of accountIds currently ignored
    recentTxns: visibleTxns,
    holdings: allHoldings,             // visible Plaid holdings + manual holdings
    plaidHoldings: visibleHoldings,
    liabilities,
    netWorthHistory,
    snapshotHistory,
    amazonOrders,
    dataAsOf,
    refreshing,
    refreshData,
    removePlaidItem,
    netWorth,
    investmentsTotal,
    currentMonthSpend,
    flows,
    updateConfig,
    setBudget,
    deleteBudget,
    addScenario,
    updateScenario,
    deleteScenario,
    addManualAccount,
    updateManualAccount,
    deleteManualAccount,
    addManualHolding,
    updateManualHolding,
    deleteManualHolding,
    clearManualHoldings,
    toggleAccountIgnored,
    categorizeTransaction,
    setTransactionClass,
    setTransactionProperty,
    addUserRule,
    removeUserRule,
    applyRuleToTxns,
    autoCategorizeAll,
  };
}
