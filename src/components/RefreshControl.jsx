import { useRef, useState, useCallback } from 'react';
import { relativeTime, exactTime } from '../utils/dateUtils';
import { useToast } from './Toast';

const THRESHOLD = 70; // px pull distance to trigger a refresh

/**
 * Shared freshness bar + pull-to-refresh wrapper. Rendered once in App so the
 * "as of" timestamp and Update action appear on every section. The Update action
 * fires a Plaid sync (onRefresh); realtime Firestore listeners then surface the data.
 */
export default function RefreshControl({ asOf, refreshing, onRefresh, extra, children }) {
  const toast = useToast();
  const [pull, setPull] = useState(0);
  const startY = useRef(null);
  const pulling = useRef(false);

  const doRefresh = useCallback(async () => {
    if (refreshing) return;
    toast('Updating accounts…', 'info');
    const r = await onRefresh?.();
    if (!r) return;
    if (r.busy) return;
    if (r.total === 0) toast('No linked institutions to sync', 'info');
    else if (r.error) toast(`Update failed: ${r.error}`, 'error');
    else if (r.failed) toast(`Synced ${r.ok}/${r.total} · ${r.failed} failed`, r.ok ? 'info' : 'error');
    else toast(`Updated ${r.ok} institution${r.ok === 1 ? '' : 's'}`, 'success');
  }, [onRefresh, refreshing, toast]);

  const onTouchStart = (e) => {
    if (window.scrollY <= 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    } else {
      pulling.current = false;
    }
  };
  const onTouchMove = (e) => {
    if (!pulling.current || startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && window.scrollY <= 0) {
      setPull(Math.min(120, dy * 0.5));
      if (dy > 10 && e.cancelable) e.preventDefault();
    } else {
      setPull(0);
    }
  };
  const onTouchEnd = () => {
    if (pulling.current && pull > THRESHOLD) doRefresh();
    pulling.current = false;
    startY.current = null;
    setPull(0);
  };

  const armed = pull > THRESHOLD;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Freshness bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/80 border-b border-slate-800 text-xs">
        <span className="text-slate-500" title={`Data as of ${exactTime(asOf)}`}>
          {refreshing ? 'Updating…' : <>Updated <span className="text-slate-400">{relativeTime(asOf)}</span></>}
        </span>
        <div className="flex items-center gap-3">
        {extra}
        <button
          onClick={doRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-slate-400 hover:text-emerald-400 disabled:opacity-50 transition-colors"
        >
          <span className={`inline-block ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
          {refreshing ? 'Updating' : 'Update'}
        </button>
        </div>
      </div>

      {/* Pull-to-refresh indicator (mobile) */}
      {(pull > 0 || refreshing) && (
        <div
          style={{ height: refreshing ? 28 : pull }}
          className="flex items-center justify-center overflow-hidden text-xs text-slate-400 transition-[height] duration-150 bg-slate-900/60"
        >
          {refreshing ? '🔄 Updating…' : armed ? '↑ Release to update' : '↓ Pull to update'}
        </div>
      )}

      {children}
    </div>
  );
}
