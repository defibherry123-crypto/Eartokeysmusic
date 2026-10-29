'use strict';
const { HttpError, bad, int, oneOf, text, DAY } = require('../util');
const { LEVELS, price } = require('../plans');
const { getAccess, grantPeriod } = require('../access');
const { publicUser } = require('../auth');
const { tx } = require('../db');
const { saveUpload, FILE_TYPES, resourcesDir } = require('../media');

const audit = (ctx, actor, action, target, detail) =>
  ctx.db.prepare('INSERT INTO audit_log (actor_id,action,target,detail,created_at) VALUES (?,?,?,?,?)').run(actor.id, action, String(target), detail ? JSON.stringify(detail) : null, ctx.now());

module.exports = (r) => {
  const A = { auth: 'admin' };

  r.get('/api/admin/overview', A, ({ ctx }) => {
    const now = ctx.now(), grace = ctx.config.graceDays * DAY;
    const ends = ctx.db.prepare('SELECT MAX(ends_at) e FROM periods GROUP BY user_id').all().map((x) => x.e);
    const count = (sql, ...a) => ctx.db.prepare(sql).get(...a).n;
    return {
      users: { students: count("SELECT COUNT(*) n FROM users WHERE role='student'"), instructors: count("SELECT COUNT(*) n FROM users WHERE role='instructor'"), pendingInstructors: count("SELECT COUNT(*) n FROM users WHERE role='instructor' AND instructor_approved=0") },
      subscriptions: { active: ends.filter((e) => e > now).length, grace: ends.filter((e) => e <= now && now < e + grace).length, expired: ends.filter((e) => now >= e + grace).length },
      revenue30d: { amount: count("SELECT COALESCE(SUM(amount_minor),0) n FROM payments WHERE status='success' AND paid_at>?", now - 30 * DAY) / 100, currency: 'NGN' },
      lessons: { total: count('SELECT COUNT(*) n FROM lessons'), published: count('SELECT COUNT(*) n FROM lessons WHERE published=1'), awaitingVideo: count('SELECT COUNT(*) n FROM lessons WHERE file_name IS NULL') },
      openSupport: count("SELECT COUNT(*) n FROM support_messages WHERE status='open'"),
    };
  });

  r.get('/api/admin/users', A, ({ ctx, query }) => {
    const q = `%${String(query.q || '').toLowerCase()}%`;
    const rows = ctx.db.prepare('SELECT * FROM users WHERE lower(name) LIKE ? OR lower(email) LIKE ? ORDER BY id DESC LIMIT 200').all(q, q);
    return { users: rows.map((u) => ({ ...publicUser(u), disabled: !!u.disabled, specialty: u.specialty, access: getAccess(ctx, u.id) })) };
  });

  // For manual cases, e.g. a customer paid by direct bank transfer outside Paystack and you confirmed it in your bank app.
  r.post('/api/admin/users/:id/grant', A, ({ ctx, user, params, body }) => {
    const target = ctx.db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(int(params.id, 'user_id', { min: 1 }));
    if (!target) throw new HttpError(404, 'user_not_found', 'Student not found.');
    const plan = oneOf(body.plan, LEVELS, 'plan');
    const billing = oneOf(body.billing || 'monthly', ['monthly', 'annual'], 'billing');
    const months = body.months !== undefined ? int(body.months, 'months', { min: 1, max: 24 }) : price(plan, billing).months;
    const note = text(body.note ?? '', 'note', { min: 0, max: 300 });
    const g = tx(ctx.db, () => { const x = grantPeriod(ctx, { userId: target.id, plan, billing, months, source: 'admin' }); audit(ctx, user, 'grant_access', target.id, { plan, billing, months, note }); return x; });
    return { ok: true, startsAt: g.start, endsAt: g.end, access: getAccess(ctx, target.id) };
  });

  r.post('/api/admin/users/:id/disable', A, ({ ctx, user, params, body }) => {
    const id = int(params.id, 'user_id', { min: 1 });
    if (id === user.id) throw bad('cannot_disable_self', 'You cannot disable your own account.');
    const off = body.disabled === false ? 0 : 1;
    ctx.db.prepare('UPDATE users SET disabled=? WHERE id=?').run(off, id);
    if (off) ctx.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    audit(ctx, user, off ? 'disable_user' : 'enable_user', id);
    return { ok: true };
  });

  r.post('/api/admin/instructors/:id/approve', A, ({ ctx, user, params, body }) => {
    const id = int(params.id, 'user_id', { min: 1 });
    const t = ctx.db.prepare("SELECT * FROM users WHERE id=? AND role='instructor'").get(id);
    if (!t) throw new HttpError(404, 'user_not_found', 'Instructor not found.');
    ctx.db.prepare('UPDATE users SET instructor_approved=? WHERE id=?').run(body.approved === false ? 0 : 1, id);
    audit(ctx, user, 'approve_instructor', id, { approved: body.approved !== false });
    return { ok: true };
  });

  r.get('/api/admin/payments', A, ({ ctx }) => ({
    payments: ctx.db.prepare('SELECT p.*, u.email FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 200').all()
      .map((p) => ({ reference: p.reference, email: p.email, plan: p.plan, billing: p.billing, amount: p.amount_minor / 100, currency: p.currency, status: p.status, failureReason: p.failure_reason, paidAt: p.paid_at, createdAt: p.created_at })),
  }));

  r.get('/api/admin/support', A, ({ ctx }) => ({ messages: ctx.db.prepare('SELECT * FROM support_messages ORDER BY id DESC LIMIT 200').all() }));
  r.post('/api/admin/support/:id/close', A, ({ ctx, params }) => { ctx.db.prepare("UPDATE support_messages SET status='closed' WHERE id=?").run(int(params.id, 'id', { min: 1 })); return { ok: true }; });

  // ----- resources library -----
  r.post('/api/admin/resources', A, ({ ctx, body }) => {
    const id = Number(ctx.db.prepare('INSERT INTO resources (title,subtitle,kind,category,min_level,featured,published) VALUES (?,?,?,?,?,?,1)').run(
      text(body.title, 'title', { max: 150 }), text(body.subtitle ?? '', 'subtitle', { min: 0, max: 200 }), oneOf(body.kind || 'PDF', ['PDF', 'MIDI', 'DOC'], 'kind'),
      oneOf(body.category || 'Sheet Music', ['Sheet Music', 'MIDI Files'], 'category'), body.minLevel ? oneOf(body.minLevel, LEVELS, 'minLevel') : null, body.featured ? 1 : 0).lastInsertRowid);
    return { id };
  });
  r.put('/api/admin/resources/:id/file', { auth: 'admin', stream: true }, async ({ ctx, req, params }) => {
    const x = ctx.db.prepare('SELECT * FROM resources WHERE id=?').get(int(params.id, 'resource_id', { min: 1 }));
    if (!x) throw new HttpError(404, 'resource_not_found', 'Resource not found.');
    const f = await saveUpload(ctx, req, { id: x.id, dir: resourcesDir(ctx), types: FILE_TYPES, max: 100 * 1048576, oldFile: x.file_name });
    ctx.db.prepare('UPDATE resources SET file_name=? WHERE id=?').run(f.fileName, x.id);
    return { ok: true, sizeBytes: f.size };
  });
};
