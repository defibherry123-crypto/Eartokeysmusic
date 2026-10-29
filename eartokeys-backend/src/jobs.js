'use strict';
const { DAY } = require('./util');

/**
 * Housekeeping + renewal reminders. Safe to run as often as you like (hourly by default):
 * every reminder is recorded in `notifications` with a UNIQUE key, so nobody gets the same email twice.
 */
async function runMaintenance(ctx) {
  const { db, config } = ctx;
  const now = ctx.now();
  const sent = { renew_soon: 0, grace_started: 0, lock_tomorrow: 0, access_locked: 0 };

  const rows = db.prepare(`SELECT p.user_id, MAX(p.ends_at) AS ends_at, u.email, u.name, u.disabled
                           FROM periods p JOIN users u ON u.id=p.user_id GROUP BY p.user_id`).all();
  const fire = async (r, kind, subject, text) => {
    const res = db.prepare('INSERT OR IGNORE INTO notifications (user_id,kind,period_end,created_at) VALUES (?,?,?,?)').run(r.user_id, kind, r.ends_at, now);
    if (res.changes === 1) { await ctx.mailer.send({ to: r.email, subject, text }); sent[kind]++; }
  };
  for (const r of rows) {
    if (r.disabled) continue;
    const first = r.name.split(' ')[0];
    const graceEnd = r.ends_at + config.graceDays * DAY;
    const link = `${config.frontendUrl}/#/plans`;
    if (now < r.ends_at && r.ends_at - now <= 3 * DAY) {
      await fire(r, 'renew_soon', 'Your EarToKeysMusic plan renews soon', `Hi ${first}, your plan ends in ${Math.ceil((r.ends_at - now) / DAY)} day(s). Renew to keep learning: ${link}`);
    } else if (now >= r.ends_at && now < graceEnd) {
      await fire(r, 'grace_started', 'Your plan has expired. You have a grace period', `Hi ${first}, your plan expired but you still have access for ${config.graceDays} days. Renew now: ${link}`);
      if (graceEnd - now <= DAY) await fire(r, 'lock_tomorrow', 'Your access locks within 24 hours', `Hi ${first}, your grace period ends within a day. Renew to avoid losing access: ${link}`);
    } else if (now >= graceEnd && now - graceEnd <= 2 * DAY) {
      await fire(r, 'access_locked', 'Your EarToKeysMusic access is paused', `Hi ${first}, your access is paused. Renew any time to restore it: ${link}`);
    }
  }
  const stale = db.prepare("UPDATE payments SET status='abandoned', failure_reason='timeout' WHERE status='pending' AND created_at<?").run(now - DAY).changes;
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now);
  db.prepare('DELETE FROM email_codes WHERE expires_at<?').run(now - DAY);
  return { sent, abandonedPayments: Number(stale) };
}

function startScheduler(ctx, everyMs = 3600000) {
  const t = setInterval(() => runMaintenance(ctx).catch((e) => console.error('[jobs]', e)), everyMs);
  t.unref();
  setTimeout(() => runMaintenance(ctx).catch((e) => console.error('[jobs]', e)), 5000).unref();
  return t;
}
module.exports = { runMaintenance, startScheduler };
