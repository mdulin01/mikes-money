import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase-config';
import { COLLECTIONS } from '../constants';

// One-shot query of ALL transactions from `fromDate` (YYYY-MM-DD) onward.
//
// Why: the realtime `recentTxns` feed caps at the last 500 transactions — fine for
// dashboards, but any calendar-window aggregation (Tax YTD, 12-month cash flow,
// rent-received matrix) silently loses early-window transactions once volume
// pushes them past the cap. Use this hook for those.
//
// Returns null while loading, then the array (empty on error).
export function useRangeTxns(fromDate) {
  const [txns, setTxns] = useState(null);
  useEffect(() => {
    if (!fromDate) return;
    let alive = true;
    (async () => {
      try {
        const q = query(
          collection(db, COLLECTIONS.TRANSACTIONS),
          where('date', '>=', fromDate),
          orderBy('date', 'desc'),
        );
        const snap = await getDocs(q);
        if (alive) setTxns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('useRangeTxns query failed:', e);
        if (alive) setTxns([]);
      }
    })();
    return () => { alive = false; };
  }, [fromDate]);
  return txns;
}
