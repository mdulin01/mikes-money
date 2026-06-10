import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

// Rupert's note for this app. The Mac mini (Rupert) writes a short note +
// signals + priorities into this app's own Firestore at rupert/note; this
// banner reads it and shows it at the top of the app. Hidden when absent.
//
// Doc shape (rupert/note):
//   { text, signals:[{label, href?}], priorities:[string], updatedAt }
//
// Firestore rules must allow the signed-in owner to READ rupert/{doc}.

const rel = (iso) => {
  try {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  } catch { return ''; }
};


// Always-visible floating peacock — opens Rupert chat in Mike's Life from any spoke app.
const RUPERT_URL = 'https://mikeslife.app/?rupert=1';
function FloatingPeacock({ accent }) {
  return (
    <a href={RUPERT_URL} target="_blank" rel="noopener noreferrer" title="Talk to Rupert"
      style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 9999, width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, textDecoration: 'none', background: 'rgba(15,23,42,.88)', border: `1.5px solid ${accent}88`, boxShadow: `0 4px 18px rgba(0,0,0,.35), 0 0 12px ${accent}44`, backdropFilter: 'blur(6px)' }}>
      <span role="img" aria-label="Rupert">🦚</span>
    </a>
  );
}

export default function RupertBanner({ db, accent = '#2dd4bf' }) {
  const [note, setNote] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!db) return;
    try {
      return onSnapshot(doc(db, 'rupert', 'note'),
        (s) => setNote(s.exists() ? s.data() : null), () => {});
    } catch { /* ignore */ }
  }, [db]);

  if (!note || hidden) return <FloatingPeacock accent={accent} />;
  const signals = note.signals || [];
  const priorities = note.priorities || [];
  if (!note.text && !signals.length && !priorities.length) return <FloatingPeacock accent={accent} />;

  const S = {
    wrap: { margin: '12px auto 0', maxWidth: 1120, padding: '0 16px' },
    card: { position: 'relative', background: `linear-gradient(135deg, ${accent}1a, rgba(15,23,42,.55))`, border: `1px solid ${accent}55`, borderRadius: 14, padding: '13px 15px', display: 'flex', gap: 12, alignItems: 'flex-start', color: '#e8edf5', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif' },
    avatar: { fontSize: 24, lineHeight: 1, flex: '0 0 auto', filter: `drop-shadow(0 0 6px ${accent}66)` },
    body: { minWidth: 0, flex: 1 },
    name: { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: accent },
    text: { fontSize: 14, lineHeight: 1.5, margin: '2px 0 0', whiteSpace: 'pre-wrap' },
    sigrow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13 },
    sigdot: { width: 7, height: 7, borderRadius: '50%', background: accent, flex: '0 0 auto' },
    siglink: { color: accent, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' },
    prio: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 },
    chip: { fontSize: 11, fontWeight: 600, color: '#cbd5e1', background: 'rgba(148,163,184,.14)', border: '1px solid rgba(148,163,184,.2)', borderRadius: 999, padding: '3px 9px' },
    foot: { fontSize: 11, color: '#64748b', marginTop: 9 },
    flink: { color: '#94a3b8', textDecoration: 'none' },
    x: { position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 },
  };

  return (
    <>
    <FloatingPeacock accent={accent} />
    <div style={S.wrap}>
      <div style={S.card}>
        <button style={S.x} title="Dismiss" onClick={() => setHidden(true)}>×</button>
        <span style={S.avatar} role="img" aria-label="Rupert">🦚</span>
        <div style={S.body}>
          <div style={S.name}>Rupert</div>
          {note.text && <p style={S.text}>{note.text}</p>}
          {signals.map((sg, i) => (
            <div style={S.sigrow} key={i}>
              <span style={S.sigdot} />
              {sg.href
                ? <a style={S.siglink} href={sg.href}>{sg.label} →</a>
                : <span>{sg.label}</span>}
            </div>
          ))}
          {priorities.length > 0 && (
            <div style={S.prio}>
              {priorities.map((p, i) => <span style={S.chip} key={i}>{p}</span>)}
            </div>
          )}
          <div style={S.foot}>
            Rupert{note.updatedAt ? ` · updated ${rel(note.updatedAt)}` : ''} ·{' '}
            <a style={S.flink} href="https://mikeslife.app" target="_blank" rel="noopener noreferrer">open in Mike’s Life ↗</a>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
