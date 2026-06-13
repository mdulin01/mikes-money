/**
 * Mike's Money — Cloud Functions v2 for Plaid
 *
 * Secrets (set via: firebase functions:secrets:set PLAID_CLIENT_ID):
 *   - PLAID_CLIENT_ID
 *   - PLAID_SECRET
 *   - PLAID_ENV  ("sandbox" | "development" | "production")
 *
 * Callable functions:
 *   - createLinkToken()         — returns a Plaid Link token
 *   - exchangePublicToken()     — stores access_token in Firestore (`plaidItems/{itemId}`)
 *   - syncItem({ itemId })      — on-demand /transactions/sync pull
 *
 * Scheduled: dailyTransactionSync runs every morning at 6am ET.
 *
 * All functions require the caller email == mdulin@gmail.com.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

// Lazy-init Firebase Admin so module load stays fast (Firebase deploy
// analyzer times out after 10s on any blocking top-level work).
let _app, _db;
function db() {
  if (!_app) _app = initializeApp();
  if (!_db) _db = getFirestore();
  return _db;
}

const PLAID_CLIENT_ID = defineSecret('PLAID_CLIENT_ID');
const PLAID_SECRET = defineSecret('PLAID_SECRET');
const PLAID_ENV = defineSecret('PLAID_ENV');

const OWNER_EMAIL = 'mdulin@gmail.com';

function plaidClient() {
  const env = process.env.PLAID_ENV || 'sandbox';
  const config = new Configuration({
    basePath: PlaidEnvironments[env] || PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(config);
}

function assertOwner(auth) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (auth.token?.email !== OWNER_EMAIL) throw new HttpsError('permission-denied', 'Not authorized.');
}

/* ----------------------------- createLinkToken ---------------------------- */

export const createLinkToken = onCall(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV] },
  async (req) => {
    assertOwner(req.auth);
    const client = plaidClient();
    const res = await client.linkTokenCreate({
      user: { client_user_id: req.auth.uid },
      client_name: "Mike's Money",
      // `products` = required; the bank must support all of these.
      // `optional_products` = requested if supported, ignored if not — safest for mixed portfolios.
      products: [Products.Transactions],
      optional_products: [Products.Investments, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return { link_token: res.data.link_token, expiration: res.data.expiration };
  },
);

/* --------------------------- exchangePublicToken -------------------------- */

export const exchangePublicToken = onCall(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV] },
  async (req) => {
    assertOwner(req.auth);
    const { public_token, institution } = req.data || {};
    if (!public_token) throw new HttpsError('invalid-argument', 'Missing public_token');

    const client = plaidClient();
    const exchange = await client.itemPublicTokenExchange({ public_token });
    const access_token = exchange.data.access_token;
    const item_id = exchange.data.item_id;

    await db().collection('plaidItems').doc(item_id).set({
      access_token,
      institution: institution || null,
      linkedAt: FieldValue.serverTimestamp(),
      cursor: null,
    });

    // Kick off first sync
    await syncOne(item_id);

    return { ok: true, item_id };
  },
);

/* --------------------------------- syncItem -------------------------------- */

export const syncItem = onCall(
  { secrets: [PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV] },
  async (req) => {
    assertOwner(req.auth);
    const { itemId } = req.data || {};
    if (!itemId) throw new HttpsError('invalid-argument', 'Missing itemId');
    const stats = await syncOne(itemId);
    return { ok: true, ...stats };
  },
);

/* -------------------------- dailyTransactionSync -------------------------- */

export const dailyTransactionSync = onSchedule(
  {
    schedule: 'every day 06:00',
    timeZone: 'America/New_York',
    secrets: [PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV],
  },
  async () => {
    const items = await db().collection('plaidItems').get();
    for (const item of items.docs) {
      try { await syncOne(item.id); }
      catch (e) { console.error(`sync failed for ${item.id}:`, e); }
    }
    // Snapshot AFTER Plaid pulls fresh data
    await snapshotNetWorthNow();
  },
);

