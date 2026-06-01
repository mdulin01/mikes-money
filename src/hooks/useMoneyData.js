import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  doc, setDoc, onSnapshot, deleteField,
  collection, query, where, orderBy, limit, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase-config';
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

  // Main config doc (single-user)
  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const docRef = doc(db, COLLECTIONS.FINANCE_DATA, USER_DOC_ID);
    const unsub = onSnapshot(docRef, (snap) => {
      const snapData = snap.data() || {};
      // Merge defaults without clobbering user arrays
      const merged = { ...DEFAULT_DATA, ...snapData };
      if (!snapData.categories?.length) merged.categories = DEFAULT_CATEGORIES;
      setData(merged);
      setLoading(false);
    }, (err) => {
      console.error('finance data listener error:', err);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

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

  // --- Writers ---

  const updateConfig = useCallback((patch) => {
    const ref = doc(db, COLLECTIONS.FINANCE_DATA, USER_DOC_ID);
    return setDoc(ref, stripUndefined(patch), { merge: true });
  }, []);

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
    return updateConfig({ manualHoldings: next });
  }, [data, updateConfig]);

  const updateManualHolding = useCallback((id, patch) => {
    const next = (data?.manualHoldings || []).map(h => h.id === id ? { ...h, ...patch } : h);
    return updateConfig({ manualHoldings: next });
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

  const currentMonthSpend = useMemo(() => {
    const m = toLocalMonthStr();
    const ignored = new Set(data?.ignoredAccounts || []);
    return recentTxns
      .filter(t => !ignored.has(t.accountId) && (t.date || '').startsWith(m) && t.amount > 0 && t.category !== 'transfer')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [recentTxns, data]);

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
    netWorth,
    investmentsTotal,
    currentMonthSpend,
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
    toggleAccountIgnored,
    categorizeTransaction,
    setTransactionClass,
  };
}
