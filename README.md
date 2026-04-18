# Mike's Money

Personal finance app — your data, your control. Similar capabilities to Empower (Personal Capital) and Rocket Money, built on your own Firebase + Plaid.

## What it does

- **Dashboard** — Net worth, assets vs liabilities, monthly spend/savings rate.
- **Accounts** — Plaid-linked banks/credit/investments + manual entries for home value, crypto, etc.
- **Transactions** — Auto-sync from Plaid, searchable, recategorizable.
- **Budgets** — Monthly category budgets with actual-vs-plan progress.
- **Cash Flow** — 12-month income vs spend + trend-based projection.
- **Scenarios** — What-if models (retirement, home purchase, career change) with compounding math.

## Stack

React 19 + Vite + Tailwind v4 + Firebase (Auth, Firestore, Functions) + Plaid. Deployed on Vercel.

---

## One-time setup

### 1. Firebase project
1. Console: https://console.firebase.google.com → **Add project** → name it `mikes-money`.
2. Enable **Authentication → Sign-in method → Google**. Whitelisted to `mdulin@gmail.com` via `ALLOWED_EMAILS` in `src/constants.js` and Firestore rules.
3. Enable **Firestore** (production mode).
4. Enable **Cloud Functions** (requires Blaze plan — pay-as-you-go; usage for this app will be cents/month).
5. Web app registration → copy the Firebase config into `.env.local` (see `.env.example`).

### 2. Plaid
1. Sign up at https://dashboard.plaid.com → get `client_id` and sandbox `secret`.
2. Production access requires application review — start in **sandbox** then switch when approved.
3. Set Firebase function secrets:
   ```bash
   firebase functions:secrets:set PLAID_CLIENT_ID
   firebase functions:secrets:set PLAID_SECRET
   firebase functions:secrets:set PLAID_ENV     # "sandbox" first; later "production"
   ```

### 3. Install & run

```bash
cd mikes-money
npm install
cp .env.example .env.local   # fill in Firebase values
npm run dev                  # http://localhost:5180
```

### 4. Deploy Cloud Functions + Firestore rules

```bash
npm install -g firebase-tools
firebase login
firebase use --add           # select your mikes-money project
firebase deploy --only functions,firestore
```

### 5. Deploy web app to Vercel

- Push repo to GitHub (`mdulin01/mikes-money`).
- Vercel → New Project → import → set env vars from `.env.example`.
- Framework: Vite. Node version: **22.x** (not 24 — see learning.md).

---

## Architecture notes

- **Single-user app.** `ALLOWED_EMAILS` gates client; Firestore rules gate server.
- **Plaid access tokens never reach the browser.** They live only in `plaidItems/{itemId}` and are readable only by Cloud Functions (client-side writes are denied).
- **Transaction ingestion** uses Plaid's `/transactions/sync` (cursor-based). Runs on-demand (`syncItem`) and daily at 6am ET (`dailyTransactionSync`).
- **Scenarios** are pure client-side math in `Scenarios.jsx::project()`. Monthly compounding on starting balance + contributions − withdrawals.
- **Dates:** All date strings use local (EDT/EST) time via `toLocalDateStr()` in `src/utils/dateUtils.js`. Never `.toISOString()`.

## Firestore schema

```
finances/user-money-data       → config (categories, budgets, scenarios, manual accounts, prefs)
accounts/{accountId}            → live balances (server-written only)
transactions/{transactionId}    → plaid txns (server-written; category editable by user)
plaidItems/{itemId}             → link metadata (server-only)
```

## Roadmap

- Net worth history chart (snapshot daily via scheduled function)
- Subscription detection (recurring charge heuristics)
- CSV export
- Investment holdings (Plaid Investments product)
- Multi-scenario Monte Carlo
