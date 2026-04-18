import { useLocation, useNavigate } from 'react-router-dom';
import { SECTIONS } from '../constants';

export default function Nav({ onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();

  const pathFor = (id) => id === 'dashboard' ? '/' : `/${id}`;
  const isActive = (id) => location.pathname === pathFor(id);

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

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 flex z-50">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => navigate(pathFor(s.id))}
            className={`flex-1 py-2 pt-2 pb-3 flex flex-col items-center gap-0.5 text-[10px] transition-colors ${
              isActive(s.id) ? 'text-emerald-400' : 'text-slate-500'
            }`}
          >
            <span className="text-lg">{s.emoji}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
