'use strict';
const crypto = require('node:crypto');
const { HttpError, bad, oneOf, safeEqual } = require('./util');
const { tx } = require('./db');
const { price, PLANS } = require('./plans');
const { grantPeriod, getAccess } = require('./access');

const CHANNELS = { card: ['card'], bank_transfer: ['bank_transfer'], paystack: undefined };

/** Start a payment. The client only says WHAT it wants; the server decides the price. */
async function startCheckout(ctx, user, { plan, billing, method }) {
  if (!PLANS[plan]) throw bad('invalid_plan', 'Unknown plan.');
  oneOf(billing, ['monthly', 'annual'], 'billing');
  const p = price(plan, billing);
  const amountMinor = p.ngn * 100;
  const reference = 'etk-' + crypto.randomBytes(12).toString('hex');
  const channels = CHANNELS[method];

  ctx.db.prepare('INSERT INTO payments (reference,user_id,plan,billing,amount_minor,currency,channel,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(reference, user.id, plan, billing, amountMinor, 'NGN', method || null, 'pending', ctx.now());

  try {
    const init = await ctx.gateway.initialize({
      email: user.email, amountMinor, currency: 'NGN', reference,
      callbackUrl: `${ctx.config.baseUrl}/api/billing/callback`,
      channels, metadata: { userId: user.id, plan, billing },
    });
    return { reference, authorizationUrl: init.authorizationUrl, amount: p.ngn, currency: 'NGN', plan, billing };
  } catch (e) {
    ctx.db.prepare("UPDATE payments SET status='failed', failure_reason='gateway_init_failed' WHERE reference=?").run(reference);
    throw e;
  }
}

/**
 * Apply a gateway verdict to a payment. This is the ONLY place access is granted for money.
 * It is idempotent: the webhook, the redirect callback and the "verify" button can all call it,
 * in any order or many times, and the customer still gets exactly one period.
 */
function settle(ctx, reference, v) {
  return tx(ctx.db, () => {
    const pay = ctx.db.prepare('SELECT * FROM payments WHERE reference=?').get(reference);
    if (!pay) return null;
    if (pay.status === 'success') return { payment: pay, changed: false };
    if (pay.failure_reason === 'amount_mismatch') return { payment: pay, changed: false };

    if (v.status === 'success') {
      if (v.amountMinor !== pay.amount_minor || v.currency !== pay.currency) {
        // Someone paid a different amount than we asked for: never grant access automatically.
        ctx.db.prepare("UPDATE payments SET status='failed', failure_reason='amount_mismatch' WHERE id=?").run(pay.id);
        ctx.db.prepare('INSERT INTO audit_log (actor_id,action,target,detail,created_at) VALUES (?,?,?,?,?)')
          .run(null, 'payment_amount_mismatch', reference, JSON.stringify({ expected: pay.amount_minor, got: v.amountMinor, currency: v.currency }), ctx.now());
        return { payment: { ...pay, status: 'failed', failure_reason: 'amount_mismatch' }, changed: true };
      }
      ctx.db.prepare("UPDATE payments SET status='success', failure_reason=NULL, paid_at=?, channel=COALESCE(?,channel) WHERE id=?")
        .run(v.paidAt || ctx.now(), v.channel || null, pay.id);
      grantPeriod(ctx, { userId: pay.user_id, plan: pay.plan, billing: pay.billing, months: price(pay.plan, pay.billing).months, paymentId: pay.id });
      return { payment: { ...pay, status: 'success' }, changed: true };
    }
    if (v.status === 'failed' || v.status === 'abandoned') {
      ctx.db.prepare('UPDATE payments SET status=?, failure_reason=? WHERE id=?').run(v.status, `gateway_${v.status}`, pay.id);
      return { payment: { ...pay, status: v.status }, changed: true };
    }
    return { payment: pay, changed: false }; // still pending
  });
}

/** Ask the gateway for the truth, then settle. Never trusts anything the browser sent. */
async function verifyAndSettle(ctx, reference) {
  const exists = ctx.db.prepare('SELECT 1 FROM payments WHERE reference=?').get(reference);
  if (!exists) throw new HttpError(404, 'payment_not_found', 'Payment not found.');
  const v = await ctx.gateway.verify(reference);
  return settle(ctx, reference, v);
}

function webhookSignatureOk(secret, rawBody, signature) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return safeEqual(expected, String(signature));
}

module.exports = { startCheckout, settle, verifyAndSettle, webhookSignatureOk, getAccess };
