import { useLocation, useNavigate } from 'react-router-dom';
import { SECTIONS } from '../constants';

// Mobile nav: 11 sections don't fit a bottom bar — group them into 5 tabs by job.
// Tapping a group opens its primary page; a sub-pill row swaps between siblings.
// Desktop keeps the full flat top nav.
const GROUPS = [
  { id: 'home', label: 'Home', emoji: '📊', sections: ['dashboard'] },
  { id: 'spend', label: 'Spend', emoji: '💳', sections: ['transactions', 'budgets', 'cashflow'] },
  { id: 'invest', label: 'Invest', emoji: '📈', sections: ['holdings', 'allocation', 'retirement'] },
  { id: 'tax', label: 'Tax', emoji: '🧾', sections: ['tax', 'scenarios'] },
  { id: 'more', label: 'More', emoji: '⋯', sections: ['accounts', 'checkup'] },
];

export default function Nav({ onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();

  const pathFor = (id) => id === 'dashboard' ? '/' : `/${id}`;
  const isActive = (id) => location.pathname === pathFor(id);
  const sectionById = (id) => SECTIONS.find((s) => s.id === id);

  const activeGroup = GROUPS.find((g) => g.sections.some(isActive)) || GROUPS[0];

  return (
    <>
      {/* Desktop top nav */}
      <nav className="hidden md:flex bg-slate-900 border-b border-slate-700 px-4 py-2 items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('/')}
            className="text-xl font-bold text-emerald-400 mr-4 hover:text-emerald-300 cursor-pointer"
          >
            💰 Mike's Money
          </button>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => navigate(pathFor(s.id))}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(s.id)
                  ? 'bg-emerald-900/50 text-emerald-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
        <button onClick={onLogout} className="text-sm text-slate-500 hover:text-slate-300">
          Sign out
        </button>
      </nav>

      {/* Mobile header */}
      <div className="md:hidden bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <button onClick={() => navigate('/')} className="text-lg font-bold text-emerald-400">
          💰 Mike's Money
        </button>
        <button onClick={onLogout} className="text-xs text-slate-500 hover:text-slate-300">Sign out</button>
      </div>

      {/* Mobile sub-nav: siblings of the active group (only when there's more than one) */}
      {activeGroup.sections.length > 1 && (
        <div className="md:hidden bg-slate-900/95 border-b border-slate-800 px-3 py-2 flex gap-2 overflow-x-auto sticky top-[49px] z-40">
          {activeGroup.sections.map((id) => {
            const s = sectionById(id);
            if (!s) return null;
            return (
              <button
                key={id}
                onClick={() => navigate(pathFor(id))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive(id)
                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {s.emoji} {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile bottom nav — 5 grouped tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 flex z-50">
        {GROUPS.map((g) => {
          const active = activeGroup.id === g.id;
          return (
            <button
              key={g.id}
              onClick={() => navigate(pathFor(g.sections[0]))}
              className={`flex-1 py-2 pt-2 pb-3 flex flex-col items-center gap-0.5 text-[11px] transition-colors ${
                active ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              <span className="text-xl">{g.emoji}</span>
              <span>{g.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
