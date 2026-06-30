# Invoice → Gmail draft — one-time setup

The Business tab can now generate an activity-itemized invoice PDF and create a **Gmail
draft** with it attached (it never auto-sends — you review and hit send). This needs a
Gmail OAuth token with the `gmail.compose` scope. Do this once.

## 1. Google Cloud Console (project: `mikesmoney-91595`)
1. **Enable the Gmail API**: APIs & Services → Library → "Gmail API" → **Enable**.
2. **OAuth consent screen**: if not already configured, set it up (External). Under
   **Test users**, add `mdulin@gmail.com`. (`gmail.compose` is a restricted scope; as a
   test user / the app owner you'll get an "unverified app" warning — click *Advanced →
   Go to app*. No Google verification needed for personal use.)
3. **Create credentials**: APIs & Services → Credentials → **Create OAuth client ID** →
   *Web application*. Add these **Authorized redirect URIs**:
   - `https://www.mikesmoney.app/api/google-auth`
   - `https://mikes-money.vercel.app/api/google-auth`
   Copy the **Client ID** and **Client secret**.

## 2. Vercel env (project `mikes-money`) → Settings → Environment Variables
Add, then **redeploy**:
- `GOOGLE_CLIENT_ID` = (from step 1)
- `GOOGLE_CLIENT_SECRET` = (from step 1)

## 3. Mint the refresh token
After the redeploy, visit **https://www.mikesmoney.app/api/google-auth** while signed in
as `mdulin@gmail.com`. Approve the consent. The page will display a **refresh token**.
- Add it to Vercel as `GMAIL_REFRESH_TOKEN`, then **redeploy** once more.

Done. (You can delete `api/google-auth.js` afterward if you like — it's only for setup.)

## Using it
Business tab → **Timesheet**: log hours, picking an **Activity** for each entry
(Clinical / VBC / Referral strategy / Dashboard / …). Set the **Next invoice #**, then on
the client's billing row click **✉️ Invoice + email draft**. A Gmail draft to the client
(Avance → Dr. Steventon, cc AP) appears with the itemized PDF attached. **⬇︎ PDF** just
downloads the PDF without emailing.

Recipients per client are set in `src/pages/Business.jsx` (`CLIENTS[...]​.to/.cc/.greeting`).

> Note: this is separate from QuickBooks — drafting here does **not** create the invoice in
> Intuit. Keep your invoice numbering in sync (the app tracks `Next invoice #`).
