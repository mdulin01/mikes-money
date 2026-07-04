import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { money } from '../utils/format';
import { humanDate } from '../utils/dateUtils';
import { merchantKeyword } from '../utils/classify';

// Detail popover for a matrix cell (Business income-by-payer, Rent received grid).
// Shows the underlying transactions behind an aggregated amount; clicking a row
// jumps to the Transactions page pre-filtered to that merchant.
//
// props:
//   title    — e.g. "Avance Care — Jan 2026"
//   txns     — bank transactions [{date, merchantName, name, amount, accountName, needsReview}]
//   rrItems  — optional rainbow-rentals payments [{datePaid, month, tenantName, amount, notes, source}]
//   onClose  — dismiss
export default function TxnPopover({ title, txns = [], rrItems = [], onClose }) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bankTotal = txns.reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const rrTotal = rrItems.reduce((s, p) => s + (p.amount || 0), 0);

  const openInTransactions = (t) => {
    const kw = merchantKeyword(t);
    onClose();
    navigate(`/transactions?search=${encodeURIComponent(kw || t.merchantName || t.name || '')}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-xl w-full max-w-lg max-h-[75vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <p className="text-xs text-slate-500">
              {txns.length > 0 && <>{txns.length} deposit{txns.length === 1 ? '' : 's'} · <span className="mono-nums text-emerald-300">{money(bankTotal, { cents: true })}</span></>}
              {txns.length > 0 && rrItems.length > 0 && ' · '}
              {rrItems.length > 0 && <>{rrItems.length} in Rainbow Rentals · <span className="mono-nums text-sky-300">{money(rrTotal)}</span></>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none px-1">✕</button>
        </div>

        <div className="p-2">
          {txns.map((t) => (
            <button key={t.id || `${t.date}-${t.amount}`} onClick={() => openInTransactions(t)}
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-slate-700/60 flex items-start gap-3"
              title="Open in Transactions, filtered to this merchant">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-200 truncate">
                  {t.merchantName || t.name || '—'}
                  {t.needsReview && <span className="ml-1 text-orange-400" title="auto-detected — needs review">⚑</span>}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {humanDate(t.date)} · {t.accountName || t.accountId || ''}
                  {t.name && t.merchantName && t.name !== t.merchantName ? ` · ${t.name}` : ''}
                </div>
              </div>
              <span className="mono-nums text-sm text-emerald-300 whitespace-nowrap">{money(Math.abs(t.amount || 0), { cents: true })}</span>
            </button>
          ))}

          {rrItems.map((p) => (
            <div key={p.id || `${p.month}-${p.amount}`} className="px-2 py-2 rounded-lg flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-sky-200 truncate">🌈 {p.tenantName || 'Rent payment'} <span className="text-slate-500">(Rainbow Rentals ledger)</span></div>
                <div className="text-xs text-slate-500 truncate">{p.datePaid ? humanDate(p.datePaid) : p.month}{p.notes ? ` · ${p.notes}` : ''}</div>
              </div>
              <span className="mono-nums text-sm text-sky-300 whitespace-nowrap">{money(p.amount || 0)}</span>
            </div>
          ))}

          {txns.length === 0 && rrItems.length === 0 && (
            <p className="text-sm text-slate-500 px-2 py-4 text-center">No underlying records.</p>
          )}
        </div>

        {txns.length > 0 && (
          <p className="text-[11px] text-slate-500 px-4 pb-3">Tap a deposit to open it on the Transactions page (filtered to that merchant).</p>
        )}
      </div>
    </div>
  );
}
