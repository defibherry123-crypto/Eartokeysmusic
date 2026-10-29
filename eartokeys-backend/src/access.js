'use strict';
const { DAY } = require('./util');
const { levelIndex } = require('./plans');

/**
 * A user's entitlement is derived from the `periods` table (paid blocks of time) and the clock.
 * Nothing is stored as "status", so it can never drift out of date.
 *
 *   active  : now is inside a paid period
 *   grace   : the last period ended less than GRACE_DAYS ago -> still has access, with a warning
 *   expired : grace is over -> locked
 *   none    : never subscribed
 */
function getAccess(ctx, userId) {
  const now = ctx.now();
  const { db, config } = ctx;
  const cur = db.prepare('SELECT * FROM periods WHERE user_id=? AND starts_at<=? AND ends_at>? ORDER BY ends_at DESC LIMIT 1').get(userId, now, now);
  const upcoming = db.prepare('SELECT plan, billing, starts_at FROM periods WHERE user_id=? AND starts_at>? ORDER BY starts_at LIMIT 1').get(userId, now);
  const next = upcoming ? { plan: upcoming.plan, billing: upcoming.billing, startsAt: upcoming.starts_at } : null;

  if (cur) {
    return { state: 'active', plan: cur.plan, billing: cur.billing, periodEnd: cur.ends_at, renewsInDays: Math.max(0, Math.ceil((cur.ends_at - now) / DAY)), next };
  }
  const last = db.prepare('SELECT * FROM periods WHERE user_id=? AND ends_at<=? ORDER BY ends_at DESC LIMIT 1').get(userId, now);
  if (!last) return { state: 'none', plan: null, next };

  const graceEndsAt = last.ends_at + config.graceDays * DAY;
  if (now < graceEndsAt) {
    return { state: 'grace', plan: last.plan, billing: last.billing, periodEnd: last.ends_at, graceEndsAt, graceDaysLeft: Math.ceil((graceEndsAt - now) / DAY), next };
  }
  return { state: 'expired', plan: last.plan, billing: last.billing, periodEnd: last.ends_at, graceEndsAt, next };
}

/** Can this person watch this lesson right now? Returns { ok:true } or { ok:false, reason }. */
function canWatch(user, access, lesson) {
  if (!user) return { ok: false, reason: 'login_required' };
  if (user.role === 'admin' || user.role === 'instructor') return { ok: true };
  if (lesson.is_free || lesson.free_preview) return { ok: true };
  if (access.state === 'none') return { ok: false, reason: 'subscription_required' };
  if (access.state === 'expired') return { ok: false, reason: 'subscription_expired' };
  if (levelIndex(lesson.level) > levelIndex(access.plan)) return { ok: false, reason: 'plan_too_low' };
  return { ok: true };
}

/** Add a paid block of time. Starts when the current one ends (or now, if lapsed). */
function grantPeriod(ctx, { userId, plan, billing, months, paymentId = null, source = 'payment' }) {
  const { addMonths } = require('./util');
  const now = ctx.now();
  const latest = ctx.db.prepare('SELECT MAX(ends_at) m FROM periods WHERE user_id=?').get(userId).m || 0;
  const start = Math.max(now, latest);
  const end = addMonths(start, months);
  ctx.db.prepare('INSERT INTO periods (user_id,plan,billing,starts_at,ends_at,payment_id,source,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(userId, plan, billing, start, end, paymentId, source, now);
  return { start, end };
}

module.exports = { getAccess, canWatch, grantPeriod };
