'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

test('signup, email verification, login and protected routes', async (t) => {
  const h = await boot(); t.after(h.close);
  const s = await h.signup('amara@mail.com', { verify: false });

  assert.equal((await h.api('GET', '/api/me')).status, 401, 'no token = 401');
  const me = await h.api('GET', '/api/me', { token: s.token });
  assert.equal(me.body.user.emailVerified, false);
  assert.equal(me.body.access.state, 'none');

  // cannot pay before the email is verified
  assert.equal((await h.api('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'Beginner', billing: 'monthly' } })).status, 403);

  assert.equal((await h.api('POST', '/api/auth/verify-email', { token: s.token, body: { code: '000000' } })).body.error.code, 'wrong_code');
  assert.equal((await h.api('POST', '/api/auth/verify-email', { token: s.token, body: { code: h.lastCode('amara@mail.com') } })).status, 200);

  assert.equal((await h.api('POST', '/api/auth/signup', { body: { name: 'X', email: 'AMARA@mail.com', password: 'password123' } })).status, 409, 'duplicate email is case-insensitive');
  assert.equal((await h.api('POST', '/api/auth/signup', { body: { name: 'X', email: 'new@mail.com', password: 'short' } })).body.error.code, 'weak_password');

  const bad = await h.api('POST', '/api/auth/login', { body: { email: 'amara@mail.com', password: 'wrongpass1' } });
  assert.equal(bad.status, 401);
  const unknown = await h.api('POST', '/api/auth/login', { body: { email: 'nobody@mail.com', password: 'wrongpass1' } });
  assert.deepEqual(unknown.body, bad.body, 'unknown email and wrong password look identical');

  const ok = await h.api('POST', '/api/auth/login', { body: { email: 'amara@mail.com', password: 'password123' } });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal(ok.body.token, undefined, 'token is not exposed unless bearer mode is requested');
});

test('roles: students cannot reach admin or studio; unapproved instructors are blocked', async (t) => {
  const h = await boot(); t.after(h.close);
  const s = await h.signup();
  assert.equal((await h.api('GET', '/api/admin/overview', { token: s.token })).status, 403);
  assert.equal((await h.api('GET', '/api/studio/lessons', { token: s.token })).status, 403);

  const r = await h.api('POST', '/api/auth/instructor-signup', { body: { name: 'Joshua Rapheal', email: 'joshua@eartokeys.com', password: 'password123', specialty: 'Classical piano' }, headers: { 'X-Auth-Mode': 'bearer' } });
  assert.equal(r.status, 201);
  const pending = await h.api('GET', '/api/studio/lessons', { token: r.body.token });
  assert.equal(pending.status, 403);
  assert.match(pending.body.error.message, /awaiting approval/);

  const admin = await h.makeUser('admin@eartokeys.com', 'admin');
  assert.equal((await h.api('POST', `/api/admin/instructors/${r.body.user.id}/approve`, { token: admin.token, body: {} })).status, 200);
  assert.equal((await h.api('GET', '/api/studio/lessons', { token: r.body.token })).status, 200);
});

test('password reset signs out every session and the link works once', async (t) => {
  const h = await boot(); t.after(h.close);
  const s = await h.signup('lola@mail.com');
  assert.equal((await h.api('POST', '/api/auth/forgot-password', { body: { email: 'ghost@mail.com' } })).status, 200, 'same answer for unknown email');
  await h.api('POST', '/api/auth/forgot-password', { body: { email: 'lola@mail.com' } });
  const mail = h.ctx.db.prepare("SELECT body FROM outbox WHERE to_email='lola@mail.com' AND subject LIKE 'Reset%'").get();
  const token = /token=([\w-]+)/.exec(mail.body)[1];
  assert.equal((await h.api('POST', '/api/auth/reset-password', { body: { token, password: 'brandnewpass1' } })).status, 200);
  assert.equal((await h.api('POST', '/api/auth/reset-password', { body: { token, password: 'anotherpass12' } })).status, 400, 'link is single-use');
  assert.equal((await h.api('GET', '/api/me', { token: s.token })).status, 401, 'old session is gone');
  assert.equal((await h.api('POST', '/api/auth/login', { body: { email: 'lola@mail.com', password: 'brandnewpass1' } })).status, 200);
});

test('rate limiting blocks brute force and can be switched off', async (t) => {
  const h = await boot({ rateLimit: true }); t.after(h.close);
  let last;
  for (let i = 0; i < 9; i++) last = await h.api('POST', '/api/auth/login', { body: { email: 'victim@mail.com', password: 'guess-number-' + i } });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});

test('browser requests from unknown origins cannot change data (CSRF)', async (t) => {
  const h = await boot(); t.after(h.close);
  const r = await h.api('POST', '/api/auth/login', { body: { email: 'a@b.com', password: 'password123' }, headers: { Origin: 'http://evil.test' } });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'bad_origin');
  const good = await h.api('POST', '/api/auth/login', { body: { email: 'a@b.com', password: 'password123' }, headers: { Origin: 'http://front.test' } });
  assert.equal(good.status, 401);
  assert.equal(good.headers.get('access-control-allow-origin'), 'http://front.test');
});
