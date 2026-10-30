'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');
test('newsletter signup normalizes and stores opt-ins without duplicates', async t => {
  const h = await boot(); t.after(h.close);
  for (const email of [' Ada@Example.Test ', 'ada@example.test']) {
    const r = await h.api('POST', '/api/newsletter', { body: { email } });
    assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true });
  }
  const rows = h.ctx.db.prepare('SELECT * FROM newsletter_subscribers').all();
  assert.equal(rows.length, 1); assert.equal(rows[0].email, 'ada@example.test'); assert.equal(rows[0].created_at, h.clock.t);
});
test('invalid newsletter addresses are rejected without adding a subscriber', async t => {
  const h = await boot(); t.after(h.close);
  for (const email of ['', 'invalid', 'has space@example.test', 'a'.repeat(255) + '@example.test']) {
    assert.equal((await h.api('POST', '/api/newsletter', { body: { email } })).status, 400);
  }
  assert.equal(h.ctx.db.prepare('SELECT COUNT(*) n FROM newsletter_subscribers').get().n, 0);
});
test('subscriber email list is admin-only and bounded to the latest 200', async t => {
  const h = await boot(); t.after(h.close); const student = await h.signup();
  assert.equal((await h.api('GET', '/api/admin/newsletter')).status, 401);
  assert.equal((await h.api('GET', '/api/admin/newsletter', { token: student.token })).status, 403);
  const admin = await h.makeUser('newsletter-admin@test.test', 'admin');
  const insert = h.ctx.db.prepare('INSERT INTO newsletter_subscribers VALUES (?,?)');
  for (let i = 0; i < 205; i++) insert.run(`subscriber${i}@example.test`, i);
  const r = await h.api('GET', '/api/admin/newsletter', { token: admin.token });
  assert.equal(r.status, 200); assert.equal(r.body.subscribers.length, 200);
  assert.equal(r.body.subscribers[0].email, 'subscriber204@example.test');
  assert.equal(r.body.subscribers.at(-1).email, 'subscriber5@example.test');
});
test('newsletter endpoint rate-limits repeated requests', async t => {
  const h = await boot({ rateLimit: true }); t.after(h.close);
  for (let i = 0; i < 10; i++) assert.equal((await h.api('POST', '/api/newsletter', { body: { email: `rate${i}@example.test` } })).status, 200);
  const r = await h.api('POST', '/api/newsletter', { body: { email: 'over-limit@example.test' } });
  assert.equal(r.status, 429); assert.ok(r.headers.get('retry-after'));
  assert.equal(h.ctx.db.prepare('SELECT COUNT(*) n FROM newsletter_subscribers').get().n, 10);
});
