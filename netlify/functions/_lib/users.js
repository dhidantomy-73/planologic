// User account storage. Accounts are kept as a JSON file committed to the
// same GitHub repo the posts live in (so no external database is needed),
// at USERS_PATH. Passwords are never stored in plain text — only a
// salted scrypt hash.
//
// In addition to accounts in this file, ADMIN_EMAIL + ADMIN_PASSWORD (env
// vars) always work as a "bootstrap" admin login. That account is not
// listed or editable here — it exists purely so the site owner can never
// be locked out (e.g. if users.json is empty, corrupted, or every listed
// admin account gets removed by mistake).

const crypto = require('crypto');
const { getFile, putFile } = require('./github');

const USERS_PATH = 'netlify/data/users.json';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Returns { users: [...], sha: '...' | undefined }. Never throws for a
// missing file — returns an empty list so the very first admin can be
// created via the bootstrap login.
async function loadUsers() {
  const file = await getFile(USERS_PATH);
  if (!file) return { users: [], sha: undefined };
  try {
    const users = JSON.parse(file.content);
    return { users: Array.isArray(users) ? users : [], sha: file.sha };
  } catch (e) {
    throw new Error(`File ${USERS_PATH} berisi JSON yang tidak valid.`);
  }
}

async function saveUsers(users, sha, commitMessage) {
  const content = JSON.stringify(users, null, 2) + '\n';
  return putFile(USERS_PATH, content, commitMessage, sha);
}

function publicUser(u) {
  return { email: u.email, name: u.name, role: u.role, createdAt: u.createdAt };
}

module.exports = {
  USERS_PATH,
  hashPassword,
  verifyPassword,
  normalizeEmail,
  isValidEmail,
  loadUsers,
  saveUsers,
  publicUser,
};
