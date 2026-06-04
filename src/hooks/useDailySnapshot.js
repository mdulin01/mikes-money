import { useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase-config';
import { COLLECTIONS } from '../constants';
import { toLocalDateStr, offsetDateStr } from '../utils/dateUtils';
import { allocateHoldings, classifyHolding } from '../utils/assetClass';
import { computeSectorTotals } from '../utils/sectorMap';

/**
 * Writes a daily snapshot of all computed dashboard values to Firestore at
 * `dashboardSnapshots/{YYYY-MM-DD}`. Idempotent — checks if today's doc already
 * exists and skips if so. Also session-guarded with a ref so we don't re-attempt
 * mid-session if React re-renders.
 *
 * Read by Rupert (chief-of-staff agent) for monthly/quarterly reviews.
 */
export function useDailySnapshot({
  data,
  accounts,
  netWorth,
  assets,
  liabilities,
  savingsRate,
  monthIncome,
  currentMonthSpend,
  retirementSuccess,
  withdrawalRate,
  cashRunwayMonths,
  avgMonthlySpend,
  byType,
  investmentsTotal,
  holdings,
  insights,
  netWorthHistory,
}) {
  const attempted = useRef(false);

  useEffect(() => {
    // Wait until data is loaded
    if (!data || !accounts || accounts.length === 0) return;
    // Only attempt once per session
    if (attempted.current) return;
    attempted.current = true;

    const dateStr = toLocalDateStr();
    const ref = doc(db, COLLECTIONS.DASHBOARD_SNAPSHOTS, dateStr);

    (async () => {
      try {
        const existing = await getDoc(ref);
        if (existing.exists()) return; // already written today

        // Net worth history-based deltas
        const sorted = [...(netWorthHistory || [])]
          .filter(h => h.date && typeof h.netWorth === 'number')
          .sort((a, b) => a.date.localeCompare(b.date));

        const closestOnOrBefore = (targetStr) => {
          const candidates = sorted.filter(h => h.date <= targetStr);
          return candidates.length ? candidates[candidates.length - 1].netWorth : null;
        };

        const nw30 = closestOnOrBefore(offsetDateStr(dateStr, -30));
        const nw90 = closestOnOrBefore(offsetDateStr(dateStr, -90));
        const yearStart = `${new Date().getFullYear()}-01-01`;
        const ytdRecord = sorted.find(h => h.date >= yearStart);
        const nwYtd = ytdRecord?.netWorth ?? null;

        // Top holdings (>5% of investments)
        const topHoldings = (holdings || [])
          .filter(h => h.institutionValue && investmentsTotal && h.institutionValue / investmentsTotal > 0.05)
          .map(h => ({
            ticker: h.ticker || null,
            name: h.name || h.ticker || 'Unknown',
            value: h.institutionValue,
            pctOfInvestments: h.institutionValue / investmentsTotal,
          }))
          .sort((a, b) => b.value - a.value);

        // Stale accounts (no update in >7 days)
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const staleAccounts = accounts
          .filter(a => {
            const ts = a.updatedAt?.toMillis?.() ?? (a.updatedAt ? new Date(a.updatedAt).getTime() : null);
            return ts != null && ts < sevenDaysAgo;
          })
          .map(a => ({
            id: a.id,
            name: a.name || null,
            institution: a.institution || null,
            mask: a.mask || null,
            type: a.type || null,
          }));

        // Asset-class allocation snapshot (for over-time tracking + quarterly rebalance)
        const allocation = allocateHoldings(holdings || []).map(a => ({
          id: a.id, value: Math.round(a.value), pct: a.pct,
        }));

        // Stock-side sector mix snapshot
        const { totals: secTotals, totalStock, diversifiedStock } = computeSectorTotals(holdings || [], classifyHolding);
        const sectors = {
          totalStock: Math.round(totalStock || 0),
          diversifiedStock: Math.round(diversifiedStock || 0),
          byS: Object.fromEntries(Object.entries(secTotals).map(([k, v]) => [k, Math.round(v)])),
        };

        const payload = {
          date: dateStr,
          asOf: serverTimestamp(),

          // Headline numbers
          netWorth: netWorth ?? null,
          assets: assets ?? null,
          liabilities: liabilities ?? null,
          savingsRate: savingsRate ?? null,
          monthIncome: monthIncome ?? null,
          currentMonthSpend: currentMonthSpend ?? null,

          // Retirement readiness
          retirementSuccess: retirementSuccess ?? null,
          withdrawalRate: withdrawalRate ?? null,
          cashRunwayMonths: cashRunwayMonths ?? null,
          avgMonthlySpend: avgMonthlySpend ?? null,

          // Asset/liability breakdown
          byType: (byType || []).map(g => ({
            id: g.id,
            label: g.label,
            side: g.side,
            total: g.total,
            count: g.items?.length ?? 0,
          })),

          // Investment concentration
          investmentsTotal: investmentsTotal ?? null,
          topHoldings,

          // Allocation + sectors over time
          allocation,
          sectors,

          // Insights (the "This month" cards)
          insights: (insights || []).map(i => ({
            severity: i.severity,
            title: i.title,
            body: i.body || null,
            action: i.action || null,
          })),

          // Account inventory
          accountCount: accounts.length,
          staleAccounts,

          // Net worth deltas
          delta30d: nw30 != null ? netWorth - nw30 : null,
          delta90d: nw90 != null ? netWorth - nw90 : null,
          deltaYtd: nwYtd != null ? netWorth - nwYtd : null,

          // Provenance
          generatedBy: 'dashboard-render-v1',
        };

        await setDoc(ref, payload);
        console.log(`[snapshot] wrote dashboardSnapshots/${dateStr}`);
      } catch (err) {
        console.error('[snapshot] write failed:', err);
        // Don't crash the render
      }
    })();
  }, [
    data,
    accounts,
    netWorth,
    assets,
    liabilities,
    savingsRate,
    monthIncome,
    currentMonthSpend,
    retirementSuccess,
    withdrawalRate,
    cashRunwayMonths,
    avgMonthlySpend,
    byType,
    investmentsTotal,
    holdings,
    insights,
    netWorthHistory,
  ]);
}
