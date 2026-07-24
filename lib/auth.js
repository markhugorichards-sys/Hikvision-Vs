const crypto = require('crypto');

const COOKIE_NAME = 'hikvs_session';
const MAX_AGE_SECONDS = 30 * 24 * 3600; // 30 days

function sign(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token, secret) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return Boolean(payload.exp && payload.exp > Date.now());
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function isAuthed(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const token = getCookie(req, COOKIE_NAME);
  return verifyToken(token, secret);
}

function setSessionCookie(res) {
  const secret = process.env.SESSION_SECRET;
  const token = sign({ exp: Date.now() + MAX_AGE_SECONDS * 1000 }, secret);
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

module.exports = { isAuthed, setSessionCookie, clearSessionCookie, COOKIE_NAME };
