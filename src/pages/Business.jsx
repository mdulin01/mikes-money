import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db, auth } from '../firebase-config';
import { COLLECTIONS } from '../constants';
import { money } from '../utils/format';
import { toLocalDateStr, toLocalMonthStr } from '../utils/dateUtils';
import { downloadInvoice, invoiceBase64 } from '../utils/invoicePdf';
import { effectiveClass } from '../utils/classify';
import TxnPopover from '../components/TxnPopover';

// Activity types for time entries — drive the per-week itemization on invoices.
const ACTIVITIES = [
  { id: 'clinical',  label: 'Clinical services' },
  { id: 'vbc',       label: 'Value-based care (VBC)' },
  { id: 'referral',  label: 'Referral strategy' },
  { id: 'dashboard', label: 'Dashboard review & development' },
  { id: 'meeting',   label: 'Meeting' },
  { id: 'admin',     label: 'Administrative' },
  { id: 'other',     label: 'Other' },
];
const activityLabel = (id) => (ACTIVITIES.find((a) => a.id === id) || {}).label || 'Clinical services';

// ── Client billing rules (ported from the mikedulinmd portal timesheet; portal retires) ──
const CLIENTS = {
  avance: { label: 'Avance Care', type: 'weekly-min', rate: 250, minHrs: 10, desc: '$250/hr · 10 hr/wk minimum',
            greeting: 'Dr. Steventon —', to: ['asteventon@avancecare.com'], cc: ['ap@avancecare.com'] },
  triad:  { label: 'Triad Primary Care', type: 'weekly-tier', t1Rate: 150, t1Hrs: 16, t2Rate: 200, desc: '$150/hr first 16 hr/wk · $200/hr above',
            greeting: 'Hello —', to: [], cc: [] },
  gma:    { label: 'Gray Matter Analytics', type: 'retainer', amount: 1000, desc: '$1,000/mo retainer',
            greeting: 'Sheila, Louise —', to: ['stalton@graymatteranalytics.com'], cc: ['ltilmon@graymatteranalytics.com'] },
  unc:    { label: 'UNC Charlotte', type: 'flat', amount: 2500, desc: 'Flat $2,500 / quarter',
            greeting: 'Hello —', to: [], cc: [] },
};

// How each payer shows up in bank transactions (BOA strips the sender on book wires — TPC confirmed).
const PAYERS = [
  { id: 'avance', label: 'Avance Care', re: /avance/i },
  // TPC pays by BOA book wire (sender stripped). Early payments posted under parent
  // company "Generations Family Medicine" — same payer, one row.
  { id: 'tpc',    label: 'Triad Primary Care', re: /wire type:book|generations/i },
  { id: 'gma',    label: 'Gray Matter', re: /gray\s?matter/i },
  { id: 'unc',    label: 'UNC Charlotte', re: /unc charlotte|uncc|university of north carolina at charlotte/i },
];
// Safety net: business-classed inflows that match NO payer regex land here instead of
// silently vanishing from the matrix (which is how a $12,150 Generations deposit went
// missing before Generations had a row). If this bucket shows money, a payer needs a regex.
const OTHER_PAYER = { id: 'other-biz', label: '⚠ Other business income' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Business-expense categories (Schedule C) + 2026 IRS standard business mileage rate ──
const MILEAGE_RATE = 0.725; // $/mile, IRS 2026 business standard rate (eff. 1/1/2026)
const EXPENSE_CATS = [
  { id: 'mileage',   label: 'Mileage',                 emoji: '🚗' },
  { id: 'supplies',  label: 'Supplies',                emoji: '📦' },
  { id: 'software',  label: 'Software / Subscriptions', emoji: '💻' },
  { id: 'prof-dev',  label: 'Professional Development', emoji: '🎓' },
  { id: 'licensing', label: 'Licensing / Credentials',  emoji: '🪪' },
  { id: 'meals',     label: 'Meals',                   emoji: '🍽️' },
  { id: 'travel',    label: 'Travel',                  emoji: '✈️' },
  { id: 'equipment', label: 'Equipment',               emoji: '🛠️' },
  { id: 'office',    label: 'Office / Home Office',     emoji: '🏠' },
  { id: 'insurance', label: 'Insurance',               emoji: '🛡️' },
  { id: 'dues',      label: 'Dues / Memberships',       emoji: '🎟️' },
  { id: 'other',     label: 'Other',                   emoji: '•' },
];

// Monday-start week key, local time.
function weekKeyOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toLocalDateStr(d);
}

