const { getSession } = require('./_lib/auth');

exports.handler = async (event) => {
  const session = getSession(event);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session
      ? { authenticated: true, email: session.email, role: session.role }
      : { authenticated: false }),
  };
};
