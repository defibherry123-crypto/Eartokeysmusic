'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { HttpError, bad, randomToken, sha256, hmac, safeEqual, DAY } = require('./util');

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64;

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, n, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), KEYLEN, { N: +n, r: +r, p: +p });
  const exp = Buffer.from(hash, 'base64');
  return exp.length === key.length && crypto.timingSafeEqual(exp, key);
}
let dummy;
/** Burn the same time as a real check so "unknown email" and "wrong password" look identical. */
async function fakeVerify(pw) { dummy ||= await hashPassword('dummy-password'); await verifyPassword(pw, dummy); }

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, level: u.level || null,
  emailVerified: !!u.email_verified, instructorApproved: !!u.instructor_approved, createdAt: u.created_at,
});

// ---- sessions (opaque random tokens; only a hash is stored, so a DB leak can't be replayed) ----
function createSession(ctx, userId, req) {
  const token = randomToken(32);
  const now = ctx.now();
  ctx.db.prepare('INSERT INTO sessions (token_hash,user_id,created_at,expires_at,user_agent,ip) VALUES (?,?,?,?,?,?)')
    .run(sha256(token), userId, now, now + ctx.config.sessionDays * DAY, String(req.headers['user-agent'] || '').slice(0, 200), req.ip || '');
  return token;
}
function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function tokenFromRequest(req) {
  const a = req.headers.authorization;
  if (a && a.startsWith('Bearer ')) return { token: a.slice(7).trim(), viaCookie: false };
  const c = parseCookies(req.headers.cookie).etk_session;
  return c ? { token: c, viaCookie: true } : { token: null };
}
function authenticate(ctx, req) {
  const { token, viaCookie } = tokenFromRequest(req);
  if (!token) return null;
  const row = ctx.db.prepare(`SELECT u.*, s.expires_at AS s_exp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(sha256(token));
  if (!row || row.s_exp <= ctx.now() || row.disabled) return null;
  row.viaCookie = viaCookie;
  row.sessionHash = sha256(token);
  // Sliding session: active users stay signed in; idle ones expire after SESSION_DAYS.
  const full = ctx.config.sessionDays * DAY;
  if (row.s_exp - ctx.now() < full / 2) ctx.db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(ctx.now() + full, row.sessionHash);
  return row;
}
const cookieHeader = (ctx, token, maxAgeSec) =>
  `etk_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${ctx.config.secureCookies ? '; Secure' : ''}`;

// ---- one-time codes (email verification) and reset links ----
async function issueVerifyCode(ctx, user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = ctx.now();
  ctx.db.prepare("UPDATE email_codes SET used_at=? WHERE user_id=? AND purpose='verify' AND used_at IS NULL").run(now, user.id);
  ctx.db.prepare("INSERT INTO email_codes (user_id,purpose,code_hash,expires_at,created_at) VALUES (?,?,?,?,?)")
    .run(user.id, 'verify', hmac(ctx.config.secret, `${user.id}:${code}`), now + 15 * 60000, now);
  await ctx.mailer.send({ to: user.email, subject: 'Your EarToKeysMusic verification code', text: `Your 6-digit code is ${code}. It expires in 15 minutes.` });
}
function checkVerifyCode(ctx, user, code) {
  const now = ctx.now();
  const row = ctx.db.prepare("SELECT * FROM email_codes WHERE user_id=? AND purpose='verify' AND used_at IS NULL ORDER BY id DESC LIMIT 1").get(user.id);
  if (!row || row.expires_at <= now) throw bad('code_expired', 'That code has expired. Request a new one.');
  if (row.attempts >= 5) throw new HttpError(429, 'too_many_attempts', 'Too many wrong codes. Request a new one.');
  ctx.db.prepare('UPDATE email_codes SET attempts=attempts+1 WHERE id=?').run(row.id);
  if (!safeEqual(row.code_hash, hmac(ctx.config.secret, `${user.id}:${String(code).trim()}`))) throw bad('wrong_code', 'That code is not correct.');
  ctx.db.prepare('UPDATE email_codes SET used_at=? WHERE id=?').run(now, row.id);
  ctx.db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(user.id);
}
async function issueResetLink(ctx, user) {
  const token = randomToken(32);
  const now = ctx.now();
  ctx.db.prepare("UPDATE email_codes SET used_at=? WHERE user_id=? AND purpose='reset' AND used_at IS NULL").run(now, user.id);
  ctx.db.prepare("INSERT INTO email_codes (user_id,purpose,code_hash,expires_at,created_at) VALUES (?,?,?,?,?)")
    .run(user.id, 'reset', sha256(token), now + 60 * 60000, now);
  await ctx.mailer.send({ to: user.email, subject: 'Reset your EarToKeysMusic password', text: `Reset your password: ${ctx.config.frontendUrl}/#/reset?token=${token}\nThis link expires in 1 hour. If you didn't ask for it, ignore this email.` });
}
function consumeResetToken(ctx, token) {
  const row = ctx.db.prepare("SELECT * FROM email_codes WHERE purpose='reset' AND code_hash=? AND used_at IS NULL").get(sha256(String(token || '')));
  if (!row || row.expires_at <= ctx.now()) throw bad('invalid_reset_token', 'This reset link is invalid or has expired.');
  ctx.db.prepare('UPDATE email_codes SET used_at=? WHERE id=?').run(ctx.now(), row.id);
  return row.user_id;
}

module.exports = { hashPassword, verifyPassword, fakeVerify, publicUser, createSession, authenticate, cookieHeader, parseCookies, issueVerifyCode, checkVerifyCode, issueResetLink, consumeResetToken };
