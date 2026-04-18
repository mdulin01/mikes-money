import { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((msg, type = 'info') => {
    const id = crypto.randomUUID();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2400);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-20 md:bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id}
            className={`px-4 py-2 rounded-lg text-sm shadow-lg ${
              t.type === 'error' ? 'bg-rose-600 text-white' :
              t.type === 'success' ? 'bg-emerald-600 text-white' :
              'bg-slate-700 text-slate-100'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
