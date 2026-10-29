'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createApp } = require('../src/app');
const { openDb } = require('../src/db');
const { MockGateway } = require('../src/gateway');
const { seed } = require('../src/seed');
const { hashPassword } = require('../src/auth');

const DAY = 86400000;
const SECRET = 'sk_test_secret';

async function boot(opts = {}) {
  const clock = { t: Date.UTC(2026, 9, 10, 12, 0, 0) };
  const gateway = new MockGateway('http://gateway.test');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'etk-'));
  const app = createApp({
    db: openDb(':memory:'), now: () => clock.t, gateway, quiet: true,
    config: { rateLimit: !!opts.rateLimit, sessionDays: 400, storageDir: dir, paystackSecret: SECRET, frontendUrl: 'http://front.test', allowedOrigins: ['http://front.test'], publicDir: '/nonexistent', maxUploadBytes: opts.maxUpload || 5 * 1048576 },
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  app.ctx.config.baseUrl = base;
  await seed(app.ctx, { log() {} });

  async function api(method, url, { body, token, headers = {}, raw, bearerMode } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    let payload = raw;
    if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers: h, body: payload, redirect: 'manual' });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : null;
    return { status: res.status, body: data, headers: res.headers, res };
  }
  const lastCode = (email) => /\b(\d{6})\b/.exec(app.ctx.db.prepare('SELECT body FROM outbox WHERE to_email=? ORDER BY id DESC').get(email).body)[1];

  async function signup(email = `s${Math.random().toString(36).slice(2, 8)}@mail.com`, { verify = true, name = 'Test Student' } = {}) {
    const r = await api('POST', '/api/auth/signup', { body: { name, email, password: 'password123' }, headers: { 'X-Auth-Mode': 'bearer' } });
    if (r.status !== 201) throw new Error('signup failed ' + JSON.stringify(r.body));
    const token = r.body.token;
    if (verify) { const v = await api('POST', '/api/auth/verify-email', { token, body: { code: lastCode(email) } }); if (v.status !== 200) throw new Error('verify failed'); }
    return { token, email, id: r.body.user.id };
  }
  async function pay(t, plan = 'Intermediate', billing = 'monthly') {
    const c = await api('POST', '/api/billing/checkout', { token: t.token, body: { plan, billing } });
    if (c.status !== 200) throw new Error('checkout failed ' + JSON.stringify(c.body));
    gateway.markPaid(c.body.reference);
    const v = await api('POST', '/api/billing/verify', { token: t.token, body: { reference: c.body.reference } });
    return { ref: c.body.reference, ...v };
  }
  async function makeUser(email, role, { approved = 1 } = {}) {
    const id = Number(app.ctx.db.prepare('INSERT INTO users (name,email,password_hash,role,instructor_approved,email_verified,created_at) VALUES (?,?,?,?,?,1,?)')
      .run(role, email, await hashPassword('password123'), role, approved, clock.t).lastInsertRowid);
    const r = await api('POST', '/api/auth/login', { body: { email, password: 'password123' }, headers: { 'X-Auth-Mode': 'bearer' } });
    return { id, token: r.body.token, email };
  }
  const mp4 = (n = 4000) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), crypto.randomBytes(n)]);
  const lessonBy = (title) => app.ctx.db.prepare('SELECT * FROM lessons WHERE title=?').get(title);
  async function putVideo(token, lessonId, buf = mp4()) {
    return api('PUT', `/api/studio/lessons/${lessonId}/file`, { token, raw: buf, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length) } });
  }
  const close = async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { app, ctx: app.ctx, clock, gateway, api, base, signup, pay, makeUser, mp4, lessonBy, putVideo, lastCode, close, DAY, SECRET };
}
module.exports = { boot, DAY, SECRET };
