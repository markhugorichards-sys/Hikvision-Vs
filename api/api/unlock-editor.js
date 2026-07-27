const { isAuthed, setEditorCookie } = require('../lib/auth');

module.exports = async (req, res) => {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD;
  const SESSION_SECRET = process.env.SESSION_SECRET;
  if (!EDITOR_PASSWORD || !SESSION_SECRET) {
    res.status(500).json({ error: 'Editing is not configured yet — set EDITOR_PASSWORD in Vercel project settings.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const password = body && body.password;

  if (typeof password !== 'string' || password !== EDITOR_PASSWORD) {
    await new Promise(r => setTimeout(r, 400));
    res.status(401).json({ error: 'Wrong editor password' });
    return;
  }

  setEditorCookie(res);
  res.status(200).json({ ok: true });
};
