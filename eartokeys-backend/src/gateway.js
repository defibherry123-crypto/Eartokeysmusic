'use strict';
const { HttpError } = require('./util');

/**
 * A gateway has two methods:
 *   initialize({ email, amountMinor, currency, reference, callbackUrl, channels, metadata }) -> { authorizationUrl }
 *   verify(reference) -> { status: 'success'|'failed'|'abandoned'|'pending', amountMinor, currency, channel, paidAt }
 */
class PaystackGateway {
  constructor(secretKey) { this.key = secretKey; }

  async #call(method, path, body) {
    let res;
    try {
      res = await fetch('https://api.paystack.co' + path, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      throw new HttpError(502, 'gateway_unreachable', 'Could not reach the payment provider. Please try again.');
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.status !== true) {
      throw new HttpError(502, 'gateway_error', (json && json.message) || 'Payment provider error.');
    }
    return json.data;
  }

  async initialize({ email, amountMinor, currency, reference, callbackUrl, channels, metadata }) {
    const d = await this.#call('POST', '/transaction/initialize', {
      email, amount: amountMinor, currency, reference, callback_url: callbackUrl, channels, metadata,
    });
    return { authorizationUrl: d.authorization_url };
  }

  async verify(reference) {
    const d = await this.#call('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    const map = { success: 'success', failed: 'failed', reversed: 'failed', abandoned: 'abandoned' };
    return {
      status: map[d.status] || 'pending',
      amountMinor: d.amount,
      currency: d.currency,
      channel: d.channel,
      paidAt: d.paid_at ? Date.parse(d.paid_at) : null,
    };
  }
}

/** Fake gateway for development and tests (no real money, no network). */
class MockGateway {
  constructor(baseUrl) { this.baseUrl = baseUrl; this.txns = new Map(); }
  async initialize({ reference, amountMinor, currency }) {
    this.txns.set(reference, { status: 'pending', amountMinor, currency, channel: 'card' });
    return { authorizationUrl: `${this.baseUrl}/api/dev/mock-pay?reference=${encodeURIComponent(reference)}` };
  }
  async verify(reference) {
    const t = this.txns.get(reference);
    if (!t) throw new HttpError(404, 'transaction_not_found', 'Transaction not found.');
    return { ...t, paidAt: t.status === 'success' ? Date.now() : null };
  }
  // test/dev helpers
  markPaid(reference, over = {}) { Object.assign(this.txns.get(reference), { status: 'success' }, over); }
  markFailed(reference) { this.txns.get(reference).status = 'failed'; }
}

module.exports = { PaystackGateway, MockGateway };