/* --------------------------- dailyNetWorthSnapshot ------------------------ */
// Separate schedule so history still tracks even if Plaid sync errors out.

export const dailyNetWorthSnapshot = onSchedule(
  { schedule: 'every day 07:00', timeZone: 'America/New_York' },
  async () => { await snapshotNetWorthNow(); },
);

/* ----------------------- manual snapshot (on demand) ---------------------- */

export const snapshotNetWorth = onCall(async (req) => {
  assertOwner(req.auth);
  return snapshotNetWorthNow();
});

/* ----------------------------- getMarketQuotes ----------------------------- */
// Fetches intraday quotes from Yahoo Finance (free, no auth required).
// Returns price + day's % change for any ticker. Used for the strong-market-day
// rebalance prompt on the Dashboard.

export const getMarketQuotes = onCall(async (req) => {
  assertOwner(req.auth);
  const { tickers = ['SPY'] } = req.data || {};
  if (!Array.isArray(tickers) || !tickers.length) {
    throw new HttpsError('invalid-argument', 'tickers must be a non-empty array');
  }

  const quotes = {};
  for (const raw of tickers.slice(0, 25)) {
    const ticker = String(raw).toUpperCase().trim();
    if (!ticker) continue;
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2d&interval=1d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) {
        quotes[ticker] = { error: `HTTP ${res.status}` };
        continue;
      }
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) {
        quotes[ticker] = { error: 'no data' };
        continue;
      }
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose ?? meta.previousClose;
      if (price == null || prev == null) {
        quotes[ticker] = { error: 'incomplete data' };
        continue;
      }
      quotes[ticker] = {
        price,
        previousClose: prev,
        change: price - prev,
        changePct: (price - prev) / prev,
        timestamp: meta.regularMarketTime,
        currency: meta.currency,
        marketState: meta.marketState, // PRE | REGULAR | POST | CLOSED
      };
    } catch (e) {
      console.error(`Failed to fetch ${ticker}:`, e.message);
      quotes[ticker] = { error: e.message };
    }
  }
  return { quotes, fetchedAt: Date.now() };
});

/* ---------------------- importNetWorthHistory (backfill) ---------------------- */

export const importNetWorthHistory = onCall(async (req) => {
  assertOwner(req.auth);
  const { records } = req.data || {};
  if (!Array.isArray(records)) throw new HttpsError('invalid-argument', 'records must be an array');
  const database = db();
  let imported = 0;
  let batch = database.batch();
  let batchSize = 0;
  for (const r of records) {
    if (!r?.date || r?.netWorth == null) continue;
    // Date must be YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    batch.set(database.collection('netWorthHistory').doc(r.date), {
      date: r.date,
      netWorth: Number(r.netWorth),
      assets: r.assets != null ? Number(r.assets) : null,
      liabilities: r.liabilities != null ? Number(r.liabilities) : null,
      imported: true,
      recordedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batchSize++;
    imported++;
    if (batchSize >= 450) {
      await batch.commit();
      batch = database.batch();
      batchSize = 0;
    }
  }
  if (batchSize > 0) await batch.commit();
  return { ok: true, imported };
});

