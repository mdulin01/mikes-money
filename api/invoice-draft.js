// Creates a Gmail DRAFT (never auto-sends) with the invoice PDF attached.
// Client posts { idToken, to[], cc[], subject, body, filename, pdfBase64 }.
// Auth: verifies the Firebase ID token (same RS256 check as insight.js) and that
// it's Mike. Gmail access comes from a stored OAuth refresh token with the
// gmail.compose scope.
// env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN  (+ inherits none else)
import crypto from 'node:crypto';

const PROJECT = 'mikesmoney-91595';
const OWNER = 'mdulin@gmail.com';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

async function verifyFirebaseToken(idToken) {
  const [h, p, sig] = String(idToken || '').split('.');
  if (!h || !p || !sig) throw new Error('malformed');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error('expired');
  if (payload.aud !== PROJECT) throw new Error('aud');
  if (payload.iss !== `https://securetoken.google.com/${PROJECT}`) throw new Error('iss');
  const certs = await (await fetch(CERTS_URL)).json();
  const pem = certs[header.kid];
  if (!pem) throw new Error('kid');
  const pub = new crypto.X509Certificate(pem).publicKey;
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), pub, Buffer.from(sig, 'base64url'));
  if (!ok) throw new Error('signature');
  return payload;
}

async function googleAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || 'token refresh failed');
  return j.access_token;
}

function buildMime({ to, cc, subject, body, filename, pdfBase64 }) {
  const boundary = '----invoice_' + crypto.randomBytes(8).toString('hex');
  const wrapped = pdfBase64.replace(/.{76}/g, '$&\r\n'); // RFC 2045 line length
  const headers = [
    `From: Michael Dulin, MD <${OWNER}>`,
    `To: ${to.join(', ')}`,
  ];
  if (cc && cc.length) headers.push(`Cc: ${cc.join(', ')}`);
  headers.push(
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  );
  return [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    wrapped,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { idToken, to, cc, subject, body, filename, pdfBase64 } = req.body || {};
    if (!idToken) return res.status(401).json({ error: 'missing token' });
    let payload;
    try { payload = await verifyFirebaseToken(idToken); }
    catch (e) { return res.status(403).json({ error: 'auth failed: ' + e.message }); }
    if (payload.email !== OWNER || payload.email_verified !== true) return res.status(403).json({ error: 'not authorized' });

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN)
      return res.status(503).json({ error: 'Gmail not connected. Set GOOGLE_CLIENT_ID/SECRET + GMAIL_REFRESH_TOKEN in Vercel (visit /api/google-auth once), then redeploy.' });
    if (!Array.isArray(to) || !to.length) return res.status(400).json({ error: 'no recipients' });
    if (!pdfBase64) return res.status(400).json({ error: 'no pdf' });

    const access = await googleAccessToken();
    const mime = buildMime({ to, cc: cc || [], subject: subject || '', body: body || '', filename: filename || 'invoice.pdf', pdfBase64 });
    const raw = Buffer.from(mime, 'utf8').toString('base64url');

    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { raw } }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || 'gmail draft failed' });
    return res.status(200).json({ ok: true, draftId: j.id, messageId: j.message?.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
