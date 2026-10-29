'use strict';
const crypto = require('node:crypto');

const DAY = 86400000;

class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const bad = (code, message, extra) => new HttpError(400, code, message, extra);

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('base64url');

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

/** Compact signed token: base64url(json).signature  (used for stream links) */
function signToken(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(secret, body)}`;
}
function verifyToken(secret, token, nowMs) {
  if (typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  if (!safeEqual(token.slice(i + 1), hmac(secret, body))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp <= nowMs) return null;
  return payload;
}

/** Add calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
function addMonths(ms, n) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function email(v) {
  const e = String(v ?? '').trim().toLowerCase();
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) throw bad('invalid_email', 'Enter a valid email address.');
  return e;
}
function text(v, name, { min = 1, max = 200 } = {}) {
  const s = String(v ?? '').trim();
  if (s.length < min) throw bad('invalid_' + name, `${name} is required.`);
  if (s.length > max) throw bad('invalid_' + name, `${name} is too long.`);
  return s;
}
function password(v) {
  const s = String(v ?? '');
  if (s.length < 8) throw bad('weak_password', 'Password needs 8+ characters.');
  if (s.length > 200) throw bad('invalid_password', 'Password is too long.');
  return s;
}
function oneOf(v, list, name) {
  if (!list.includes(v)) throw bad('invalid_' + name, `${name} must be one of: ${list.join(', ')}.`);
  return v;
}
function int(v, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) throw bad('invalid_' + name, `${name} is invalid.`);
  return n;
}
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

module.exports = { DAY, HttpError, bad, randomToken, sha256, hmac, safeEqual, signToken, verifyToken, addMonths, email, text, password, oneOf, int, slugify };