async function snapshotNetWorthNow() {
  const database = db();

  // Pull accounts (server-written balances from Plaid)
  const [acctsSnap, holdingsSnap, configSnap] = await Promise.all([
    database.collection('accounts').get(),
    database.collection('holdings').get(),
    database.collection('finances').doc('user-money-data').get(),
  ]);

  let cash = 0, investments = 0, credit = 0, loan = 0, mortgage = 0, other = 0;

  for (const doc of acctsSnap.docs) {
    const a = doc.data();
    const bal = a.balance || 0;
    switch (a.type) {
      case 'depository': cash += bal; break;
      case 'investment': investments += bal; break;
      case 'credit':     credit   += bal; break;
      case 'loan':       loan     += bal; break;
      case 'mortgage':   mortgage += bal; break;
      default:           other    += bal;
    }
  }

  // Holdings total (some Plaid accounts report investment balance differently;
  // we take whichever is higher to avoid double-counting or missing positions)
  const holdingsTotal = holdingsSnap.docs.reduce(
    (s, d) => s + (d.data().institutionValue || 0), 0,
  );
  if (holdingsTotal > investments) investments = holdingsTotal;

  // Manual accounts
  const manual = configSnap.exists ? (configSnap.data().manualAccounts || []) : [];
  let manualAssets = 0, manualLiabilities = 0;
  for (const m of manual) {
    if (m.side === 'liability') manualLiabilities += (m.balance || 0);
    else manualAssets += (m.balance || 0);
  }

  const assets = cash + investments + manualAssets + Math.max(0, other);
  const liabilities = credit + loan + mortgage + manualLiabilities + Math.max(0, -other);
  const netWorth = assets - liabilities;

  // YYYY-MM-DD in America/New_York
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  await database.collection('netWorthHistory').doc(dateStr).set({
    date: dateStr,
    netWorth, assets, liabilities,
    cash, investments, manualAssets, manualLiabilities,
    credit, loan, mortgage,
    accountCount: acctsSnap.size,
    holdingCount: holdingsSnap.size,
    recordedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, date: dateStr, netWorth, assets, liabilities };
}

/* ---------------------------- helpers (internal) ---------------------------- */

async function syncOne(itemId) {
  const client = plaidClient();
  const ref = db().collection('plaidItems').doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`item ${itemId} not found`);
  const { access_token, cursor } = snap.data();

  // Pull transactions incrementally
  let hasMore = true;
  let nextCursor = cursor || null;
  let added = 0, modified = 0, removed = 0;

  while (hasMore) {
    const res = await client.transactionsSync({
      access_token,
      cursor: nextCursor || undefined,
    });
    const batch = db().batch();

    for (const t of res.data.added) {
      batch.set(db().collection('transactions').doc(t.transaction_id), normalizeTxn(t, itemId));
      added++;
    }
    for (const t of res.data.modified) {
      batch.set(db().collection('transactions').doc(t.transaction_id), normalizeTxn(t, itemId), { merge: true });
      modified++;
    }
    for (const t of res.data.removed) {
      batch.delete(db().collection('transactions').doc(t.transaction_id));
      removed++;
    }
    await batch.commit();

    nextCursor = res.data.next_cursor;
    hasMore = res.data.has_more;
  }

  // Refresh account balances
  const accts = await client.accountsGet({ access_token });
  const batch = db().batch();
  for (const a of accts.data.accounts) {
    batch.set(db().collection('accounts').doc(a.account_id), {
      itemId,
      name: a.name,
      officialName: a.official_name || null,
      mask: a.mask || null,
      type: a.type,
      subtype: a.subtype,
      balance: a.balances.current ?? 0,
      available: a.balances.available ?? null,
      currency: a.balances.iso_currency_code || 'USD',
      institution: snap.data().institution?.name || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();

  // Investments: holdings + securities (best-effort — only some accounts support it)
  let holdingsSynced = 0;
  let holdingsErr = null;
  try {
    const holdingsRes = await client.investmentsHoldingsGet({ access_token });
    const securitiesById = Object.fromEntries(
      (holdingsRes.data.securities || []).map((s) => [s.security_id, s]),
    );
    const hBatch = db().batch();
    for (const h of holdingsRes.data.holdings || []) {
      const s = securitiesById[h.security_id] || {};
      const id = `${h.account_id}_${h.security_id}`;
      hBatch.set(db().collection('holdings').doc(id), {
        itemId,
        accountId: h.account_id,
        securityId: h.security_id,
        ticker: s.ticker_symbol || null,
        name: s.name || null,
        type: s.type || null,                              // equity, etf, mutual fund, cash, etc.
        isCashEquivalent: !!s.is_cash_equivalent,
        quantity: h.quantity ?? 0,
        institutionPrice: h.institution_price ?? null,
        institutionValue: h.institution_value ?? 0,        // what the account shows
        costBasis: h.cost_basis ?? null,
        currency: h.iso_currency_code || 'USD',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      holdingsSynced++;
    }
    await hBatch.commit();
  } catch (e) {
    holdingsErr = e?.response?.data?.error_code || e?.message || 'error';
    if (holdingsErr !== 'PRODUCTS_NOT_SUPPORTED' && holdingsErr !== 'NO_INVESTMENT_ACCOUNTS') {
      console.warn(`holdings sync skipped for ${itemId}:`, holdingsErr);
    }
  }
  // Record the holdings-sync outcome on the item so the UI can show WHY positions
  // are/aren't coming through Plaid (instead of failing silently).
  try { await ref.set({ holdingsStatus: { count: holdingsSynced, error: holdingsErr || null, at: FieldValue.serverTimestamp() } }, { merge: true }); } catch (_) {}

  // Liabilities: credit card APRs, loan details, mortgage data
  let liabilitiesSynced = 0;
  try {
    const liabRes = await client.liabilitiesGet({ access_token });
    const liab = liabRes.data.liabilities || {};
    const lBatch = db().batch();
    for (const c of liab.credit || []) {
      lBatch.set(db().collection('liabilities').doc(c.account_id), {
        itemId, accountId: c.account_id, kind: 'credit',
        lastStatementBalance: c.last_statement_balance ?? null,
        minPayment: c.minimum_payment_amount ?? null,
        nextPaymentDueDate: c.next_payment_due_date ?? null,
        aprs: c.aprs || [],
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      liabilitiesSynced++;
    }
    for (const m of liab.mortgage || []) {
      lBatch.set(db().collection('liabilities').doc(m.account_id), {
        itemId, accountId: m.account_id, kind: 'mortgage',
        interestRate: m.interest_rate?.percentage ?? null,
        rateType: m.interest_rate?.type ?? null,
        originationDate: m.origination_date ?? null,
        maturityDate: m.maturity_date ?? null,
        originationPrincipalAmount: m.origination_principal_amount ?? null,
        currentLateFee: m.current_late_fee ?? null,
        nextMonthlyPayment: m.next_monthly_payment ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      liabilitiesSynced++;
    }
    for (const s of liab.student || []) {
      lBatch.set(db().collection('liabilities').doc(s.account_id), {
        itemId, accountId: s.account_id, kind: 'student',
        interestRate: s.interest_rate_percentage ?? null,
        originationDate: s.origination_date ?? null,
        expectedPayoffDate: s.expected_payoff_date ?? null,
        minPayment: s.minimum_payment_amount ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      liabilitiesSynced++;
    }
    await lBatch.commit();
  } catch (e) {
    if (e?.response?.data?.error_code !== 'PRODUCTS_NOT_SUPPORTED') {
      console.warn(`liabilities sync skipped for ${itemId}:`, e?.response?.data?.error_code || e.message);
    }
  }

  await ref.update({ cursor: nextCursor, lastSyncedAt: FieldValue.serverTimestamp() });
  return { added, modified, removed, holdingsSynced, holdingsError: holdingsErr, liabilitiesSynced };
}

function normalizeTxn(t, itemId) {
  return {
    itemId,
    accountId: t.account_id,
    amount: t.amount,                        // Plaid: positive = money out
    currency: t.iso_currency_code || 'USD',
    date: t.date,                            // "YYYY-MM-DD" local to account
    name: t.name,
    merchantName: t.merchant_name || null,
    pending: !!t.pending,
    category: null,                          // user-assigned (our taxonomy)
    plaidCategory: t.personal_finance_category?.primary || null,
    plaidDetail: t.personal_finance_category?.detailed || null,
    paymentChannel: t.payment_channel || null,
    updatedAt: FieldValue.serverTimestamp(),
  };
}
