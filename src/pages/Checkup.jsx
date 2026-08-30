import { useMemo } from 'react';
import { money, pct } from '../utils/format';
import { classifyHolding, ASSET_CLASSES } from '../utils/assetClass';
import { computeSectorTotals } from '../utils/sectorMap';
import { estimatedMonthlySpend } from '../utils/insights';
import { allocateHoldings } from '../utils/assetClass';

// Expense ratios for common tickers (annual %). Source: fund prospectuses.
// Extend this list as needed — missing tickers show as "unknown".
const EXPENSE_RATIOS = {
  // Vanguard
  VTI: 0.0003, VOO: 0.0003, VTSAX: 0.0004, VFIAX: 0.0004,
  VXUS: 0.0007, VTIAX: 0.0011, VEA: 0.0005, VWO: 0.0008,
  BND: 0.0003, VBTLX: 0.0004, BNDX: 0.0007, VMFXX: 0.0011,
  VNQ: 0.0013, VGSLX: 0.0013,
  VTIP: 0.0004, VUG: 0.0004, VTV: 0.0004, VB: 0.0005,
  // iShares / BlackRock
  IVV: 0.0003, ITOT: 0.0003, IEFA: 0.0007, IEMG: 0.0009,
  AGG: 0.0003, IEF: 0.0015, SHY: 0.0015, TLT: 0.0015,
  IJR: 0.0006, IJH: 0.0005, IWM: 0.0019, IWF: 0.0019, IWD: 0.0019,
  IAU: 0.0025, GLD: 0.004, DIA: 0.0016,
  IBIT: 0.0025,
  // Fidelity
  FSKAX: 0.0002, FXAIX: 0.00015, FTIHX: 0.0006, FXNAX: 0.0003,
  SPAXX: 0.0042, FDRXX: 0.0038, FZFXX: 0.0042, SPRXX: 0.0041,
  // Schwab
  SCHB: 0.0003, SCHX: 0.0003, SCHF: 0.0006, SCHZ: 0.0003, SCHH: 0.0007,
  SWTSX: 0.00015,
  // SPDR
  SPY: 0.0009,
  // ARK / thematic (high-fee examples)
  QQQ: 0.002,
};

const INDEX_FUND_TICKERS = new Set(Object.keys(EXPENSE_RATIOS)); // broad passive funds exempt from single-stock concentration

