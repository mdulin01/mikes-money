// ✨ Page insight — Vercel serverless fn. The client sends a compact JSON snapshot
// of the page it's on; Rupert (OpenAI) returns 2-4 sharp observations + one action.
// Auth: Firebase ID token verified via Google tokeninfo (aud = this project,
// email = Mike) — no admin SDK needed. env: OPENAI_API_KEY (+ optional OPENAI_MODEL).
const PROJECT = 'mikesmoney-91595';
const OWNER = 'mdulin@gmail.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { idToken, page, context, question } = req.body || {};
    if (!idToken) return res.status(401).json({ error: 'missing token' });
    const ti = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    const info = await ti.json();
    if (!ti.ok || info.aud !== PROJECT || info.email !== OWNER || String(info.email_verified) !== 'true') {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Add OPENAI_API_KEY in Vercel → redeploy to enable insights.' });

    const sys = `You are Rupert, Mike Dulin's sharp personal-finance chief of staff. You are looking at a JSON snapshot of the "${page}" page of his own finance app (his real data; he built the app). Reply in markdown, ≤150 words: the 2-4 most useful observations (specific numbers, deltas, anomalies — not restatements) and finish with ONE concrete next action. No preamble, no generic advice, no disclaimers.`;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.5',
        max_completion_tokens: 400,
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