// Billing for one client over a set of hour entries (already filtered to a period).
function computeBilling(clientId, ents) {
  const c = CLIENTS[clientId];
  const valid = (ents || []).filter((e) => e.date && Number(e.hours) > 0);
  const totalHrs = valid.reduce((s, e) => s + Number(e.hours), 0);
  if (!c) return { totalHrs, amount: 0, weeks: [] };
  if (c.type === 'flat' || c.type === 'retainer') return { totalHrs, amount: c.amount, flat: true, weeks: [] };
  const byWeek = {};
  for (const e of valid) { const k = weekKeyOf(e.date); byWeek[k] = (byWeek[k] || 0) + Number(e.hours); }
  const weeks = Object.entries(byWeek).sort().map(([wk, hrs]) => {
    if (c.type === 'weekly-min') {
      const billedHrs = Math.max(hrs, c.minHrs);
      return { wk, hrs, amt: billedHrs * c.rate, detail: hrs + ' hr' + (hrs < c.minHrs ? ' (billed as ' + c.minHrs + ' min)' : '') + ' @ $' + c.rate };
    }
    const t1 = Math.min(hrs, c.t1Hrs), t2 = Math.max(0, hrs - c.t1Hrs);
    return { wk, hrs, amt: t1 * c.t1Rate + t2 * c.t2Rate, detail: t1 + ' hr @ $' + c.t1Rate + (t2 ? ' + ' + t2 + ' hr @ $' + c.t2Rate : '') };
  });
  return { totalHrs, amount: weeks.reduce((s, w) => s + w.amt, 0), weeks };
}

