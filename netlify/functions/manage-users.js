// Account management: list / create / delete / change role / change
// password for users.json accounts. All actions require a logged-in
// session; list/create/delete/update-role additionally require the
// "admin" role. Any logged-in user may change their own password.

const { getSession, isAdmin } = require('./_lib/auth');
const { loadUsers, saveUsers, hashPassword, normalizeEmail, isValidEmail, publicUser } = require('./_lib/users');

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const session = getSession(event);
  if (!session) return json(401, { error: 'Sesi tidak valid. Silakan login lagi.' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'JSON tidak valid.' });
  }

  const action = body.action;

  try {
    if (action === 'list') {
      if (!isAdmin(session)) return json(403, { error: 'Hanya admin yang bisa melihat daftar akun.' });
      const { users } = await loadUsers();
      return json(200, { ok: true, users: users.map(publicUser), bootstrapEmail: process.env.ADMIN_EMAIL || null });
    }

    if (action === 'create') {
      if (!isAdmin(session)) return json(403, { error: 'Hanya admin yang bisa menambah akun.' });
      const email = normalizeEmail(body.email);
      const name = String(body.name || '').trim();
      const password = String(body.password || '');
      const role = body.role === 'admin' ? 'admin' : 'editor';
      if (!isValidEmail(email)) return json(400, { error: 'Email tidak valid.' });
      if (!name) return json(400, { error: 'Nama wajib diisi.' });
      if (password.length < 8) return json(400, { error: 'Password minimal 8 karakter.' });

      const { users, sha } = await loadUsers();
      if (email === normalizeEmail(process.env.ADMIN_EMAIL)) {
        return json(400, { error: 'Email ini sudah dipakai sebagai akun bootstrap (env var ADMIN_EMAIL).' });
      }
      if (users.some(u => normalizeEmail(u.email) === email)) {
        return json(400, { error: 'Sudah ada akun dengan email ini.' });
      }
      users.push({ email, name, role, passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
      await saveUsers(users, sha, `Add admin panel account: ${email} (by ${session.email})`);
      return json(200, { ok: true, message: `Akun ${email} berhasil ditambahkan.` });
    }

    if (action === 'delete') {
      if (!isAdmin(session)) return json(403, { error: 'Hanya admin yang bisa menghapus akun.' });
      const email = normalizeEmail(body.email);
      if (normalizeEmail(session.email) === email) {
        return json(400, { error: 'Tidak bisa menghapus akun yang sedang Anda pakai untuk login.' });
      }
      const { users, sha } = await loadUsers();
      const next = users.filter(u => normalizeEmail(u.email) !== email);
      if (next.length === users.length) return json(404, { error: 'Akun tidak ditemukan.' });
      await saveUsers(next, sha, `Remove admin panel account: ${email} (by ${session.email})`);
      return json(200, { ok: true, message: `Akun ${email} berhasil dihapus.` });
    }

    if (action === 'update-role') {
      if (!isAdmin(session)) return json(403, { error: 'Hanya admin yang bisa mengubah peran akun.' });
      const email = normalizeEmail(body.email);
      const role = body.role === 'admin' ? 'admin' : 'editor';
      const { users, sha } = await loadUsers();
      const user = users.find(u => normalizeEmail(u.email) === email);
      if (!user) return json(404, { error: 'Akun tidak ditemukan.' });
      user.role = role;
      await saveUsers(users, sha, `Update role for ${email} to ${role} (by ${session.email})`);
      return json(200, { ok: true, message: `Peran ${email} diubah menjadi ${role}.` });
    }

    if (action === 'change-password') {
      const targetEmail = normalizeEmail(body.email || session.email);
      const isSelf = targetEmail === normalizeEmail(session.email);
      if (!isSelf && !isAdmin(session)) {
        return json(403, { error: 'Anda hanya bisa mengganti password akun sendiri.' });
      }
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 8) return json(400, { error: 'Password minimal 8 karakter.' });
      if (targetEmail === normalizeEmail(process.env.ADMIN_EMAIL)) {
        return json(400, { error: 'Password akun bootstrap diatur lewat environment variable ADMIN_PASSWORD di Netlify, bukan di sini.' });
      }
      const { users, sha } = await loadUsers();
      const user = users.find(u => normalizeEmail(u.email) === targetEmail);
      if (!user) return json(404, { error: 'Akun tidak ditemukan.' });
      user.passwordHash = hashPassword(newPassword);
      await saveUsers(users, sha, `Change password for ${targetEmail} (by ${session.email})`);
      return json(200, { ok: true, message: 'Password berhasil diganti.' });
    }

    return json(400, { error: `Aksi tidak dikenal: ${action}` });
  } catch (err) {
    return json(500, { error: err.message || String(err) });
  }
};
