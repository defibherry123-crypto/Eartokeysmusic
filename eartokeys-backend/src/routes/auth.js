'use strict';
const { HttpError, bad, email, text, password, oneOf, sha256 } = require('../util');
const A = require('../auth');
const { getAccess } = require('../access');
const { LEVELS } = require('../plans');
const { reply } = require('../http');

module.exports = (r) => {
  const sessionReply = (ctx, req, user, status = 200) => {
    const token = A.createSession(ctx, user.id, req);
    const out = { user: A.publicUser(user), access: getAccess(ctx, user.id) };
    if (String(req.headers['x-auth-mode']).toLowerCase() === 'bearer') out.token = token; // for mobile apps / separate-domain sites
    return reply(status, out, { 'Set-Cookie': A.cookieHeader(ctx, token, ctx.config.sessionDays * 86400) });
  };

  async function register({ ctx, req, body }, role) {
    const name = text(body.name, 'name', { max: 100 });
    const em = email(body.email);
    const pw = password(body.password);
    if (ctx.db.prepare('SELECT 1 FROM users WHERE email=?').get(em)) throw new HttpError(409, 'email_taken', 'An account with this email already exists. Try signing in.');
    const hash = await A.hashPassword(pw);
    const specialty = role === 'instructor' ? text(body.specialty || 'Classical piano', 'specialty', { max: 60 }) : null;
    const id = Number(ctx.db.prepare('INSERT INTO users (name,email,password_hash,role,specialty,created_at) VALUES (?,?,?,?,?,?)')
      .run(name, em, hash, role, specialty, ctx.now()).lastInsertRowid);
    const user = ctx.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    await A.issueVerifyCode(ctx, user);
    return user;
  }

  const signupLimit = { name: 'signup', max: 10, windowMs: 3600000 };
  r.post('/api/auth/signup', { auth: 'none', limit: signupLimit }, async (c) => sessionReply(c.ctx, c.req, await register(c, 'student'), 201));
  r.post('/api/auth/instructor-signup', { auth: 'none', limit: signupLimit }, async (c) => sessionReply(c.ctx, c.req, await register(c, 'instructor'), 201));

  r.post('/api/auth/login', { auth: 'none', limit: { name: 'login', max: 20, windowMs: 900000 } }, async ({ ctx, req, body }) => {
    const em = email(body.email);
    const wait = ctx.limiter.check('loginemail:' + em, 8, 900000);
    if (wait) throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts for this account. Try again later.', { retryAfter: wait });
    const user = ctx.db.prepare('SELECT * FROM users WHERE email=?').get(em);
    const pw = String(body.password ?? '').slice(0, 200);
    const ok = user ? await A.verifyPassword(pw, user.password_hash) : (await A.fakeVerify(pw), false);
    if (!ok || user.disabled) throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');
    return sessionReply(ctx, req, user);
  });

  r.post('/api/auth/logout', { auth: 'optional' }, ({ ctx, user }) => {
    if (user) ctx.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.sessionHash);
    return reply(200, { ok: true }, { 'Set-Cookie': A.cookieHeader(ctx, '', 0) });
  });

  r.post('/api/auth/verify-email', { limit: { name: 'verify', max: 20, windowMs: 900000 } }, ({ ctx, user, body }) => {
    if (user.email_verified) return { ok: true, user: A.publicUser(user) };
    A.checkVerifyCode(ctx, user, body.code);
    return { ok: true, user: A.publicUser(ctx.db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) };
  });

  r.post('/api/auth/resend-code', { limit: { name: 'resend', max: 5, windowMs: 900000 } }, async ({ ctx, user }) => {
    if (user.email_verified) throw bad('already_verified', 'Your email is already verified.');
    await A.issueVerifyCode(ctx, user);
    return { ok: true };
  });

  // Always answers the same, so nobody can use this form to discover who has an account.
  r.post('/api/auth/forgot-password', { auth: 'none', limit: { name: 'forgot', max: 5, windowMs: 900000 } }, async ({ ctx, body }) => {
    const em = email(body.email);
    const user = ctx.db.prepare('SELECT * FROM users WHERE email=? AND disabled=0').get(em);
    if (user) await A.issueResetLink(ctx, user);
    return { ok: true, message: 'If that email has an account, a reset link is on its way.' };
  });

  r.post('/api/auth/reset-password', { auth: 'none', limit: { name: 'reset', max: 10, windowMs: 900000 } }, async ({ ctx, body }) => {
    const pw = password(body.password);
    const userId = A.consumeResetToken(ctx, body.token);
    ctx.db.prepare('UPDATE users SET password_hash=?, email_verified=1 WHERE id=?').run(await A.hashPassword(pw), userId);
    ctx.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); // sign out everywhere
    return { ok: true };
  });

  r.post('/api/auth/change-password', async ({ ctx, user, body }) => {
    if (!(await A.verifyPassword(String(body.currentPassword ?? '').slice(0, 200), user.password_hash))) throw new HttpError(401, 'invalid_credentials', 'Current password is incorrect.');
    const pw = password(body.newPassword);
    ctx.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await A.hashPassword(pw), user.id);
    ctx.db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id, user.sessionHash);
    return { ok: true };
  });

  r.get('/api/me', ({ ctx, user }) => ({ user: A.publicUser(user), access: getAccess(ctx, user.id) }));

  r.patch('/api/me', ({ ctx, user, body }) => {
    const name = body.name !== undefined ? text(body.name, 'name', { max: 100 }) : user.name;
    const level = body.level !== undefined ? oneOf(body.level, LEVELS, 'level') : user.level;
    ctx.db.prepare('UPDATE users SET name=?, level=? WHERE id=?').run(name, level, user.id);
    return { user: A.publicUser(ctx.db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) };
  });
};
