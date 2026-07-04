import { useEffect, useMemo, useState, useCallback } from 'react';
import { money } from '../utils/format';
import { effectiveClass, effectiveCategory } from '../utils/classify';
import { PROPERTIES, effectiveProperty } from '../data/properties';
import { toLocalMonthStr, monthsBetween } from '../utils/dateUtils';
import { rrSignIn, rrAuth, fetchRR, writeRRPayments, fetchRRReview, writeRRReview, autoMapProperties } from '../utils/rrSync';
import { useRangeTxns } from '../hooks/useRangeTxns';
import { useToast } from '../components/Toast';
import TxnPopover from '../components/TxnPopover';

// Rentals — rent received per property/month from BANK data (Plaid), reconciled and
// auto-synced into rainbow-rentals so rent never has to be hand-entered there again.

const RENTAL_PROPS = PROPERTIES.filter(p => p.schedule === 'rental');

export default function Rent({ data, accounts, updateConfig }) {
  const toast = useToast();
  const year = String(new Date().getFullYear());
  const curMonth = toLocalMonthStr();
  const months = useMemo(() => monthsBetween(`${year}-01`, curMonth), [year, curMonth]);

  // --- YTD rental-income deposits straight from Firestore (recentTxns caps at 500) ---
  const txns = useRangeTxns(`${year}-01-01`);

  const acctById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);
  const userRules = data?.userRules || [];
  const ignored = useMemo(() => new Set(data?.ignoredAccounts || []), [data?.ignoredAccounts]);

  // Rent deposits: inflows classed rental (rule/user/auto). needsReview kept but flagged.
  const deposits = useMemo(() => {
    if (!txns) return [];
    return txns.filter(t =>
      !ignored.has(t.accountId) &&
      (t.amount || 0) < 0 &&
      (t.category === 'rental' || effectiveClass(t, acctById, userRules) === 'rental'),
    ).map(t => ({
      ...t,
      propId: effectiveProperty(t) || 'unassigned',
      month: (t.date || '').slice(0, 7),
    }));
  }, [txns, ignored, acctById, userRules]);

  // property × month → [deposits]
  const grid = useMemo(() => {
    const g = {};
    for (const d of deposits) {
      (g[d.propId] = g[d.propId] || {})[d.month] = [...(g[d.propId]?.[d.month] || []), d];
    }
    return g;
  }, [deposits]);

  const unassigned = deposits.filter(d => d.propId === 'unassigned');

  // Cell drill-down: { title, txns, rrItems } → TxnPopover
  const [detail, setDetail] = useState(null);

  // --- rainbow-rentals connection ---
  const [rr, setRR] = useState(null);          // { properties, payments }
  const [rrBusy, setRRBusy] = useState(false);
  const [rrError, setRRError] = useState(null);
  const savedMap = data?.rrPropertyMap || null;
  const [propMap, setPropMap] = useState(savedMap || {});   // mm id → rr id

  const [rrReview, setRRReview] = useState([]);

  const connect = useCallback(async () => {
    setRRBusy(true); setRRError(null);
    try {
      await rrSignIn();
      const fetched = await fetchRR();
      setRR(fetched);
      setRRReview(await fetchRRReview());
      const map = savedMap && Object.keys(savedMap).length ? savedMap : autoMapProperties(fetched.properties);
      setPropMap(map);
      if (!savedMap) updateConfig({ rrPropertyMap: map });
    } catch (e) {
      console.error('RR connect failed:', e);
      setRRError(e?.code === 'auth/unauthorized-domain'
        ? 'This domain isn’t authorized in the rainbow-rentals Firebase project. Add www.mikesmoney.app (and mikes-money.vercel.app) under Authentication → Settings → Authorized domains in the rainbow-rentals console, then retry.'
        : (e?.message || 'Connection failed'));
    } finally {
      setRRBusy(false);
    }
  }, [savedMap, updateConfig]);

  // Reconnect silently if this browser already has an RR session.
  useEffect(() => {
    const unsub = rrAuth().onAuthStateChanged(u => { if (u && !rr) connect(); });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rrPropById = useMemo(
    () => Object.fromEntries((rr?.properties || []).map(p => [String(p.id), p])),
    [rr],
  );

  const setMapping = (mmId, rrId) => {
    const next = { ...propMap, [mmId]: rrId };
    setPropMap(next);
    updateConfig({ rrPropertyMap: next });
  };

  // Deposits present here but missing in rainbow-rentals (per mapped property + rent month).
  const toSync = useMemo(() => {
    if (!rr) return [];
    const out = [];
    for (const d of deposits) {
      if (d.propId === 'unassigned') continue;
      const rrId = propMap[d.propId];
      if (!rrId) continue;
      const already = rr.payments.some(p =>
        p.id === `mm-${d.id}` ||
        (String(p.propertyId) === String(rrId) && (p.month || (p.datePaid || '').slice(0, 7)) === d.month
          && (p.status === 'paid' || p.status === 'partial' || !p.status)),
      );
      if (!already) out.push(d);
    }
    return out;
  }, [rr, deposits, propMap]);

  // Rent months rainbow-rentals has that bank data doesn't show (manual/money-order rent etc.)
  const rrOnly = useMemo(() => {
    if (!rr) return [];
    const rrIdToMM = Object.fromEntries(Object.entries(propMap).map(([mm, rrId]) => [String(rrId), mm]));
    return rr.payments.filter(p => {
      if ((p.incomeType || 'rent') !== 'rent') return false;
      const m = p.month || (p.datePaid || '').slice(0, 7);
      if (!m.startsWith(year)) return false;
      const mmId = rrIdToMM[String(p.propertyId)];
      if (!mmId) return true;
      return !(grid[mmId]?.[m]?.length);
    });
  }, [rr, propMap, grid, year]);

  // RR-ledger payments folded into the matrix for months where bank data shows nothing —
  // covers pre-Plaid history (BoA starts 1/23/26, Fifth Third 3/16/26: Jan rents for all
  // units + Green Crest's Feb/Mar Avail payouts into 5/3 simply predate what Plaid can see)
  // and manual/money-order rent Liam logged directly in rainbow-rentals.
  const rrGrid = useMemo(() => {
    const rrIdToMM = Object.fromEntries(Object.entries(propMap).map(([mm, rrId]) => [String(rrId), mm]));
    const g = {};
    for (const p of rrOnly) {
      if (p.status && p.status !== 'paid' && p.status !== 'partial') continue;
      const mmId = rrIdToMM[String(p.propertyId)];
      if (!mmId) continue;
      const m = p.month || (p.datePaid || '').slice(0, 7);
      (g[mmId] = g[mmId] || {})[m] = [...(g[mmId]?.[m] || []), p];
    }
    return g;
  }, [rrOnly, propMap]);

  const [syncing, setSyncing] = useState(false);
  const runSync = async () => {
    if (!rr || toSync.length === 0) return;
    setSyncing(true);
    try {
      const newPayments = toSync.map(d => {
        const rrProp = rrPropById[String(propMap[d.propId])];
        return {
          id: `mm-${d.id}`,
          source: 'mikes-money',
          incomeType: 'rent',
          propertyId: String(propMap[d.propId]),
          propertyName: rrProp ? `${rrProp.emoji || '🏠'} ${rrProp.name}` : d.propId,
          tenantName: (rrProp?.tenants || []).map(t => t.name).filter(Boolean).join(', ') || rrProp?.tenant?.name || '',
          month: d.month,
          amount: Math.abs(d.amount || 0),
          datePaid: d.date,
          status: 'paid',
          notes: `Auto-synced from Mike's Money (${d.merchantName || d.name || 'bank deposit'})`,
          createdAt: new Date().toISOString(),
        };
      });
      const all = [...rr.payments, ...newPayments];
      await writeRRPayments(all);
      setRR({ ...rr, payments: all });
      // Auto-fill the Tax page's RR-reconcile rent figures from the now-synced ledger.
      const rrIdToMM = Object.fromEntries(Object.entries(propMap).map(([mm, rrId]) => [String(rrId), mm]));
      const rentYTD = {};
      for (const p of all) {
        if ((p.incomeType || 'rent') !== 'rent') continue;
        const m = p.month || (p.datePaid || '').slice(0, 7);
        if (!m.startsWith(year) || (p.status && p.status !== 'paid' && p.status !== 'partial')) continue;
        const mmId = rrIdToMM[String(p.propertyId)];
        if (mmId) rentYTD[mmId] = (rentYTD[mmId] || 0) + (p.amount || 0);
      }
      const rrRec = { ...(data?.rrReconcile || {}) };
      for (const [mmId, rent] of Object.entries(rentYTD)) rrRec[mmId] = { ...(rrRec[mmId] || {}), rent: Math.round(rent) };
      await updateConfig({ rrReconcile: rrRec });
      toast?.(`Synced ${newPayments.length} rent payment${newPayments.length === 1 ? '' : 's'} to Rainbow Rentals`, 'success');
    } catch (e) {
      console.error('sync failed:', e);
      toast?.(`Sync failed: ${e?.message || e}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const expectedFor = (mmId) => {
    const rrProp = rrPropById[String(propMap[mmId])];
    return rrProp ? parseFloat(rrProp.monthlyRent) || 0 : null;
  };

  // --- Fifth Third true-up ---------------------------------------------------------
  // Rents mostly arrive in personal BoA (Liam's Zelles) while some rental expenses
  // also draft from personal accounts — this computes the net rental cash sitting in
  // personal accounts that belongs in the 5/3 rental-ops account. Transfers INTO 5/3
  // (category 'transfer', 5/3-side inflow) count as already-settled; 5/3→personal
  // transfers count the other way.
  // Window starts Apr 1 2026 — the first full month after every account's Plaid history
  // begins (BoA 1/23, Fifth Third 3/16). Jan–Mar was settled by Mike's Jan 26 / Feb 17
  // Zelle transfers to 5/3 (visible on 5/3 statements, pre-Plaid). Bump this forward if
  // a big manual settle-up ever resets the clock.
  const TRUEUP_START = '2026-04-01';
  const trueUp = useMemo(() => {
    if (!txns) return null;
    const ftIds = new Set(accounts.filter(a => /fifth third|5\/3|53 bank/i.test(`${a.institution || ''} ${a.name || ''}`)).map(a => a.id));
    let persInc = 0, persExp = 0, toFT = 0, fromFT = 0;
    for (const t of txns) {
      if (ignored.has(t.accountId) || (t.date || '') < TRUEUP_START) continue;
      const amt = t.amount || 0;
      if (t.txClass === 'rental' && !ftIds.has(t.accountId)) {
        if (amt < 0) persInc += -amt; else persExp += amt;
      }
      if (t.category === 'transfer' && ftIds.has(t.accountId)) {
        if (amt < 0) toFT += -amt; else fromFT += amt;
      }
    }
    const owed = persInc - persExp - toFT + fromFT;
    return { persInc, persExp, toFT, fromFT, owed };
  }, [txns, accounts, ignored]);

  // --- Liam expense-review queue → rainbow-rentals Action Items -------------------
  // Candidates: (a) outflows carrying Liam's name (Cash App to Liam, ACH INDN:LIAM),
  // (b) anything Mike hand-tags as a rental expense on the Transactions page.
  // The •4793 card is Liam's AUTHORIZED-USER card on the Citi AAdvantage account
  // (Plaid mask ····3408). Plaid txns on 3408 carry NO cardholder field (verified
  // 2026-07-01), so his swipes can't be told apart from Mike's here — per-card
  // attribution comes from the Rupert CardInbox bridge (reads Citi directly) into
  // rainbow-rentals. This queue covers Liam-NAMED bank txns + Mike's manual tags.
  // 'liam dul' deliberately — plain /liam/ matches "WILLIAM DOuglas" HOA.
  const LIAM_RE = /liam dul|cash app\*liam|indn:\s*liam/i;
  // Fifth Third is the rental-ops account: recurring payees are auto-assigned by rules
  // (Rocket by loan #, both HOAs incl. 5/3's truncated "WILLIAM DO-"/"HOMEOWNERS-" stubs);
  // anything ELSE flowing out of it that no rule can place goes to Liam for review.
  const fifthThirdIds = useMemo(
    () => new Set(accounts.filter(a => /fifth third|5\/3|53 bank/i.test(`${a.institution || ''} ${a.name || ''}`)).map(a => a.id)),
    [accounts],
  );
  const reviewCandidates = useMemo(() => {
    if (!txns) return [];
    return txns.filter(t => {
      if ((t.amount || 0) <= 0 || ignored.has(t.accountId)) return false;
      const label = `${t.merchantName || ''} ${t.name || ''}`;
      if (LIAM_RE.test(label)) return true;
      if (t.txClass === 'rental' && t.classBy === 'user') return true;
      // 5/3 outflow that isn't a transfer and no rule could pin to a property → review
      if (fifthThirdIds.has(t.accountId)
          && effectiveCategory(t, acctById, userRules) !== 'transfer'
          && !effectiveProperty(t)) return true;
      return false;
    });
  }, [txns, ignored, fifthThirdIds, acctById, userRules]);

  const reviewById = useMemo(() => new Set(rrReview.map(i => i.id)), [rrReview]);
  const toSend = useMemo(
    () => reviewCandidates.filter(t => !reviewById.has(`mm-${t.id}`)),
    [reviewCandidates, reviewById],
  );
  const pendingCount = rrReview.filter(i => i.status === 'pending').length;

  const [sendingReview, setSendingReview] = useState(false);
  const sendReview = async () => {
    if (!rr || toSend.length === 0) return;
    setSendingReview(true);
    try {
      const newItems = toSend.map(t => ({
        id: `mm-${t.id}`,
        date: t.date,
        amount: Math.abs(t.amount || 0),
        description: (t.merchantName || t.name || 'Transaction').slice(0, 90),
        detail: (t.name || '').slice(0, 120),
        suggestedPropertyId: t.propertyId && propMap[t.propertyId] ? String(propMap[t.propertyId]) : null,
        reason: LIAM_RE.test(`${t.merchantName || ''} ${t.name || ''}`) ? 'liam'
          : (t.txClass === 'rental' && t.classBy === 'user') ? 'tagged-rental'
          : 'fifth-third',
        status: 'pending',
        addedAt: new Date().toISOString(),
      }));
      const all = [...rrReview, ...newItems];
      await writeRRReview(all);
      setRRReview(all);
      toast?.(`Sent ${newItems.length} expense${newItems.length === 1 ? '' : 's'} to Liam's review queue`, 'success');
    } catch (e) {
      console.error('review send failed:', e);
      toast?.(`Send failed: ${e?.message || e}`, 'error');
    } finally {
      setSendingReview(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Rentals</h1>
          <p className="text-slate-400 text-sm">Rent received from bank data · {year} · synced to Rainbow Rentals</p>
        </div>
        {!rr ? (
          <button onClick={connect} disabled={rrBusy}
            className="text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg">
            {rrBusy ? 'Connecting…' : '🌈 Connect Rainbow Rentals'}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-emerald-400">🌈 Connected · {rr.payments.length} payments on file</span>
            {toSync.length > 0 && (
              <button onClick={runSync} disabled={syncing}
                className="text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg">
                {syncing ? 'Syncing…' : `Sync ${toSync.length} payment${toSync.length === 1 ? '' : 's'} →`}
              </button>
            )}
            {toSync.length === 0 && <span className="text-xs text-slate-500">✓ ledgers match</span>}
          </div>
        )}
      </header>

      {rrError && (
        <section className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-4 text-sm text-rose-200">
          {rrError}
        </section>
      )}

      {/* Received matrix */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Rent received by month (bank deposits)</h2>
        {txns === null ? (
          <p className="text-slate-500 text-sm animate-pulse">Loading transactions…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1.5 pr-2 sticky left-0 bg-slate-800">Property</th>
                  {months.map(m => (
                    <th key={m} className="text-right px-1.5 whitespace-nowrap">{m.slice(5)}</th>
                  ))}
                  <th className="text-right pl-2 font-semibold">YTD</th>
                </tr>
              </thead>
              <tbody>
                {RENTAL_PROPS.map(p => {
                  const row = grid[p.id] || {};
                  const rrRow = rrGrid[p.id] || {};
                  const bankYtd = Object.values(row).flat().reduce((s, d) => s + Math.abs(d.amount || 0), 0);
                  const rrYtd = Object.values(rrRow).flat().reduce((s, d) => s + (d.amount || 0), 0);
                  const expected = expectedFor(p.id);
                  return (
                    <tr key={p.id} className="border-t border-slate-700/60">
                      <td className="py-2 pr-2 whitespace-nowrap sticky left-0 bg-slate-800">
                        {p.nickname}
                        {expected != null && <span className="block text-[10px] text-slate-500">{money(expected)}/mo</span>}
                      </td>
                      {months.map(m => {
                        const cell = row[m] || [];
                        const rrCell = rrRow[m] || [];
                        const amt = cell.reduce((s, d) => s + Math.abs(d.amount || 0), 0);
                        const rrAmt = rrCell.reduce((s, d) => s + (d.amount || 0), 0);
                        const review = cell.some(d => d.needsReview);
                        const short = expected != null && amt > 0 && amt < expected - 5;
                        const openDetail = () => setDetail({
                          title: `${p.nickname} — ${m}`,
                          txns: cell,
                          rrItems: rrCell,
                        });
                        return (
                          <td key={m} className="text-right px-1.5 mono-nums">
                            {amt > 0 ? (
                              <button onClick={openDetail}
                                title={cell.map(d => `${d.date} · ${d.merchantName || d.name} · ${money(Math.abs(d.amount || 0), { cents: true })}`).join('\n') + '\n(click for detail)'}
                                className={(short ? 'text-amber-300' : 'text-emerald-300') + ' hover:underline decoration-dotted underline-offset-2 cursor-pointer'}>
                                {money(amt)}{review && ' ⚠'}
                              </button>
                            ) : rrAmt > 0 ? (
                              <button onClick={openDetail}
                                title={rrCell.map(d => `${d.datePaid || d.month} · ${d.tenantName || 'rent'} · ${money(d.amount || 0)} (Rainbow Rentals ledger)`).join('\n') + '\n(click for detail)'}
                                className="text-sky-300/90 hover:underline decoration-dotted underline-offset-2 cursor-pointer">
                                {money(rrAmt)}<span className="text-[9px] align-super">RR</span>
                              </button>
                            ) : (
                              <span className={m === curMonth ? 'text-slate-600' : 'text-rose-400/70'}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-right pl-2 mono-nums font-semibold text-emerald-300"
                          title={rrYtd > 0 ? `${money(bankYtd)} bank deposits + ${money(rrYtd)} RR-ledger months` : undefined}>
                        {money(bankYtd + rrYtd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500 mt-2">
              ⚠ = auto-detected, needs review on the Transactions page. <span className="text-sky-300/90">Blue·RR</span> = no bank
              deposit visible (Plaid history starts BoA 1/23, 5/3 3/16 — Jan rents and Green Crest Feb/Mar predate it), amount
              from the Rainbow Rentals ledger instead. Red — = missing in both. Hover for details, click to drill in.
            </p>
          </div>
        )}
      </section>

      {/* Unassigned rental deposits */}
      {unassigned.length > 0 && (
        <section className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-amber-200 mb-2">⚠ {unassigned.length} rental deposit{unassigned.length === 1 ? '' : 's'} with no property</h2>
          <ul className="text-xs text-slate-300 space-y-1">
            {unassigned.slice(0, 8).map(d => (
              <li key={d.id} className="flex justify-between">
                <span className="truncate pr-3">{d.date} · {d.merchantName || d.name}</span>
                <span className="mono-nums text-emerald-300">{money(Math.abs(d.amount))}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500 mt-2">Tag these on the Transactions page (property dropdown) — they'll sync on the next pass.</p>
        </section>
      )}

      {/* Fifth Third true-up */}
      {trueUp && (
        <section className={`border rounded-xl p-4 ${Math.abs(trueUp.owed) > 500 ? 'bg-amber-950/30 border-amber-900/50' : 'bg-slate-800 border-slate-700'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-300">💸 Fifth Third true-up (since Apr 1)</h2>
            <div className={`text-lg font-bold mono-nums ${trueUp.owed > 500 ? 'text-amber-300' : trueUp.owed < -500 ? 'text-sky-300' : 'text-emerald-400'}`}>
              {trueUp.owed > 500 ? `Send ${money(Math.round(trueUp.owed))} → 5/3`
                : trueUp.owed < -500 ? `5/3 is owed-from: withdraw ${money(Math.round(-trueUp.owed))}`
                : '✓ settled (within $500)'}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs text-slate-400">
            <div>Rent received in personal accts<div className="mono-nums text-emerald-300 text-sm">{money(Math.round(trueUp.persInc))}</div></div>
            <div>Rental expenses paid personally<div className="mono-nums text-rose-300 text-sm">−{money(Math.round(trueUp.persExp))}</div></div>
            <div>Already transferred → 5/3<div className="mono-nums text-slate-300 text-sm">−{money(Math.round(trueUp.toFT))}</div></div>
            <div>Transferred 5/3 → personal<div className="mono-nums text-slate-300 text-sm">+{money(Math.round(trueUp.fromFT))}</div></div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Net rental cash sitting in personal accounts that belongs in the Fifth Third rental account. Updates automatically
            as rents/expenses/transfers post. Long-term fix: move recurring rental drafts (Hillcrest + Prairie mortgages,
            Magnolia HOA) to draft from 5/3, and have Liam Zelle rents to the 5/3 account.
          </p>
        </section>
      )}

      {/* Liam expense-review queue */}
      {rr && (
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-slate-300">👷 Liam's expense review queue</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {pendingCount} pending with Liam · {rrReview.filter(i => i.status === 'approved').length} approved · {rrReview.filter(i => i.status === 'dismissed').length} dismissed
              </span>
              {toSend.length > 0 && (
                <button onClick={sendReview} disabled={sendingReview}
                  className="text-xs bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
                  {sendingReview ? 'Sending…' : `Send ${toSend.length} new →`}
                </button>
              )}
            </div>
          </div>
          {toSend.length > 0 && (
            <ul className="text-xs text-slate-400 space-y-1 mb-2">
              {toSend.slice(0, 8).map(t => (
                <li key={t.id} className="flex justify-between">
                  <span className="truncate pr-3">{t.date} · {(t.merchantName || t.name || '').slice(0, 60)}</span>
                  <span className="mono-nums">{money(t.amount)}</span>
                </li>
              ))}
              {toSend.length > 8 && <li className="text-slate-600">…and {toSend.length - 8} more</li>}
            </ul>
          )}
          <p className="text-[11px] text-slate-500">
            Auto-detects outflows with Liam's name (Cash App, ACH), unrecognized outflows from the Fifth Third rental-ops
            account, + anything you tag as class "Rental" on the Transactions page. Recurring 5/3 payees (mortgages, both
            HOAs) are auto-assigned and skip the queue.
            Liam approves/dismisses them on rainbow-rentals → Action Items; approved items become expense records there.
            Note: •4793 is Liam's authorized-user card on the Citi AAdvantage account (····3408). Plaid can't tell his swipes
            from yours on that account, so those go to rainbow-rentals via the CardInbox (Rupert reads Citi directly) — this
            queue covers everything else. Charges on ····3408 you tag as "Rental" also land here.
          </p>
        </section>
      )}

      {/* RR-only payments + mapping */}
      {rr && (
        <>
          {rrOnly.length > 0 && (
            <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-2">In Rainbow Rentals but not in bank data ({rrOnly.length})</h2>
              <ul className="text-xs text-slate-400 space-y-1">
                {rrOnly.slice(0, 10).map(p => (
                  <li key={p.id} className="flex justify-between">
                    <span className="truncate pr-3">{p.month || p.datePaid} · {p.propertyName || '—'} {p.source === 'mikes-money' ? '' : '· manual entry'}</span>
                    <span className="mono-nums">{money(p.amount || 0)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-500 mt-2">Usually money-order / cash rent Liam logged directly, or a deposit posted to an account Plaid doesn't cover. Fine to leave.</p>
            </section>
          )}

          <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-2">Property mapping</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
              {RENTAL_PROPS.map(p => (
                <label key={p.id} className="flex items-center gap-2">
                  <span className="w-24 text-slate-400 shrink-0">{p.nickname}</span>
                  <select value={propMap[p.id] || ''} onChange={e => setMapping(p.id, e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1">
                    <option value="">— not mapped —</option>
                    {(rr.properties || []).map(rp => (
                      <option key={rp.id} value={String(rp.id)}>{rp.emoji || '🏠'} {rp.name}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>
        </>
      )}

      {detail && <TxnPopover title={detail.title} txns={detail.txns} rrItems={detail.rrItems} onClose={() => setDetail(null)} />}
    </main>
  );
}
