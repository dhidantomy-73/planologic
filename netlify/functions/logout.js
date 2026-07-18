const { makeClearCookie } = require('./_lib/auth');

exports.handler = async () => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Set-Cookie': makeClearCookie(),
  },
  body: JSON.stringify({ ok: true }),
});
