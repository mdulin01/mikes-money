import { useMemo, useState } from 'react';
import { money, pct } from '../utils/format';

const BLANK_FORM = {
  accountName: '',
  ticker: '',
  name: '',
  quantity: '',
  institutionPrice: '',
  institutionValue: '',
  costBasis: '',
  type: 'equity',
};

export default function Holdings({
  holdings, accounts, investmentsTotal,
  addManualHolding, updateManualHolding, deleteManualHolding,
  data, updateConfig,
}) {
  const [groupBy, setGroupBy] = useState('account');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [editingId, setEditingId] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map(a => [a.id, a])),
    [accounts],
  );

  const groups = useMemo(() => {
    const g = {};
    for (const h of holdings) {
      let key;
      if (groupBy === 'account') {
        key = h.manual ? (h.accountName || 'Manual') : (accountById[h.accountId]?.name || 'Unknown');
      } else if (groupBy === 'type') {
        key = h.type || 'Other';
      } else {
        key = h.ticker || h.name || h.securityId || 'Unknown';
      }
      if (!g[key]) g[key] = { key, items: [], total: 0 };
      g[key].items.push(h);
      g[key].total += h.institutionValue || 0;
    }
    return Object.values(g).sort((a, b) => b.total - a.total);
  }, [holdings, groupBy, accountById]);

  const costBasisTotal = holdings.reduce((s, h) => s + (h.costBasis || 0), 0);
  const unrealized = costBasisTotal > 0 ? investmentsTotal - costBasisTotal : null;

  // Auto-derive institutionValue from qty*price if value is empty
  const derivedValue = useMemo(() => {
    const q = Number(form.quantity), p = Number(form.institutionPrice);
    if (q && p) return (q * p).toFixed(2);
    return '';
  }, [form.quantity, form.institutionPrice]);

  const openNewForm = () => {
    setForm(BLANK_FORM);
    setEditingId(null);
    setFormOpen(true);
  };

  const openEditForm = (h) => {
    setForm({
      accountName: h.accountName || '',
      ticker: h.ticker || '',
      name: h.name || '',
      quantity: h.quantity ?? '',
      institutionPrice: h.institutionPrice ?? '',
      institutionValue: h.institutionValue ?? '',
      costBasis: h.costBasis ?? '',
      type: h.type || 'equity',
    });
    setEditingId(h.id);
    setFormOpen(true);
  };

  const submit = async () => {
    const value = Number(form.institutionValue || derivedValue || 0);
    if (!form.accountName || !value) {
      alert('Account name and total value are required.');
      return;
    }
    const payload = {
      accountName: form.accountName,
      ticker: form.ticker || null,
      name: form.name || form.ticker || 'Untitled',
      quantity: form.quantity ? Number(form.quantity) : null,
      institutionPrice: form.institutionPrice ? Number(form.institutionPrice) : null,
      institutionValue: value,
      costBasis: form.costBasis ? Number(form.costBasis) : null,
      type: form.type,
      currency: 'USD',
    };
    if (editingId) await updateManualHolding(editingId, payload);
    else await addManualHolding(payload);
    setFormOpen(false);
    setForm(BLANK_FORM);
    setEditingId(null);
  };

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Holdings</h1>
          <p className="text-slate-400 text-sm">
            {holdings.length} positions · {money(investmentsTotal)}
            {unrealized !== null && (
              <> · unrealized {money(unrealized)} ({pct(unrealized / costBasisTotal)})</>
            )}
          </p>
          {(data?.manualHoldings?.length > 0) && (
            <p className="text-amber-400/80 text-xs mt-1">
              ⚠ Manually entered — the top-bar <b>Update</b> syncs Plaid accounts &amp; transactions, not these positions.
              {data?.manualHoldingsUpdatedAt
                ? <> Last edited {new Date(data.manualHoldingsUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</>
                : ' Edit a holding or Bulk import to refresh.'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="account">Group: Account</option>
            <option value="type">Group: Type</option>
            <option value="ticker">Group: Ticker</option>
          </select>
          <button
            onClick={openNewForm}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-sm"
          >
            + Add manual
          </button>
          <button
            onClick={() => { setBulkOpen(s => !s); setBulkError(null); setBulkPreview(null); }}
            className="bg-slate-700 hover:bg-slate-600 text-slate-100 px-3 py-2 rounded-lg text-sm"
          >
            Bulk import
          </button>
        </div>
      </header>

      {bulkOpen && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Bulk import (JSON)</h2>
          <p className="text-xs text-slate-400">
            Paste a JSON array of holding objects. Each item: {"{ accountName, ticker?, name?, quantity?, institutionPrice?, institutionValue, costBasis?, type? }"}.
            Only <code className="text-emerald-400">accountName</code> and <code className="text-emerald-400">institutionValue</code> are required.
            Valid type values: equity, etf, mutual fund, fixed income, cash, cryptocurrency, derivative.
          </p>
          <textarea
            rows={10}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder='[{"accountName": "TIAA 403b", "ticker": "VIIIX", "name": "Vanguard Institutional Index", "quantity": 1234.56, "institutionPrice": 456.78, "institutionValue": 563918.97, "type": "mutual fund"}]'
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono"
          />
          {bulkError && <p className="text-xs text-rose-400">{bulkError}</p>}
          {bulkPreview && (
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-lg p-3 text-xs">
              <div className="text-slate-300 font-semibold mb-2">Preview — {bulkPreview.length} holdings, total {money(bulkPreview.reduce((s, h) => s + (h.institutionValue || 0), 0))}</div>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {bulkPreview.map((h, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-slate-400 w-28 truncate">{h.accountName}</span>
                    <span className="font-mono text-emerald-300 w-16">{h.ticker || '—'}</span>
                    <span className="flex-1 truncate text-slate-500">{h.name || '(no name)'}</span>
                    <span className="mono-nums">{money(h.institutionValue)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setBulkError(null);
                setBulkPreview(null);
                try {
                  const parsed = JSON.parse(bulkText);
                  if (!Array.isArray(parsed)) throw new Error('Top level must be an array');
                  const normalized = parsed.map((p, i) => {
                    if (!p.accountName) throw new Error(`Item ${i}: missing accountName`);
                    if (p.institutionValue == null) throw new Error(`Item ${i}: missing institutionValue`);
                    return {
                      accountName: String(p.accountName),
                      ticker: p.ticker ? String(p.ticker).toUpperCase() : null,
                      name: p.name ? String(p.name) : (p.ticker ? String(p.ticker) : 'Untitled'),
                      quantity: p.quantity != null ? Number(p.quantity) : null,
                      institutionPrice: p.institutionPrice != null ? Number(p.institutionPrice) : null,
                      institutionValue: Number(p.institutionValue),
                      costBasis: p.costBasis != null ? Number(p.costBasis) : null,
                      type: p.type || 'equity',
                      currency: 'USD',
                    };
                  });
                  setBulkPreview(normalized);
                } catch (e) {
                  setBulkError(e.message);
                }
              }}
              className="bg-slate-700 hover:bg-slate-600 text-slate-100 px-4 py-2 rounded-lg text-sm"
            >
              Parse & preview
            </button>
            {bulkPreview && (
              <button
                onClick={async () => {
                  const withIds = bulkPreview.map(h => ({ id: crypto.randomUUID(), ...h }));
                  const next = [...(data?.manualHoldings || []), ...withIds];
                  await updateConfig({ manualHoldings: next, manualHoldingsUpdatedAt: new Date().toISOString() });
                  setBulkOpen(false);
                  setBulkText('');
                  setBulkPreview(null);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm"
              >
                Import {bulkPreview.length}
              </button>
            )}
            <button
              onClick={() => { setBulkOpen(false); setBulkText(''); setBulkError(null); setBulkPreview(null); }}
              className="text-slate-400 hover:text-slate-200 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="bg-slate-800 border border-emerald-900/50 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-emerald-300">
            {editingId ? 'Edit holding' : 'Add holding manually'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <Field label="Account name (e.g. 'TIAA 403b')">
              <input value={form.accountName} onChange={(e) => setForm(f => ({ ...f, accountName: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2" />
            </Field>
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
                <option value="equity">Equity (stock)</option>
                <option value="etf">ETF</option>
                <option value="mutual fund">Mutual fund</option>
                <option value="fixed income">Bond / fixed income</option>
                <option value="cash">Cash / money market</option>
                <option value="cryptocurrency">Crypto</option>
                <option value="derivative">Derivative / alternative</option>
              </select>
            </Field>
            <Field label="Ticker (optional)">
              <input value={form.ticker} onChange={(e) => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="VTI, TIAA-CREF, TIAATRAD…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 mono-nums" />
            </Field>
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Vanguard Total Stock Market"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2" />
            </Field>
            <Field label="Quantity">
              <input type="number" step="any" value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 mono-nums" />
            </Field>
            <Field label="Price per unit">
              <input type="number" step="any" value={form.institutionPrice} onChange={(e) => setForm(f => ({ ...f, institutionPrice: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 mono-nums" />
            </Field>
            <Field label={`Total value ${derivedValue ? `(auto ${derivedValue})` : ''}`}>
              <input type="number" step="any"
                value={form.institutionValue}
                onChange={(e) => setForm(f => ({ ...f, institutionValue: e.target.value }))}
                placeholder={derivedValue || 'required'}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 mono-nums" />
            </Field>
            <Field label="Cost basis (optional)">
              <input type="number" step="any" value={form.costBasis} onChange={(e) => setForm(f => ({ ...f, costBasis: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 mono-nums" />
            </Field>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={submit} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm">
              {editingId ? 'Save' : 'Add'}
            </button>
            <button onClick={() => { setFormOpen(false); setEditingId(null); }}
              className="text-slate-400 hover:text-slate-200 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {holdings.length === 0 && !formOpen && (
        <p className="text-slate-500 text-sm bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
          No holdings yet. Either link a brokerage with Plaid's Investments product, or click
          <span className="text-emerald-400 font-medium"> + Add manual </span>
          to enter positions from TIAA/401k/etc. by hand.
        </p>
      )}

      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.key} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2 flex justify-between items-center bg-slate-800/60 border-b border-slate-700/60">
              <div className="font-medium text-slate-200">{g.key}</div>
              <div className="mono-nums text-emerald-400">{money(g.total)}</div>
            </div>
            <ul className="divide-y divide-slate-700/60">
              {g.items.map(h => {
                const pnl = (h.costBasis != null) ? h.institutionValue - h.costBasis : null;
                const pnlPct = (h.costBasis > 0) ? pnl / h.costBasis : null;
                return (
                  <li key={h.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="truncate flex items-center gap-2">
                        <span className="font-mono text-emerald-300">{h.ticker || '—'}</span>
                        <span className="text-slate-400 text-xs">{h.name}</span>
                        {h.manual && <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">manual</span>}
                      </div>
                      <div className="text-slate-500 text-xs">
                        {h.quantity != null ? `${Number(h.quantity).toFixed(4)} units` : ''}
                        {h.institutionPrice ? ` @ ${money(h.institutionPrice, { cents: true })}` : ''}
                        {h.type ? ` · ${h.type}` : ''}
                      </div>
                    </div>
                    {pnl !== null && (
                      <div className={`text-xs mono-nums ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pnl >= 0 ? '+' : ''}{money(pnl)}{pnlPct != null ? ` (${pct(pnlPct)})` : ''}
                      </div>
                    )}
                    <div className="w-24 text-right mono-nums">{money(h.institutionValue)}</div>
                    {h.manual && (
                      <div className="flex gap-2">
                        <button onClick={() => openEditForm(h)} className="text-slate-400 hover:text-slate-200 text-xs">Edit</button>
                        <button onClick={() => { if (confirm(`Delete ${h.ticker || h.name}?`)) deleteManualHolding(h.id); }}
                          className="text-slate-500 hover:text-rose-400 text-xs">
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-slate-400 text-xs mb-1">{label}</div>
      {children}
    </label>
  );
}
