'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { boot, DAY, SECRET } = require('./helpers');

test('server decides prices; annual is 20% off', async (t) => {
  const h = await boot(); t.after(h.close);
  const plans = (await h.api('GET', '/api/plans')).body;
  const mid = plans.plans.find((p) => p.name === 'Intermediate');
  assert.deepEqual([mid.monthly.ngn, mid.annual.ngn, mid.annual.usd], [7900, 75840, 125]);
  const s = await h.signup();
  const c = await h.api('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'Intermediate', billing: 'annual', amount: 1, price: 1 } });
  assert.equal(c.body.amount, 75840, 'client-supplied amounts are ignored');
  assert.equal(h.gateway.txns.get(c.body.reference).amountMinor, 7584000);
  assert.equal((await h.api('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'Platinum', billing: 'monthly' } })).body.error.code, 'invalid_plan');
});

test('full lifecycle: active -> 7-day grace -> expired -> renew', async (t) => {
  const h = await boot(); t.after(h.close);
  const s = await h.signup();
  let r = await h.pay(s, 'Intermediate');
  assert.equal(r.body.payment.status, 'success');
  assert.equal(r.body.access.state, 'active');
  assert.equal(r.body.access.plan, 'Intermediate');

  const end = r.body.access.periodEnd;
  h.clock.t = end - 1000; // one second before the period ends: still active
  assert.equal((await h.api('GET', '/api/me', { token: s.token })).body.access.state, 'active');

  h.clock.t = end + 1000; // just after: grace starts with the full 7 days
  let a = (await h.api('GET', '/api/me', { token: s.token })).body.access;
  assert.equal(a.state, 'grace');
  assert.equal(a.graceDaysLeft, 7);

  h.clock.t = end + 5 * DAY; // 5 days in: 2 days left
  a = (await h.api('GET', '/api/me', { token: s.token })).body.access;
  assert.equal(a.state, 'grace');
  assert.equal(a.graceDaysLeft, 2);

  h.clock.t = end + 7 * DAY + 1000; // grace is over: locked
  a = (await h.api('GET', '/api/me', { token: s.token })).body.access;
  assert.equal(a.state, 'expired');

  r = await h.pay(s, 'Beginner'); // renew after lapse: new period starts NOW
  assert.equal(r.body.access.state, 'active');
  assert.equal(r.body.access.plan, 'Beginner');
  assert.ok(r.body.access.periodEnd > h.clock.t + 27 * DAY);
});

test('renewing early extends from the end of the current period; a plan switch applies next period', async (t) => {
  const h = await boot(); t.after(h.close);
  const s = await h.signup();
  const first = (await h.pay(s, 'Beginner')).body.access;
  h.clock.t += 10 * DAY;
  const second = (await h.pay(s, 'Advanced')).body.access;
  assert.equal(second.plan, 'Beginner', 'still on the paid plan until it ends');
  assert.equal(second.next.plan, 'Advanced');
  assert.equal(second.next.startsAt, first.periodEnd, 'no overlap and no lost days');
  h.clock.t = first.periodEnd + 1000;
  const a = (await h.api('GET', '/api/me', { token: s.token })).body.access;
  assert.equal(a.state, 'active');
  assert.equal(a.plan, 'Advanced');
});

test('verification is idempotent: verify + callback + webhook x2 = exactly one period', async (t) => {
  const h = await boot(); t.after(h.close);
  const s = await h.signup();
  const c = (await h.api('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'Beginner', billing: 'monthly' } })).body;
  h.gateway.markPaid(c.reference);
  const body = JSON.stringify({ event: 'charge.success', data: { reference: c.reference } });
  const sig = crypto.createHmac('sha512', SECRET).update(body).digest('hex');
  for (let i = 0; i < 2; i++) assert.equal((await h.api('POST', '/api/webhooks/paystack', { raw: body, headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig } })).status, 200);
  await h.api('POST', '/api/billing/verify', { token: s.token, body: { reference: c.reference } });
  const cb = await h.api('GET', `/api/billing/callback?reference=${c.reference}`);
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), 'http://front.test/#/success');
  assert.equal(h.ctx.db.prepare('SELECT COUNT(*) n FROM periods WHERE user_id=?').get(s.id).n, 1);
});

test('webhook rejects forged or unsigned requests', async (t) => {
  const h = await boot(); t.after(h.close);
  const s = await h.signup();
  const c = (await h.api('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'Beginner', billing: 'monthly' } })).body;
  h.gateway.markPaid(c.reference);
  const body = JSON.stringify({ event: 'charge.success', data: { reference: c.reference } });
  const forged = crypto.createHmac('sha512', 'wrong-key').update(body).digest('hex');
  assert.equal((await h.api('POST', '/api/webhooks/paystack', { raw: body, headers: { 'Content-Type': 'application/json', 'x-paystack-signature': forged } })).status, 401);
  assert.equal((await h.api('POST', '/api/webhooks/paystack', { raw: body, headers: { 'Content-Type': 'application/json' } })).status, 401);
  assert.equal(h.ctx.db.prepare('SELECT COUNT(*) n FROM periods').get().n, 0, 'nothing granted');
});

test('a payment for the wrong amount never grants access', async (t) => {
  const h = await boot(); t.after(h.close);
  const s = await h.signup();
  const c = (await h.api('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'Advanced', billing: 'monthly' } })).body;
  h.gateway.markPaid(c.reference, { amountMinor: 590000 }); // paid the Beginner price
  const r = await h.api('POST', '/api/billing/verify', { token: s.token, body: { reference: c.reference } });
  assert.equal(r.body.payment.status, 'failed');
  assert.equal(r.body.access.state, 'none');
  assert.equal(h.ctx.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='payment_amount_mismatch'").get().n, 1);
});

test('failed payments grant nothing, and users cannot verify someone else\'s payment', async (t) => {
  const h = await boot(); t.after(h.close);
  const a = await h.signup(), b = await h.signup();
  const c = (await h.api('POST', '/api/billing/checkout', { token: a.token, body: { plan: 'Beginner', billing: 'monthly' } })).body;
  assert.equal((await h.api('POST', '/api/billing/verify', { token: b.token, body: { reference: c.reference } })).status, 404);
  h.gateway.markFailed(c.reference);
  const r = await h.api('GET', `/api/billing/payments/${c.reference}`, { token: a.token });
  assert.equal(r.body.payment.status, 'failed');
  assert.equal(r.body.access.state, 'none');
  assert.equal((await h.api('GET', '/api/billing/callback?reference=' + c.reference)).headers.get('location'), 'http://front.test/#/failed');
});

test('admin can grant manual access (e.g. confirmed bank transfer) and it is audited', async (t) => {
  const h = await boot(); t.after(h.close);
  const s = await h.signup(), admin = await h.makeUser('admin@x.com', 'admin');
  const r = await h.api('POST', `/api/admin/users/${s.id}/grant`, { token: admin.token, body: { plan: 'Intermediate', billing: 'monthly', note: 'Bank transfer ref 123' } });
  assert.equal(r.body.access.state, 'active');
  assert.equal(h.ctx.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='grant_access'").get().n, 1);
  const ov = (await h.api('GET', '/api/admin/overview', { token: admin.token })).body;
  assert.equal(ov.subscriptions.active, 1);
});
