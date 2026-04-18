import { useState } from 'react';
import { money } from '../utils/format';
import { ACCOUNT_TYPES } from '../constants';
import PlaidLinkButton from '../components/PlaidLinkButton';

export default function Accounts({ data, accounts, addManualAccount, updateManualAccount, deleteManualAccount }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'real-estate', side: 'asset', balance: 0 });
  const manual = data?.manualAccounts || [];

  const submit = () => {
    if (!form.name || !form.balance) return;
    addManualAccount({ ...form, balance: Number(form.balance) });
    setForm({ name: '', type: 'real-estate', side: 'asset', balance: 0 });
    setShowForm(false);
  };

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-slate-400 text-sm">Linked via Plaid + manual assets</p>
        </div>
        <div className="flex gap-2">
          <PlaidLinkButton />
          <button
            onClick={() => setShowForm(s => !s)}
            className="bg-slate-700 hover:bg-slate-600 text-slate-100 px-4 py-2 rounded-lg text-sm"
          >
            + Manual
          </button>
        </div>
      </header>

      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <input
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Name (e.g. Primary residence)"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              value={form.type}
              onChange={(e) => {
                const t = ACCOUNT_TYPES.find(x => x.id === e.target.value);
                setForm(f => ({ ...f, type: e.target.value, side: t?.side || 'asset' }));
              }}
            >
              {ACCOUNT_TYPES.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
            </select>
            <select
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              value={form.side}
              onChange={(e) => setForm(f => ({ ...f, side: e.target.value }))}
            >
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
            </select>
            <input
              type="number"
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm mono-nums"
              placeholder="Balance"
              value={form.balance}
              onChange={(e) => setForm(f => ({ ...f, balance: e.target.value }))}
            />
          </div>
          <button onClick={submit} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm">
            Save
          </button>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">Linked accounts ({accounts.length})</h2>
        {accounts.length === 0 && (
          <p className="text-slate-500 text-sm">No accounts linked yet. Click "Link account" to connect via Plaid.</p>
        )}
        <ul className="divide-y divide-slate-700/60 bg-slate-800 rounded-xl border border-slate-700">
          {accounts.map(a => (
            <li key={a.id} className="flex justify-between items-center px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-slate-500 text-xs">{a.institution} · {a.type}{a.mask ? ` ····${a.mask}` : ''}</div>
              </div>
              <div className="mono-nums">{money(a.balance, { cents: true })}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">Manual accounts ({manual.length})</h2>
        {manual.length === 0 && <p className="text-slate-500 text-sm">No manual accounts. Use for home value, vehicles, crypto, etc.</p>}
        <ul className="divide-y divide-slate-700/60 bg-slate-800 rounded-xl border border-slate-700">
          {manual.map(a => (
            <li key={a.id} className="flex justify-between items-center px-4 py-3 text-sm gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.name}</div>
                <div className="text-slate-500 text-xs">{a.type} · {a.side}</div>
              </div>
              <input
                type="number"
                defaultValue={a.balance}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== a.balance) updateManualAccount(a.id, { balance: v });
                }}
                className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right mono-nums"
              />
              <button
                onClick={() => { if (confirm(`Delete "${a.name}"?`)) deleteManualAccount(a.id); }}
                className="text-slate-500 hover:text-rose-400 text-xs"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
