import { useState } from 'react';
import { auth } from '../firebase-config';

// ✨ one-tap page insight (Rupert via /api/insight). Lives in the RefreshControl bar.
export default function InsightButton({ getContext }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');

  const run = async () => {
    setOpen(true);
    if (busy) return;
    setBusy(true); setText('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const ctx = getContext();
      const r = await fetch('/api/insight', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, page: ctx.page, context: ctx }),
      });
      const j = await r.json();
      setText(r.ok ? j.text : `⚠️ ${j.error || 'failed'}`);
    } catch (e) { setText('⚠️ ' + e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={run} title="✨ Rupert: insight on this page"
        className="text-xs px-2 py-0.5 rounded-lg border border-amber-400/40 text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 transition-colors">✨</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-amber-300">✨ Rupert on this page</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setOpen(false)}>✕</button>
            </div>
            {busy ? <div className="text-slate-400 text-sm animate-pulse">Reading the page…</div>
              : <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{text}</div>}
          </div>
        </div>
      )}
    </>
  );
}
