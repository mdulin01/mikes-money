// ✨ Page insight — Vercel serverless fn. The client sends a compact JSON snapshot
// of the page it's on; Rupert (OpenAI) returns 2-4 sharp observations + one action.
// Auth: verifies the Firebase ID token's RS256 signature against Google's public
// securetoken certs (no admin SDK, no service account, no API key needed) and
// checks it's Mike. env: OPENAI_API_KEY (+ optional OPENAI_MODEL).
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { idToken, page, context, question } = req.body || {};
    if (!idToken) return res.status(401).json({ error: 'missing token' });
    let payload;
    try { payload = await verifyFirebaseToken(idToken); }
    catch (e) { return res.status(403).json({ error: 'auth failed: ' + e.message }); }
    if (payload.email !== OWNER || payload.email_verified !== true) return res.status(403).json({ error: 'not authorized' });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Add OPENAI_API_KEY in mikesmoney Vercel env → redeploy.' });

    const sys = `You are Rupert, Mike Dulin's sharp personal-finance chief of staff. You are looking at a JSON snapshot of the "${page}" page of his own finance app (his real data; he built the app). Reply in markdown, ≤150 words: the 2-4 most useful observations (specific numbers, deltas, anomalies — not restatements) and finish with ONE concrete next action. No preamble, no generic advice, no disclaimers.`;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.5',
        max_completion_tokens: 3000, // gpt-5.5 is a reasoning model — a small cap gets eaten by reasoning tokens and returns empty content
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: (question ? question + '\n\n' : '') + JSON.stringify(context).slice(0, 24000) },
        ],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || 'openai failed' });
    return res.status(200).json({ text: j.choices?.[0]?.message?.content || '(empty)' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
