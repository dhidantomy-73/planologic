// Signed-cookie session auth (email + role based) with no external
// dependencies. A session is: base64url(JSON payload) + "." + HMAC-SHA256
// signature (hex), stored in an httpOnly, Secure, SameSite=Strict cookie.

const crypto = require('crypto');
const { loadUsers, verifyPassword, normalizeEmail } = require('./users');

const COOKIE_NAME = 'pl_admin_session';
const SESSION_HOURS = 8;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is not set');
  }
  return secret;
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64').toString('utf8');
}

function sign(payloadObj) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  const sigBuf = Buffer.from(sig || '', 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let data;
  try {
    data = JSON.parse(b64urlDecode(payload));
  } catch (e) {
    return null;
  }
  if (!data.exp || Date.now() > data.exp) return null;
  return data;
}

function makeSessionCookie(session) {
  const exp = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const token = sign({ email: session.email, role: session.role, exp });
  const maxAge = SESSION_HOURS * 60 * 60;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function makeClearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function readCookie(headerValue, name) {
  if (!headerValue) return null;
  const parts = headerValue.split(';').map(p => p.trim());
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const key = p.slice(0, idx);
    if (key === name) return decodeURIComponent(p.slice(idx + 1));
  }
  return null;
}

// Returns the verified session data ({ email, role, exp }), or null.
function getSession(event) {
  const cookieHeader = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  const token = readCookie(cookieHeader, COOKIE_NAME);
  return verify(token);
}

function isAdmin(session) {
  return !!session && session.role === 'admin';
}

// Checks email/password against the bootstrap admin (env vars) first, then
// against accounts stored in netlify/data/users.json. Returns
// { email, role, name } on success, or null on failure.
async function checkCredentials(email, password) {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) return null;

  const bootstrapEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  const bootstrapPassword = process.env.ADMIN_PASSWORD;
  if (bootstrapEmail && bootstrapPassword && normalized === bootstrapEmail) {
    const a = Buffer.from(String(password));
    const b = Buffer.from(String(bootstrapPassword));
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (match) return { email: bootstrapEmail, role: 'admin', name: 'Admin' };
    return null; // don't fall through to users.json for the bootstrap email
  }

  const { users } = await loadUsers();
  const user = users.find(u => normalizeEmail(u.email) === normalized);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return { email: user.email, role: user.role || 'editor', name: user.name || user.email };
}

module.exports = {
  getSession,
  makeSessionCookie,
  makeClearCookie,
  checkCredentials,
  isAdmin,
  COOKIE_NAME,
};