export default function Checkup({ holdings, accounts, data, investmentsTotal, recentTxns, netWorth, catOf, updateConfig }) {
  // --- Monthly expense baseline from last 3 months (shared live-classified estimate) ---
  const monthlySpend = useMemo(
    () => estimatedMonthlySpend(recentTxns, catOf),
    [recentTxns, catOf],
  );

  const cashTotal = useMemo(
    () => accounts.filter(a => a.type === 'depository').reduce((s, a) => s + (a.balance || 0), 0),
    [accounts],
  );

  const emergencyMonths = data?.preferences?.emergencyMonths || 6;

  // --- Idle cash check ---
  const idleCash = useMemo(() => {
    if (!monthlySpend) return null;
    const target = monthlySpend * emergencyMonths;
    const excess = cashTotal - target;
    return { target, excess, monthlySpend };
  }, [monthlySpend, cashTotal, emergencyMonths]);

  // --- Single-security concentration (excluding broad index funds) ---
  const concentrations = useMemo(() => {
    if (!investmentsTotal) return [];
    return holdings
      .filter(h => {
        const t = (h.ticker || '').toUpperCase();
        if (INDEX_FUND_TICKERS.has(t)) return false;
        return (h.institutionValue || 0) / investmentsTotal > 0.05;
      })
      .sort((a, b) => (b.institutionValue || 0) - (a.institutionValue || 0))
      .map(h => ({
        ticker: h.ticker || h.name || '—',
        name: h.name,
        value: h.institutionValue,
        pct: h.institutionValue / investmentsTotal,
      }));
  }, [holdings, investmentsTotal]);

  // --- Fee analysis ---
  const feeOverrides = data?.feeOverrides || {};   // { TICKER: expense ratio } user-entered
  const feeAnalysis = useMemo(() => {
    let weighted = 0, total = 0, unknown = 0;
    const breakdown = [];
    const unknownList = [];
    for (const h of holdings) {
      const t = (h.ticker || '').toUpperCase();
      const er = feeOverrides[t] ?? EXPENSE_RATIOS[t];
      const value = h.institutionValue || 0;
      if (!value) continue;
      total += value;
      if (er == null) { unknown += value; if (t) unknownList.push({ ticker: t, name: h.name, value }); }
      else {
        weighted += er * value;
        breakdown.push({ ticker: t, name: h.name, value, er, annualCost: er * value });
      }
    }
    return {
      weightedAvg: total > 0 ? weighted / (total - unknown) : 0,
      annualCost: weighted,
      unknown,
      unknownPct: total > 0 ? unknown / total : 0,
      breakdown: breakdown.sort((a, b) => b.annualCost - a.annualCost),
      unknownList: unknownList.sort((a, b) => b.value - a.value).slice(0, 8),
    };
  }, [holdings, feeOverrides]);

  const setFeeOverride = (ticker, er) => {
    const next = { ...feeOverrides };
    if (er == null || Number.isNaN(er)) delete next[ticker];
    else next[ticker] = er;
    updateConfig?.({ feeOverrides: next });
  };

  // --- Target allocation vs actual (Empower-Checkup style, tax-aware hint) ---
  const alloc = useMemo(() => allocateHoldings(holdings || []), [holdings]);
  const targetMix = data?.preferences?.targetMix || {};
  const hasTargets = Object.values(targetMix).some(v => v > 0);
  const saveTarget = (id, v) => updateConfig?.({
    preferences: { ...(data?.preferences || {}), targetMix: { ...targetMix, [id]: v } },
  });
  const driftRows = useMemo(() => alloc.map(a => {
    const target = (targetMix[a.id] || 0) / 100;
    return { ...a, target, drift: a.pct - target, driftDollars: (a.pct - target) * (investmentsTotal || 0) };
  }), [alloc, targetMix, investmentsTotal]);
  const maxDrift = hasTargets ? Math.max(...driftRows.map(r => Math.abs(r.drift))) : 0;

  // --- Fund overlap: multiple holdings in same class with same ticker prefix family ---
  const overlaps = useMemo(() => {
    const byClass = {};
    for (const h of holdings) {
      const cls = classifyHolding(h);
      if (!byClass[cls]) byClass[cls] = [];
      byClass[cls].push(h);
    }
    return Object.entries(byClass)
      .filter(([_cls, items]) => {
        // overlap if 2+ distinct tickers in same broad class with >$1000 each
        const bigOnes = items.filter(h => (h.institutionValue || 0) > 1000);
        const uniqTickers = new Set(bigOnes.map(h => h.ticker).filter(Boolean));
        return uniqTickers.size >= 2 && (_cls === 'us_stock' || _cls === 'us_bond' || _cls === 'intl_stock');
      })
      .map(([cls, items]) => ({
        cls: ASSET_CLASSES.find(c => c.id === cls)?.label || cls,
        items: items.filter(h => (h.institutionValue || 0) > 1000)
          .sort((a, b) => (b.institutionValue || 0) - (a.institutionValue || 0)),
      }));
  }, [holdings]);

  // --- Sector concentration (stock side only) ---
  const sectorAnalysis = useMemo(() => {
    const { totals, totalStock, diversifiedStock } = computeSectorTotals(holdings, classifyHolding);
    if (!totalStock) return null;
    const rows = Object.entries(totals)
      .map(([sector, value]) => ({ sector, value, pct: value / totalStock }))
      .sort((a, b) => b.value - a.value);
    const hot = rows.filter(r => r.pct > 0.30);
    return { rows, hot, totalStock, diversifiedStock, diversifiedPct: diversifiedStock / totalStock };
  }, [holdings]);

  // --- Summary score ---
  const checks = [
    idleCash && { ok: idleCash.excess <= Math.max(10000, monthlySpend), label: 'Emergency cash buffer' },
    { ok: concentrations.length === 0, label: 'Single-stock concentration' },
    sectorAnalysis && { ok: sectorAnalysis.hot.length === 0, label: 'Sector concentration' },
    { ok: feeAnalysis.weightedAvg < 0.005, label: 'Expense ratios under 0.5%' },
    hasTargets && { ok: maxDrift <= 0.05, label: 'Allocation within 5% of target' },
    { ok: overlaps.length <= 1, label: 'Fund overlap minimal' },
  ].filter(Boolean);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Investment Checkup</h1>
        <p className="text-slate-400 text-sm">
          {checks.filter(c => c.ok).length} of {checks.length} checks passing
        </p>
      </header>

      {/* Idle cash */}
      <Card title="Cash buffer" good={idleCash && idleCash.excess <= Math.max(10000, monthlySpend || 0)}>
        {!monthlySpend ? (
          <p className="text-sm text-slate-400">Not enough transaction history yet to estimate monthly spending.</p>
        ) : (
          <>
            <p className="text-sm text-slate-300">
              {money(cashTotal)} in cash · {money(monthlySpend)}/mo estimated spend ·
              target buffer {money(idleCash.target)} ({emergencyMonths} months)
            </p>
            {idleCash.excess > Math.max(10000, monthlySpend) && (
              <p className="text-sm text-amber-300 mt-2">
                ~{money(idleCash.excess)} sitting in cash above your emergency buffer. In a HYSA/treasury
                at 4-5%, that's {money(idleCash.excess * 0.045)}/year of foregone interest versus investing.
              </p>
            )}
            {idleCash.excess < 0 && (
              <p className="text-sm text-rose-300 mt-2">
                Cash is below your {emergencyMonths}-month target by {money(-idleCash.excess)}.
              </p>
            )}
          </>
        )}
      </Card>

      {/* Concentration */}
      <Card title="Single-security concentration (>5%, excluding broad index funds)" good={concentrations.length === 0}>
        {concentrations.length === 0 ? (
          <p className="text-sm text-slate-400">
            No individual security exceeds 5% of your investment portfolio. Diversification looks healthy.
          </p>
        ) : (
          <ul className="divide-y divide-slate-700/40 text-sm">
            {concentrations.map(c => (
              <li key={c.ticker} className="py-2 flex items-center">
                <span className="font-mono text-emerald-300 w-20">{c.ticker}</span>
                <span className="flex-1 truncate text-slate-300">{c.name}</span>
                <span className="mono-nums w-28 text-right">{money(c.value)}</span>
                <span className="mono-nums text-amber-300 w-16 text-right">{pct(c.pct)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Sector concentration */}
      {sectorAnalysis && (
        <Card title="Sector concentration (stock side)" good={sectorAnalysis.hot.length === 0}>
          {sectorAnalysis.hot.length === 0 ? (
            <p className="text-sm text-slate-400">
              No single sector exceeds 30% of your stock allocation. Reasonably diversified.
            </p>
          ) : (
            <>
              <p className="text-sm text-amber-300">
                {sectorAnalysis.hot.map(h => `${h.sector} ${pct(h.pct, 0)}`).join(', ')} — heavily concentrated.
                Often driven by a single sector ETF (e.g. VITAX for Tech). Diversify or offset with other sectors.
              </p>
              <ul className="mt-3 divide-y divide-slate-700/40 text-sm">
                {sectorAnalysis.rows.map(r => (
                  <li key={r.sector} className="py-1.5 flex items-center">
                    <span className="flex-1 text-slate-300">{r.sector}</span>
                    <span className="mono-nums text-slate-400 w-20 text-right">{money(r.value)}</span>
                    <span className={`mono-nums w-16 text-right ${r.pct > 0.30 ? 'text-amber-300' : 'text-slate-400'}`}>
                      {pct(r.pct, 0)}
                    </span>
                  </li>
                ))}
                {sectorAnalysis.diversifiedStock > 0 && (
                  <li className="py-1.5 flex items-center text-slate-500 italic">
                    <span className="flex-1">Diversified / broad funds (no sector tag)</span>
                    <span className="mono-nums w-20 text-right">{money(sectorAnalysis.diversifiedStock)}</span>
                    <span className="mono-nums w-16 text-right">{pct(sectorAnalysis.diversifiedPct, 0)}</span>
                  </li>
                )}
              </ul>
            </>
          )}
          <p className="text-xs text-slate-500 mt-2">
            Percentages are of total stock-side holdings. Broad index funds (VTI, VOO, etc.) are shown as
            "Diversified" since they span all sectors. Sector-specific funds are the ones that add concentration.
          </p>
        </Card>
      )}

      {/* Fees */}
      <Card title="Fund expense ratios" good={feeAnalysis.weightedAvg < 0.005}>
        <p className="text-sm text-slate-300">
          Weighted average expense ratio: <span className="font-mono">{pct(feeAnalysis.weightedAvg, 2)}</span> ·
          annual cost: <span className="font-mono">{money(feeAnalysis.annualCost)}</span>
          {feeAnalysis.unknownPct > 0 && (
            <> · <span className="text-slate-500">{pct(feeAnalysis.unknownPct)} of portfolio has no fee data</span></>
          )}
        </p>
        {feeAnalysis.breakdown.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-200">
              Show breakdown
            </summary>
            <ul className="divide-y divide-slate-700/40 text-sm mt-2">
              {feeAnalysis.breakdown.slice(0, 15).map(b => (
                <li key={b.ticker} className="py-1.5 flex items-center">
                  <span className="font-mono text-emerald-300 w-20">{b.ticker}</span>
                  <span className="flex-1 truncate text-slate-400 text-xs">{b.name}</span>
                  <span className="mono-nums text-slate-500 w-16 text-right text-xs">{pct(b.er, 2)}</span>
                  <span className="mono-nums w-20 text-right">{money(b.annualCost)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-sm mt-2 text-slate-300">
          At today's balances that's <span className="font-mono text-amber-300">{money(feeAnalysis.annualCost * 10)}</span> over
          the next decade — the Empower-style number worth staring at once.
        </p>
        {feeAnalysis.unknownList?.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-200">
              Add missing expense ratios ({feeAnalysis.unknownList.length})
            </summary>
            <ul className="divide-y divide-slate-700/40 text-sm mt-2">
              {feeAnalysis.unknownList.map(u => (
                <li key={u.ticker} className="py-1.5 flex items-center gap-2">
                  <span className="font-mono text-emerald-300 w-20">{u.ticker}</span>
                  <span className="flex-1 truncate text-slate-400 text-xs">{u.name}</span>
                  <span className="mono-nums text-slate-500 w-24 text-right text-xs">{money(u.value)}</span>
                  <label className="text-xs text-slate-500">ER %
                    <input
                      type="number" step="0.01" min="0" max="3" placeholder="0.05"
                      defaultValue={feeOverrides[u.ticker] != null ? (feeOverrides[u.ticker] * 100) : ''}
                      onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value) / 100; setFeeOverride(u.ticker, v); }}
                      className="w-16 ml-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right mono-nums"
                    />
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-1">From the fund's page ("expense ratio"); saves per ticker.</p>
          </details>
        )}
        <p className="text-xs text-slate-500 mt-2">
          Broad index funds run 0.03-0.10%. Actively managed funds often 0.5-1.5%. Shifting high-fee
          funds to equivalent index funds can save thousands/year on a decent portfolio.
        </p>
      </Card>

      {/* Target allocation vs actual */}
      <Card title="Target mix vs actual" good={!hasTargets || maxDrift <= 0.05}>
        {!hasTargets && (
          <p className="text-sm text-slate-400 mb-2">
            Set a target % per asset class to see drift. (They don't need to total 100 — untargeted classes are ignored.)
          </p>
        )}
        <ul className="divide-y divide-slate-700/40 text-sm">
          {driftRows.map(r => (
            <li key={r.id} className="py-1.5 grid grid-cols-12 items-center gap-2">
              <span className="col-span-4 text-slate-300 truncate">{r.label}</span>
              <span className="col-span-2 mono-nums text-right text-slate-400">{pct(r.pct, 0)}</span>
              <label className="col-span-3 text-right text-xs text-slate-500">target
                <input
                  type="number" min="0" max="100" step="1"
                  value={targetMix[r.id] ?? ''}
                  placeholder="—"
                  onChange={(e) => saveTarget(r.id, e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-14 ml-1 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right mono-nums"
                />%
              </label>
              <span className={`col-span-3 mono-nums text-right ${!hasTargets || !r.target ? 'text-slate-600' : Math.abs(r.drift) <= 0.05 ? 'text-emerald-400' : 'text-amber-300'}`}>
                {r.target ? `${r.drift >= 0 ? '+' : ''}${(r.drift * 100).toFixed(0)}% (${money(Math.round(r.driftDollars))})` : '—'}
              </span>
            </li>
          ))}
        </ul>
        {hasTargets && maxDrift > 0.05 && (
          <p className="text-xs text-slate-500 mt-2">
            Rebalance inside the IRA/SEP first — trades there have no tax consequence; selling in taxable realizes gains.
          </p>
        )}
      </Card>

      {/* Overlap */}
      <Card title="Fund overlap" good={overlaps.length <= 1}>
        {overlaps.length === 0 ? (
          <p className="text-sm text-slate-400">
            No significant overlap between major asset classes.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              You're holding multiple funds in the same broad class. Not necessarily wrong (tax loss harvesting,
              different accounts) but worth knowing.
            </p>
            {overlaps.map(o => (
              <div key={o.cls}>
                <div className="text-xs text-slate-400 mb-1">{o.cls}</div>
                <ul className="divide-y divide-slate-700/40 text-sm">
                  {o.items.map(h => (
                    <li key={h.id} className="py-1.5 flex items-center">
                      <span className="font-mono text-emerald-300 w-20">{h.ticker}</span>
                      <span className="flex-1 truncate text-slate-400 text-xs">{h.name}</span>
                      <span className="mono-nums w-24 text-right">{money(h.institutionValue)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}

function Card({ title, children, good }) {
  const border = good ? 'border-emerald-900/40' : 'border-amber-900/50';
  const accent = good ? 'text-emerald-400' : 'text-amber-300';
  const icon = good ? '✓' : '!';
  return (
    <section className={`bg-slate-800 border ${border} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-lg ${accent}`}>{icon}</span>
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      {children}
    </section>
  );
}
