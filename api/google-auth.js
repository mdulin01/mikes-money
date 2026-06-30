// One-time setup helper to mint a Gmail refresh token with the gmail.compose scope.
// Flow: visit /api/google-auth (no params) → Google consent → redirects back here
// with ?code=… → we exchange it and SHOW the refresh_token so you can paste it into
// the Vercel env var GMAIL_REFRESH_TOKEN (then redeploy). Used only by api/invoice-draft.
// env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
const SCOPE = 'https://www.googleapis.com/auth/gmail.compose';

function redirectUri(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${host}/api/google-auth`;
}

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(503).send('<h2>Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in Vercel env.</h2>');
  }

  const url = new URL(req.url, 'https://x');
  const code = url.searchParams.get('code');
  const ruri = redirectUri(req);

  // Step 1: kick off consent
  if (!code) {
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.searchParams.set('client_id', clientId);
    auth.searchParams.set('redirect_uri', ruri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', SCOPE);
    auth.searchParams.set('access_type', 'offline');
    auth.searchParams.set('prompt', 'consent'); // force a refresh_token every time
    res.writeHead(302, { Location: auth.toString() });
    return res.end();
  }

  // Step 2: exchange code → tokens
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: ruri, grant_type: 'authorization_code',
      }),
    });
    const j = await r.json();
    res.setHeader('Content-Type', 'text/html');
    if (!r.ok || !j.refresh_token) {
      return res.status(502).send(
        `<h2>Token exchange ${r.ok ? 'returned no refresh_token' : 'failed'}.</h2>` +
        `<p>${(j.error_description || j.error || '')}</p>` +
        `<p>Make sure prompt=consent forced a fresh grant. Raw: <pre>${JSON.stringify(j, null, 2)}</pre></p>`);
    }
    return res.status(200).send(
      `<body style="font-family:system-ui;max-width:680px;margin:40px auto;color:#111">
       <h2>✅ Gmail connected</h2>
       <p>Copy this into the Vercel env var <b>GMAIL_REFRESH_TOKEN</b> for the mikes-money project, then redeploy:</p>
       <pre style="background:#f4f4f4;padding:14px;border-radius:8px;white-space:pre-wrap;word-break:break-all">${j.refresh_token}</pre>
       <p style="color:#666">After redeploy, the Business tab "Create invoice + draft email" button will work. You can delete this endpoint once set up.</p>
       </body>`);
  } catch (e) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send('<h2>Error: ' + e.message + '</h2>');
  }
}
