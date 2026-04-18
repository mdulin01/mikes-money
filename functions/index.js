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

initializeApp();
const db = getFirestore();

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
      products: [Products.Transactions],
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

    await db.collection('plaidItems').doc(item_id).set({
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
    const items = await db.collection('plaidItems').get();
    for (const item of items.docs) {
      try { await syncOne(item.id); }
      catch (e) { console.error(`sync failed for ${item.id}:`, e); }
    }
  },
);

/* ---------------------------- helpers (internal) ---------------------------- */

async function syncOne(itemId) {
  const client = plaidClient();
  const ref = db.collection('plaidItems').doc(itemId);
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
    const batch = db.batch();

    for (const t of res.data.added) {
      batch.set(db.collection('transactions').doc(t.transaction_id), normalizeTxn(t, itemId));
      added++;
    }
    for (const t of res.data.modified) {
      batch.set(db.collection('transactions').doc(t.transaction_id), normalizeTxn(t, itemId), { merge: true });
      modified++;
    }
    for (const t of res.data.removed) {
      batch.delete(db.collection('transactions').doc(t.transaction_id));
      removed++;
    }
    await batch.commit();

    nextCursor = res.data.next_cursor;
    hasMore = res.data.has_more;
  }

  // Refresh account balances
  const accts = await client.accountsGet({ access_token });
  const batch = db.batch();
  for (const a of accts.data.accounts) {
    batch.set(db.collection('accounts').doc(a.account_id), {
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

  await ref.update({ cursor: nextCursor, lastSyncedAt: FieldValue.serverTimestamp() });
  return { added, modified, removed };
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