const card = 'bg-slate-800 border border-slate-700 rounded-xl p-4';
const inputCls = 'bg-slate-900 border border-slate-700 rounded-lg px-2 h-9 text-sm text-slate-200 focus:outline-none focus:border-emerald-500';
const btnCls = 'px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white';
const btnGhost = 'px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700';
const selectCls = inputCls + ' appearance-none pr-8 cursor-pointer';
const chevron = { backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' };


export default function Business({ data, updateConfig }) {
  const biz = data?.business || {};
  const hours = biz.hours || [];
  const invoices = biz.invoices || [];
  const gmaEntries = (biz.gma && biz.gma.entries) || [];

  const year = new Date().getFullYear();
  const thisMonth = toLocalMonthStr();
  const [month, setMonth] = useState(thisMonth);

  // ── Income by payer: one-shot YTD pull (recentTxns is capped at 500) ──
  const [ytdTxns, setYtdTxns] = useState(null);
  useEffect(() => {
    getDocs(query(collection(db, COLLECTIONS.TRANSACTIONS), where('date', '>=', year + '-01-01'), limit(4000)))
      .then((snap) => setYtdTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => { console.error('YTD income query failed', e); setYtdTxns([]); });
  }, [year]);

  const incomeMatrix = useMemo(() => {
    const m = {};
    const ignored = new Set(data?.ignoredAccounts || []); // match Tax page so Sch C income reconciles
    for (const p of [...PAYERS, OTHER_PAYER]) m[p.id] = { label: p.label, months: Array(12).fill(0), byMonth: Array.from({ length: 12 }, () => []), total: 0, txns: [] };
    for (const t of ytdTxns || []) {
      if ((t.amount || 0) >= 0 || ignored.has(t.accountId)) continue; // inflows only (Plaid: negative = money in)
      const name = (t.merchantName || '') + ' ' + (t.name || '');
      const p = PAYERS.find((p) => p.re.test(name));
      // No payer regex matched — keep it anyway if it's business income (tagged or rule-classed),
      // in the ⚠ bucket, so the matrix total always reconciles with the Tax page's Schedule C income.
      const id = p ? p.id : (effectiveClass(t, null, data?.userRules) === 'business' ? OTHER_PAYER.id : null);
      if (!id) continue;
      const amt = -t.amount;
      const mo = Number((t.date || '').slice(5, 7)) - 1;
      if (mo >= 0) { m[id].months[mo] += amt; m[id].byMonth[mo].push(t); m[id].total += amt; m[id].txns.push(t); }
    }
    return m;
  }, [ytdTxns, data?.userRules, data?.ignoredAccounts]);
  const grandTotal = [...PAYERS, OTHER_PAYER].reduce((s, p) => s + incomeMatrix[p.id].total, 0);
  const maxMonth = new Date().getMonth();
  // Cell drill-down: { title, txns } → TxnPopover
  const [detail, setDetail] = useState(null);

  // ── Timesheet state ──
  const [form, setForm] = useState({ date: toLocalDateStr(), client: 'avance', activity: 'clinical', hours: '', note: '' });
  const saveHours = (next) => updateConfig({ business: { ...biz, hours: next } });
  const addEntry = () => {
    if (!form.date || !Number(form.hours)) return;
    saveHours([...hours, { id: crypto.randomUUID(), ...form, hours: Number(form.hours) }]);
    setForm({ ...form, hours: '', note: '' });
  };
  const monthEntries = hours.filter((e) => (e.date || '').startsWith(month)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const billingByClient = useMemo(() => {
    const out = [];
    for (const cid of Object.keys(CLIENTS)) {
      const ents = monthEntries.filter((e) => e.client === cid);
      if (!ents.length) continue;
      out.push({ cid, ...computeBilling(cid, ents) });
    }
    return out;
  }, [monthEntries]);

  // ── Invoices ──
  // ── Business expenses (incl. mileage) ──
  const expenses = biz.expenses || [];
  const saveExpenses = (next) => updateConfig({ business: { ...biz, expenses: next } });
  const [exp, setExp] = useState({ date: toLocalDateStr(), category: 'mileage', amount: '', miles: '', rate: MILEAGE_RATE, note: '' });
  const expMileageAmt = Math.round(Number(exp.miles || 0) * Number(exp.rate || 0) * 100) / 100;
  const addExpense = () => {
    const isMileage = exp.category === 'mileage';
    const amount = isMileage ? expMileageAmt : Number(exp.amount || 0);
    if (!exp.date || !amount) return;
    const entry = { id: crypto.randomUUID(), date: exp.date, category: exp.category, amount, note: exp.note };
    if (isMileage) { entry.miles = Number(exp.miles); entry.rate = Number(exp.rate || MILEAGE_RATE); }
    saveExpenses([...expenses, entry]);
    setExp({ ...exp, amount: '', miles: '', note: '' });
  };
  const monthExpenses = expenses.filter((e) => (e.date || '').startsWith(month)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const expByWeek = (() => {
    const g = {};
    for (const e of monthExpenses) { const k = weekKeyOf(e.date); (g[k] = g[k] || []).push(e); }
    return Object.entries(g).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();
  const monthExpTotal = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const monthMiles = monthExpenses.reduce((s, e) => s + (e.miles || 0), 0);
  const ytdExpTotal = expenses.filter((e) => (e.date || '').startsWith(String(year))).reduce((s, e) => s + (e.amount || 0), 0);

  const saveInvoices = (next) => updateConfig({ business: { ...biz, invoices: next } });
  const setInvoiceStatus = (id, status) => saveInvoices(invoices.map((i) => i.id === id ? { ...i, status, [status + 'At']: new Date().toISOString() } : i));

  // ── Invoice number + draft state ──
  const [invoiceNo, setInvoiceNo] = useState(biz.nextInvoiceNo || 1108);
  useEffect(() => { if (biz.nextInvoiceNo) setInvoiceNo(biz.nextInvoiceNo); }, [biz.nextInvoiceNo]);
  const [drafting, setDrafting] = useState(null); // cid currently drafting
  const [draftMsg, setDraftMsg] = useState(null); // { ok, text }

  const fmtLong = (ds) => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const fmtMonthYear = (ym) => new Date(ym + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build the structured invoice (weeks → activity items) the PDF + email need.
  const buildInvoiceData = (cid, no) => {
    const c = CLIENTS[cid];
    const ents = monthEntries.filter((e) => e.client === cid);
    const bill = computeBilling(cid, ents);
    const dates = ents.map((e) => e.date).filter(Boolean).sort();
    const periodLabel = dates.length
      ? `${fmtLong(dates[0])} – ${fmtLong(dates[dates.length - 1])}, ${year}`
      : fmtMonthYear(month);
    const subjectPeriod = fmtMonthYear(month);

    let weeks;
    if (c.type === 'flat' || c.type === 'retainer') {
      weeks = [{ label: periodLabel, items: [{ desc: c.desc, amtOverride: c.amount }] }];
    } else {
      const byWeek = {};
      for (const e of ents) { const k = weekKeyOf(e.date); (byWeek[k] = byWeek[k] || []).push(e); }
      weeks = Object.keys(byWeek).sort().map((k) => {
        const acts = {};
        for (const e of byWeek[k]) { const a = e.activity || 'clinical'; acts[a] = (acts[a] || 0) + Number(e.hours); }
        const items = ACTIVITIES.filter((a) => acts[a.id]).map((a) => ({ desc: a.label, hours: acts[a.id] }));
        const wkHours = items.reduce((s, i) => s + i.hours, 0);
        if (c.type === 'weekly-min' && wkHours < c.minHrs)
          items.push({ desc: `Weekly minimum (${c.minHrs} hr/wk)`, hours: c.minHrs - wkHours });
        return { label: 'Week of ' + fmtLong(k), items };
      });
      // Reconcile the line-item total against computeBilling (covers tiered pricing, etc.).
      const rate = c.rate || c.t1Rate || 0;
      const itemized = weeks.reduce((s, w) => s + w.items.reduce((t, i) => t + (i.amtOverride != null ? i.amtOverride : i.hours * rate), 0), 0);
      if (Math.abs(itemized - bill.amount) > 0.5 && weeks.length)
        weeks[weeks.length - 1].items.push({ desc: 'Tier / rate adjustment', amtOverride: bill.amount - itemized });
    }
    return {
      invoiceNo: no, period: periodLabel, subjectPeriod,
      issued: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      billTo: { name: c.label, attn: 'Attn: Accounts Payable' },
      rate: c.rate || c.t1Rate || 0, weeks,
    };
  };

  // PDF download only (no email).
  const downloadPdf = (cid) => downloadInvoice(buildInvoiceData(cid, Number(invoiceNo) || 1108));
  const redownload = (inv) => inv.data ? downloadInvoice(inv.data) : null;

  // Generate the PDF + create a Gmail draft with it attached.
  const generateAndDraft = async (cid) => {
    const c = CLIENTS[cid];
    const no = Number(invoiceNo) || 1108;
    setDrafting(cid); setDraftMsg(null);
    try {
      const data = buildInvoiceData(cid, no);
      const { base64, totalHours, totalAmt, filename } = invoiceBase64(data);
      const subject = `Dulin Invoice — ${data.subjectPeriod} (Invoice #${no})`;
      const body = `${c.greeting}\n\nPlease find attached my invoice for ${data.subjectPeriod} (Invoice #${no}), total ${money(totalAmt)}, with hours itemized by week.\n\nThanks again for the opportunity.\n\nMike Dulin\n704-641-2157 (cell)`;
      const idToken = await auth.currentUser.getIdToken();
      const r = await fetch('/api/invoice-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, to: c.to, cc: c.cc, subject, body, filename, pdfBase64: base64 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'draft failed');
      const inv = {
        id: crypto.randomUUID(), client: cid, label: c.label, period: data.period,
        invoiceNo: no, hours: totalHours, amount: totalAmt, status: 'drafted',
        createdAt: new Date().toISOString(), draftId: j.draftId, data,
      };
      updateConfig({ business: { ...biz, invoices: [inv, ...invoices], nextInvoiceNo: no + 1 } });
      setInvoiceNo(no + 1);
      setDraftMsg({ ok: true, text: `✉️ Draft created in Gmail (#${no}, ${money(totalAmt)}) — open Gmail → Drafts to review & send.` });
    } catch (e) {
      setDraftMsg({ ok: false, text: '⚠️ ' + e.message });
    } finally { setDrafting(null); }
  };

  // ── GMA receivable ledger (1.5%/mo + $75 late fee on outstanding balance) ──
  const saveGma = (next) => updateConfig({ business: { ...biz, gma: { entries: next } } });
  const gmaSorted = [...gmaEntries].sort((a, b) => (a.date > b.date ? 1 : -1));
  let bal = 0;
  const gmaRows = gmaSorted.map((e) => { bal += e.type === 'payment' ? -e.amount : e.amount; return { ...e, bal }; });
  const gmaBalance = bal;
  const [gmaForm, setGmaForm] = useState({ date: toLocalDateStr(), type: 'charge', amount: '', note: '' });
  const addGma = (entry) => saveGma([...gmaEntries, { id: crypto.randomUUID(), ...entry }]);
  const accrueLateFee = () => {
    const fee = Math.round(gmaBalance * 0.015) + 75;
    addGma({ date: toLocalDateStr(), type: 'fee', amount: fee, note: 'Late fee: 1.5% of $' + gmaBalance.toLocaleString() + ' + $75' });
  };
  // GMA bank deposits not yet recorded as ledger payments → one-tap record.
  const gmaDeposits = ((incomeMatrix.gma && incomeMatrix.gma.txns) || []).filter((t) =>
    !gmaEntries.some((e) => e.type === 'payment' && e.date === t.date && e.amount === -t.amount));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">💼 Business</h1>
        <p className="text-sm text-slate-400">Consulting income, hours, invoices, and the GMA receivable. (Replaces the portal timesheet.)</p>
      </div>

      <div className={card}>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold text-slate-200">Income by payer — {year} YTD</h2>
          <div className="mono-nums text-emerald-400 font-bold">{ytdTxns ? money(grandTotal) : '…'}</div>
        </div>
        {!ytdTxns ? <div className="text-sm text-slate-500">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-500 text-xs">
                <th className="text-left py-1 pr-2">Payer</th>
                {MONTHS.slice(0, maxMonth + 1).map((m) => <th key={m} className="text-right px-1">{m}</th>)}
                <th className="text-right pl-2">Total</th>
              </tr></thead>
              <tbody>
                {[...PAYERS, ...(incomeMatrix[OTHER_PAYER.id].total > 0 ? [OTHER_PAYER] : [])].map((p) => (
                  <tr key={p.id} className="border-t border-slate-700/60">
                    <td className={`py-1.5 pr-2 ${p.id === OTHER_PAYER.id ? 'text-amber-300' : 'text-slate-300'}`}
                        title={p.id === OTHER_PAYER.id ? incomeMatrix[p.id].txns.map(t => `${t.date} · ${t.merchantName || t.name} · $${-t.amount}`).join('\n') : undefined}>
                      {p.label}
                    </td>
                    {incomeMatrix[p.id].months.slice(0, maxMonth + 1).map((v, i) => (
                      <td key={i} className="mono-nums text-right px-1 text-slate-400">
                        {v ? (
                          <button
                            onClick={() => setDetail({ title: `${p.label} — ${MONTHS[i]} ${year}`, txns: incomeMatrix[p.id].byMonth[i] })}
                            title={incomeMatrix[p.id].byMonth[i].map((t) => `${t.date} · ${(t.merchantName || t.name || '').slice(0, 50)} · ${money(-t.amount, { cents: true })}`).join('\n') + '\n(click for detail)'}
                            className="hover:text-emerald-300 hover:underline decoration-dotted underline-offset-2 cursor-pointer">
                            {money(v)}
                          </button>
                        ) : '·'}
                      </td>
                    ))}
                    <td className="mono-nums text-right pl-2 font-medium text-slate-100">
                      <button onClick={() => setDetail({ title: `${p.label} — ${year} YTD`, txns: incomeMatrix[p.id].txns })}
                        title="All deposits from this payer (click for detail)"
                        className="hover:text-emerald-300 cursor-pointer">
                        {money(incomeMatrix[p.id].total)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-2">TPC pays by BOA book wire (sender name stripped) — earlier payments posted as parent co. "Generations Family Medicine". Avg {money(Math.round(grandTotal / (maxMonth + 1)))}/mo. Hover an amount for the deposits behind it; click to see full detail.</p>
          </div>
        )}
      </div>

      <div className={card}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-slate-200">Timesheet</h2>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-wrap gap-2 items-end mb-4">
          <label className="text-xs text-slate-500">Date<br /><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></label>
          <label className="text-xs text-slate-500">Client<br />
            <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} className={selectCls} style={chevron}>
              {Object.entries(CLIENTS).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
            </select></label>
          <label className="text-xs text-slate-500">Activity<br />
            <select value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} className={selectCls} style={chevron}>
              {ACTIVITIES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select></label>
          <label className="text-xs text-slate-500">Hours<br /><input type="number" step="0.25" min="0" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} className={inputCls + ' w-20'} /></label>
          <label className="text-xs text-slate-500 flex-1 min-w-[140px]">Note<br /><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls + ' w-full'} /></label>
          <button onClick={addEntry} className={btnCls}>＋ Log</button>
        </div>
        {monthEntries.length === 0 ? <div className="text-sm text-slate-500">No hours logged for {month}.</div> : (
          <div className="space-y-1 mb-4">
            {monthEntries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-sm py-1 border-b border-slate-700/40">
                <span className="mono-nums text-slate-500 w-24">{e.date}</span>
                <span className="text-slate-300 flex-1">{(CLIENTS[e.client] || {}).label || e.client}<span className="text-slate-500"> · {activityLabel(e.activity)}</span>{e.note ? <span className="text-slate-500"> — {e.note}</span> : null}</span>
                <span className="mono-nums text-slate-200">{e.hours} hr</span>
                <button onClick={() => saveHours(hours.filter((h) => h.id !== e.id))} className={btnGhost}>✕</button>
              </div>
            ))}
          </div>
        )}
        {billingByClient.length > 0 && (
          <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
            <span>Next invoice #</span>
            <input type="number" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={inputCls + ' w-24'} />
          </div>
        )}
        {billingByClient.map((b) => {
          const c = CLIENTS[b.cid];
          const canEmail = c.to && c.to.length;
          return (
            <div key={b.cid} className="flex items-center justify-between bg-slate-900/60 rounded-lg px-3 py-2 mb-2 flex-wrap gap-2">
              <div className="text-sm">
                <span className="text-slate-200 font-medium">{c.label}</span>
                <span className="text-slate-500"> · {b.totalHrs} hr → </span>
                <span className="mono-nums text-emerald-400 font-semibold">{money(b.amount)}</span>
                <div className="text-xs text-slate-500">{c.desc}{canEmail ? ` · to ${c.to.join(', ')}` : ' · no recipients set'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadPdf(b.cid)} className={btnGhost} title="Download the invoice PDF">⬇︎ PDF</button>
                <button onClick={() => generateAndDraft(b.cid)} disabled={!canEmail || drafting === b.cid}
                  className={btnCls + (!canEmail || drafting === b.cid ? ' opacity-50 cursor-not-allowed' : '')}
                  title={canEmail ? 'Generate the PDF and create a Gmail draft' : 'Add recipients for this client first'}>
                  {drafting === b.cid ? '… drafting' : '✉️ Invoice + email draft'}
                </button>
              </div>
            </div>
          );
        })}
        {draftMsg && (
          <div className={'text-sm rounded-lg px-3 py-2 mt-1 ' + (draftMsg.ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-rose-900/40 text-rose-200')}>
            {draftMsg.text}
          </div>
        )}
      </div>

      {/* Business expenses (incl. mileage) */}
      <div className={card}>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h2 className="font-semibold text-slate-200">Business expenses</h2>
          <div className="text-sm text-slate-400">{month}: <span className="mono-nums text-rose-300 font-semibold">{money(monthExpTotal, { cents: true })}</span>{monthMiles > 0 ? <span className="text-slate-500"> · {monthMiles.toLocaleString()} mi</span> : null}</div>
        </div>
        <p className="text-xs text-slate-500 mb-3">Log deductible Schedule C expenses weekly. Mileage uses the {year} IRS business rate (${MILEAGE_RATE}/mi). YTD expenses: {money(ytdExpTotal)}.</p>
        <div className="flex flex-wrap gap-2 items-end mb-4">
          <label className="text-xs text-slate-500">Date<br /><input type="date" value={exp.date} onChange={(e) => setExp({ ...exp, date: e.target.value })} className={inputCls} /></label>
          <label className="text-xs text-slate-500">Category<br />
            <select value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })} className={selectCls} style={chevron}>
              {EXPENSE_CATS.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select></label>
          {exp.category === 'mileage' ? (
            <>
              <label className="text-xs text-slate-500">Miles<br /><input type="number" step="1" min="0" value={exp.miles} onChange={(e) => setExp({ ...exp, miles: e.target.value })} className={inputCls + ' w-24'} /></label>
              <label className="text-xs text-slate-500">Rate $/mi<br /><input type="number" step="0.001" min="0" value={exp.rate} onChange={(e) => setExp({ ...exp, rate: e.target.value })} className={inputCls + ' w-20'} /></label>
              <div className="text-xs text-slate-500 pb-1.5">= <span className="mono-nums text-slate-200">{money(expMileageAmt, { cents: true })}</span></div>
            </>
          ) : (
            <label className="text-xs text-slate-500">Amount<br /><input type="number" step="0.01" min="0" placeholder="$" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} className={inputCls + ' w-24'} /></label>
          )}
          <label className="text-xs text-slate-500 flex-1 min-w-[140px]">Note<br /><input value={exp.note} onChange={(e) => setExp({ ...exp, note: e.target.value })} className={inputCls + ' w-full'} /></label>
          <button onClick={addExpense} className={btnCls}>＋ Add</button>
        </div>
        {monthExpenses.length === 0 ? <div className="text-sm text-slate-500">No expenses logged for {month}.</div> : (
          <div className="space-y-3">
            {expByWeek.map(([wk, items]) => {
              const wkTotal = items.reduce((s, e) => s + (e.amount || 0), 0);
              return (
                <div key={wk}>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Week of {wk}</span>
                    <span className="mono-nums">{money(wkTotal, { cents: true })}</span>
                  </div>
                  <div className="space-y-1">
                    {items.map((e) => {
                      const cat = EXPENSE_CATS.find((c) => c.id === e.category) || { label: e.category, emoji: '•' };
                      return (
                        <div key={e.id} className="flex items-center gap-3 text-sm py-1 border-b border-slate-700/40">
                          <span className="mono-nums text-slate-500 w-24">{e.date}</span>
                          <span className="text-slate-300 flex-1">{cat.emoji} {cat.label}{e.miles ? <span className="text-slate-500"> — {e.miles.toLocaleString()} mi @ ${e.rate}</span> : null}{e.note ? <span className="text-slate-500"> — {e.note}</span> : null}</span>
                          <span className="mono-nums text-rose-300">{money(e.amount, { cents: true })}</span>
                          <button onClick={() => saveExpenses(expenses.filter((x) => x.id !== e.id))} className={btnGhost}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={card}>
        <h2 className="font-semibold text-slate-200 mb-3">Invoices</h2>
        {invoices.length === 0 ? <div className="text-sm text-slate-500">None yet — log hours above, then hit 🧾 Invoice.</div> : (
          <div className="space-y-1">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-slate-700/40 flex-wrap">
                <span className="mono-nums text-slate-500">{inv.period}</span>
                <span className="text-slate-200 flex-1">{inv.label}</span>
                <span className="mono-nums text-slate-100 font-medium">{money(inv.amount)}</span>
                <span className={'text-xs px-2 py-0.5 rounded-full ' + (inv.status === 'paid' ? 'bg-emerald-900/60 text-emerald-300' : inv.status === 'sent' ? 'bg-sky-900/60 text-sky-300' : 'bg-slate-700 text-slate-300')}>{inv.status}</span>
                {(inv.status === 'draft' || inv.status === 'drafted') && <button onClick={() => setInvoiceStatus(inv.id, 'sent')} className={btnGhost}>mark sent</button>}
                {inv.status === 'sent' && <button onClick={() => setInvoiceStatus(inv.id, 'paid')} className={btnGhost}>mark paid</button>}
                {inv.data && <button onClick={() => redownload(inv)} className={btnGhost} title="Download PDF">⬇︎</button>}
                <button onClick={() => saveInvoices(invoices.filter((i) => i.id !== inv.id))} className={btnGhost}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={card}>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-semibold text-slate-200">Gray Matter receivable</h2>
          <div className={'mono-nums font-bold ' + (gmaBalance > 0 ? 'text-amber-400' : 'text-emerald-400')}>{money(gmaBalance)} owed</div>
        </div>
        <p className="text-xs text-slate-500 mb-3">$1,000/mo retainer · late fee = 1.5%/mo on balance + $75. Seed the ledger with a charge for the carried balance.</p>
        {gmaDeposits.length > 0 && (
          <div className="mb-3 space-y-1">
            {gmaDeposits.map((t, i) => (
              <button key={i} onClick={() => addGma({ date: t.date, type: 'payment', amount: -t.amount, note: 'Bank deposit (Ally)' })}
                className="w-full text-left text-sm bg-emerald-900/30 border border-emerald-800 rounded-lg px-3 py-2 hover:bg-emerald-900/50">
                💵 Deposit {t.date} · {money(-t.amount)} — tap to record as payment
              </button>
            ))}
          </div>
        )}
        {gmaRows.length > 0 && (
          <div className="space-y-1 mb-3">
            {gmaRows.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-sm py-1 border-b border-slate-700/40">
                <span className="mono-nums text-slate-500 w-24">{e.date}</span>
                <span className={'text-xs px-2 py-0.5 rounded-full ' + (e.type === 'payment' ? 'bg-emerald-900/60 text-emerald-300' : e.type === 'fee' ? 'bg-rose-900/50 text-rose-300' : 'bg-slate-700 text-slate-300')}>{e.type}</span>
                <span className="text-slate-400 flex-1 text-xs">{e.note}</span>
                <span className={'mono-nums ' + (e.type === 'payment' ? 'text-emerald-400' : 'text-slate-200')}>{e.type === 'payment' ? '−' : '+'}{money(e.amount)}</span>
                <span className="mono-nums text-slate-500 w-20 text-right">{money(e.bal)}</span>
                <button onClick={() => saveGma(gmaEntries.filter((g) => g.id !== e.id))} className={btnGhost}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-end">
          <select value={gmaForm.type} onChange={(e) => setGmaForm({ ...gmaForm, type: e.target.value })} className={selectCls} style={chevron}>
            <option value="charge">charge</option><option value="payment">payment</option><option value="fee">fee</option>
          </select>
          <input type="date" value={gmaForm.date} onChange={(e) => setGmaForm({ ...gmaForm, date: e.target.value })} className={inputCls} />
          <input type="number" placeholder="$" value={gmaForm.amount} onChange={(e) => setGmaForm({ ...gmaForm, amount: e.target.value })} className={inputCls + ' w-24'} />
          <input placeholder="note" value={gmaForm.note} onChange={(e) => setGmaForm({ ...gmaForm, note: e.target.value })} className={inputCls + ' flex-1 min-w-[120px]'} />
          <button onClick={() => { if (Number(gmaForm.amount)) { addGma({ date: gmaForm.date, type: gmaForm.type, note: gmaForm.note, amount: Number(gmaForm.amount) }); setGmaForm({ ...gmaForm, amount: '', note: '' }); } }} className={btnCls}>＋ Add</button>
          <button onClick={() => addGma({ date: toLocalDateStr(), type: 'charge', amount: 1000, note: 'Monthly retainer' })} className={btnGhost}>+ $1k charge</button>
          <button onClick={accrueLateFee} className={btnGhost} disabled={gmaBalance <= 0}>+ late fee ({money(Math.round(gmaBalance * 0.015) + 75)})</button>
        </div>
      </div>

      {detail && <TxnPopover title={detail.title} txns={detail.txns} onClose={() => setDetail(null)} />}
    </div>
  );
}
