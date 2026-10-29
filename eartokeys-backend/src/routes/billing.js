'use strict';
const { HttpError, bad, oneOf } = require('../util');
const { startCheckout, verifyAndSettle, webhookSignatureOk } = require('../payments');
const { getAccess } = require('../access');
const { MockGateway } = require('../gateway');
const { reply, HANDLED } = require('../http');

const payView = (p) => ({ reference: p.reference, plan: p.plan, billing: p.billing, amount: p.amount_minor / 100, currency: p.currency, status: p.status, channel: p.channel, paidAt: p.paid_at, createdAt: p.created_at });

module.exports = (r) => {
  // Step 1: create a payment. Returns the Paystack page to send the customer to.
  r.post('/api/billing/checkout', { auth: 'verified', limit: { name: 'checkout', max: 20, windowMs: 3600000 } }, async ({ ctx, user, body }) => {
    if (user.role !== 'student') throw new HttpError(403, 'students_only', 'Only student accounts can subscribe.');
    const method = body.method === undefined ? 'paystack' : oneOf(body.method, ['card', 'paystack', 'bank_transfer'], 'method');
    return startCheckout(ctx, user, { plan: body.plan, billing: body.billing || 'monthly', method });
  });

  // Step 2a: Paystack sends the customer back here. We ask Paystack what really happened, then redirect to the site.
  r.get('/api/billing/callback', { auth: 'none' }, async ({ ctx, query }) => {
    const ref = String(query.reference || query.trxref || '');
    const to = (hash) => reply(302, null, { Location: `${ctx.config.frontendUrl}/#/${hash}` });
    if (!ref) return to('failed');
    try {
      const res = await verifyAndSettle(ctx, ref);
      const s = res.payment.status;
      return to(s === 'success' ? 'success' : s === 'pending' ? `securing?reference=${encodeURIComponent(ref)}` : 'failed');
    } catch (e) {
      return to(e instanceof HttpError && e.status === 404 ? 'failed' : `securing?reference=${encodeURIComponent(ref)}`);
    }
  });

  // Step 2b: the website can also ask directly ("Securing your seat..." screen).
  r.post('/api/billing/verify', { limit: { name: 'verifypay', max: 30, windowMs: 60000 } }, async ({ ctx, user, body }) => {
    const ref = String(body.reference || '');
    const own = ctx.db.prepare('SELECT 1 FROM payments WHERE reference=? AND user_id=?').get(ref, user.id);
    if (!own) throw new HttpError(404, 'payment_not_found', 'Payment not found.');
    const res = await verifyAndSettle(ctx, ref);
    return { payment: payView(res.payment), access: getAccess(ctx, user.id) };
  });

  // Polling endpoint for the "Securing your seat..." screen. Checks with Paystack only while still pending.
  r.get('/api/billing/payments/:reference', { limit: { name: 'paypoll', max: 60, windowMs: 60000 } }, async ({ ctx, user, params }) => {
    let p = ctx.db.prepare('SELECT * FROM payments WHERE reference=? AND user_id=?').get(params.reference, user.id);
    if (!p) throw new HttpError(404, 'payment_not_found', 'Payment not found.');
    if (p.status === 'pending') {
      try { p = (await verifyAndSettle(ctx, p.reference)).payment; } catch (e) { if (!(e instanceof HttpError)) throw e; }
    }
    return { payment: payView(p), access: getAccess(ctx, user.id) };
  });

  r.get('/api/billing/history', ({ ctx, user }) => ({
    access: getAccess(ctx, user.id),
    payments: ctx.db.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 50').all(user.id).map(payView),
  }));

  // Step 2c: Paystack's server-to-server webhook. Signature is checked on the RAW body,
  // and we still re-verify with Paystack instead of trusting the payload.
  r.post('/api/webhooks/paystack', { auth: 'none', raw: true, noCsrf: true }, async ({ ctx, req, raw }) => {
    if (!ctx.config.paystackSecret) throw new HttpError(503, 'webhook_disabled', 'Webhook is not configured.');
    if (!webhookSignatureOk(ctx.config.paystackSecret, raw, req.headers['x-paystack-signature'])) throw new HttpError(401, 'bad_signature', 'Invalid signature.');
    let evt;
    try { evt = JSON.parse(raw.toString('utf8')); } catch { throw bad('invalid_json', 'Invalid JSON.'); }
    const ref = evt && evt.data && evt.data.reference;
    if (typeof evt.event === 'string' && evt.event.startsWith('charge.') && ref) {
      try { await verifyAndSettle(ctx, ref); }
      catch (e) { if (!(e instanceof HttpError && e.status === 404)) throw e; } // unknown reference: ignore. Real errors -> 5xx so Paystack retries.
    }
    return { received: true };
  });

  // Development only: a fake "Paystack page" so you can click through the whole flow without real money.
  r.get('/api/dev/mock-pay', { auth: 'none' }, ({ ctx, query, res }) => {
    if (ctx.config.isProd || !(ctx.gateway instanceof MockGateway)) throw new HttpError(404, 'not_found', 'Not found.');
    const ref = String(query.reference || '');
    if (!ctx.gateway.txns.has(ref)) throw new HttpError(404, 'transaction_not_found', 'Unknown reference.');
    if (query.outcome === 'success') ctx.gateway.markPaid(ref);
    else if (query.outcome === 'failed') ctx.gateway.markFailed(ref);
    else {
      const e = encodeURIComponent(ref);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<body style="font-family:sans-serif;max-width:420px;margin:60px auto"><h2>Fake Paystack (dev only)</h2><p>Reference ${ref}</p>
        <a href="?reference=${e}&outcome=success"><button>Pay successfully</button></a> <a href="?reference=${e}&outcome=failed"><button>Fail payment</button></a></body>`);
      return HANDLED;
    }
    return reply(302, null, { Location: `${ctx.config.baseUrl}/api/billing/callback?reference=${encodeURIComponent(ref)}` });
  });
};
