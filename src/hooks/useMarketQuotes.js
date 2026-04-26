// Fetches intraday market quotes from our Cloud Function (which proxies Yahoo Finance).
// Caches in component state, auto-refreshes every 5 minutes when the page is open.
// Tickers list is kept stable via JSON.stringify dependency.

import { useState, useEffect, useCallback, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase-config';

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function useMarketQuotes(tickers) {
  const [quotes, setQuotes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const tickersKey = JSON.stringify([...(tickers || [])].sort());
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    const list = JSON.parse(tickersKey);
    if (!list.length || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const fn = httpsCallable(functions, 'getMarketQuotes');
      const res = await fn({ tickers: list });
      setQuotes(res.data?.quotes || {});
      setFetchedAt(res.data?.fetchedAt || Date.now());
      setError(null);
    } catch (e) {
      console.error('market quotes fetch failed:', e);
      setError(e?.message || 'fetch failed');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [tickersKey]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { quotes, loading, error, fetchedAt, refresh };
}
