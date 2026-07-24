const { setSessionCookie } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const TEAM_PASSWORD = process.env.TEAM_PASSWORD;
  const SESSION_SECRET = process.env.SESSION_SECRET;
  if (!TEAM_PASSWORD || !SESSION_SECRET) {
    res.status(500).json({ error: 'Server not configured — set TEAM_PASSWORD and SESSION_SECRET in Vercel project settings.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const password = body && body.password;

  if (typeof password !== 'string' || password !== TEAM_PASSWORD) {
    // small delay to make brute-forcing marginally less trivial
    await new Promise(r => setTimeout(r, 400));
    res.status(401).json({ error: 'Wrong password' });
    return;
  }

  setSessionCookie(res);
  res.status(200).json({ ok: true });
};
