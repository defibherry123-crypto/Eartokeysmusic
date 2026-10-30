'use strict';
const { HttpError, bad, text, int, slugify } = require('../util');
const { LEVELS, PLANS, catalogue, levelIndex } = require('../plans');
const { getAccess, canWatch } = require('../access');
const { makeStreamToken, readStreamToken, sendFile, lessonsDir, resourcesDir } = require('../media');
const { HANDLED } = require('../http');
const path = require('node:path');

const courseView = (c) => ({
  id: c.id, slug: c.slug, title: c.title, level: c.level, hours: c.hours, students: c.students,
  instructorName: c.instructor_name || 'Joshua Rapheal', rating: c.rating, ratingCount: c.rating_count, description: c.description,
  isFree: !!c.is_free,
  priceUsd: c.is_free ? 0 : PLANS[c.level].usd,
  priceNgn: c.is_free ? 0 : PLANS[c.level].ngn,
  ...(c.lesson_count !== undefined ? { lessonCount: c.lesson_count } : {}),
});

const LESSON_SQL = `SELECT l.*, (SELECT json_extract(details,'$.description') FROM lesson_settings WHERE lesson_id=l.id) AS description, c.level, c.is_free, c.title AS course_title, c.slug AS course_slug, c.published AS course_published
                    FROM lessons l JOIN courses c ON c.id=l.course_id`;

function lessonView(l, user, access, progress) {
  const d = canWatch(user, access, l);
  return {
    id: l.id, title: l.title, description:l.description||'', module: l.module, position: l.position, durationSec: l.duration_sec,
    level: l.level, courseId: l.course_id, courseTitle: l.course_title, courseSlug: l.course_slug,
    freePreview: !!(l.free_preview || l.is_free), ready: !!l.file_name,
    locked: !d.ok, lockedReason: d.ok ? null : d.reason,
    ...(progress ? { positionSec: progress.position_sec, completed: !!progress.completed, percent: l.duration_sec ? Math.min(100, Math.round(100 * (progress.completed ? l.duration_sec : progress.position_sec) / l.duration_sec)) : (progress.completed ? 100 : 0) } : {}),
  };
}
const noAccess = () => ({ state: 'none', plan: null });

module.exports = (r) => {
  r.get('/api/health', { auth: 'none' }, ({ ctx }) => ({ ok: true, time: ctx.now() }));

  r.get('/api/plans', { auth: 'none' }, ({ ctx }) => ({ plans: catalogue(), graceDays: ctx.config.graceDays, annualDiscount: '20%' }));

  // ---------- public catalogue ----------
  r.get('/api/courses', { auth: 'none' }, ({ ctx, query }) => {
    let rows = ctx.db.prepare(`SELECT c.*, (SELECT name FROM users WHERE id=c.created_by) AS instructor_name, (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id AND l.published=1) AS lesson_count FROM courses c WHERE c.published=1`).all();
    if (query.level && LEVELS.includes(query.level)) rows = rows.filter((c) => c.level === query.level);
    const q = String(query.q || '').toLowerCase().trim();
    if (q) rows = rows.filter((c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
    if (query.sort === 'price') rows.sort((a, b) => (a.is_free ? -1 : levelIndex(a.level)) - (b.is_free ? -1 : levelIndex(b.level)));
    else rows.sort((a, b) => b.students - a.students);
    return { courses: rows.map(courseView) };
  });

  r.get('/api/courses/:slug', { auth: 'optional' }, ({ ctx, params, user }) => {
    const c = ctx.db.prepare('SELECT c.*, (SELECT name FROM users WHERE id=c.created_by) AS instructor_name FROM courses c WHERE slug=? AND published=1').get(params.slug);
    if (!c) throw new HttpError(404, 'course_not_found', 'Course not found.');
    const access = user ? getAccess(ctx, user.id) : noAccess();
    const prog = new Map(user ? ctx.db.prepare('SELECT * FROM progress WHERE user_id=?').all(user.id).map((p) => [p.lesson_id, p]) : []);
    const lessons = ctx.db.prepare(`${LESSON_SQL} WHERE l.course_id=? AND l.published=1 ORDER BY l.position, l.id`).all(c.id);
    const modules = [];
    for (const l of lessons) {
      let m = modules.find((x) => x.title === l.module);
      if (!m) modules.push((m = { title: l.module, lessons: [] }));
      m.lessons.push(lessonView(l, user, access, prog.get(l.id)));
    }
    return { course: courseView(c), modules, access: user ? access : null };
  });

  // ---------- student lesson library ----------
  r.get('/api/lessons', { auth: 'optional' }, ({ ctx, user, query }) => {
    const access = user ? getAccess(ctx, user.id) : noAccess();
    const prog = new Map(user ? ctx.db.prepare('SELECT * FROM progress WHERE user_id=?').all(user.id).map((p) => [p.lesson_id, p]) : []);
    let rows = ctx.db.prepare(`${LESSON_SQL} WHERE l.published=1 AND c.published=1 ORDER BY c.id, l.position, l.id`).all();
    if (query.level && LEVELS.includes(query.level)) rows = rows.filter((l) => l.level === query.level);
    if (query.course) rows = rows.filter((l) => l.course_slug === query.course);
    const q = String(query.q || '').toLowerCase().trim();
    if (q) rows = rows.filter((l) => l.title.toLowerCase().includes(q));
    return { access: user ? access : null, lessons: rows.map((l) => lessonView(l, user, access, prog.get(l.id))) };
  });

  const getLesson = (ctx, id, user) => {
    const l = ctx.db.prepare(`${LESSON_SQL} WHERE l.id=?`).get(int(id, 'lesson_id', { min: 1 }));
    const staff = user && (user.role === 'admin' || user.role === 'instructor');
    if (!l || (!staff && !(l.published && l.course_published))) throw new HttpError(404, 'lesson_not_found', 'Lesson not found.');
    return l;
  };

  r.get('/api/lessons/:id', ({ ctx, user, params }) => {
    const l = getLesson(ctx, params.id, user);
    const access = getAccess(ctx, user.id);
    const prog = ctx.db.prepare('SELECT * FROM progress WHERE user_id=? AND lesson_id=?').get(user.id, l.id);
    const siblings = ctx.db.prepare(`${LESSON_SQL} WHERE l.course_id=? AND l.published=1 ORDER BY l.position, l.id`).all(l.course_id);
    const allProg = new Map(ctx.db.prepare('SELECT * FROM progress WHERE user_id=?').all(user.id).map((p) => [p.lesson_id, p]));
    return { lesson: lessonView(l, user, access, prog), course: { id: l.course_id, title: l.course_title, slug: l.course_slug }, siblings: siblings.map((s) => lessonView(s, user, access, allProg.get(s.id))), access };
  });

  // Step 1: the browser asks for a link. We check subscription + plan level and hand back a short-lived signed URL.
  r.post('/api/lessons/:id/stream-url', { limit: { name: 'streamurl', max: 120, windowMs: 60000 } }, ({ ctx, user, params }) => {
    const l = getLesson(ctx, params.id, user);
    const d = canWatch(user, getAccess(ctx, user.id), l);
    if (!d.ok) throw new HttpError(403, d.reason, lockedMessage(d.reason, l));
    if (!l.file_name) throw new HttpError(409, 'video_not_uploaded', 'This lesson\'s video is not available yet.');
    const { token, expiresAt } = makeStreamToken(ctx, user.id, l.id);
    const prog = ctx.db.prepare('SELECT position_sec FROM progress WHERE user_id=? AND lesson_id=?').get(user.id, l.id);
    return { url: `${ctx.config.baseUrl}/api/stream/${token}`, expiresAt, watermark: user.email, resumeAt: prog ? prog.position_sec : 0, mime: l.mime };
  });

  // Step 2: the <video> tag plays that URL. We re-check the subscription on EVERY request,
  // so a lapsed account is cut off even if it still holds an unexpired link.
  r.get('/api/stream/:token', { auth: 'none' }, ({ ctx, req, res, params }) => {
    const t = readStreamToken(ctx, params.token);
    if (!t) throw new HttpError(403, 'invalid_stream_link', 'This video link is invalid or has expired. Reload the lesson.');
    const user = ctx.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(t.u);
    const l = user && ctx.db.prepare(`${LESSON_SQL} WHERE l.id=?`).get(t.l);
    if (!l || !l.file_name) throw new HttpError(404, 'lesson_not_found', 'Lesson not found.');
    const d = canWatch(user, getAccess(ctx, user.id), l);
    if (!d.ok) throw new HttpError(403, d.reason, lockedMessage(d.reason, l));
    sendFile(req, res, path.join(lessonsDir(ctx), path.basename(l.file_name)), l.mime || 'video/mp4');
    return HANDLED;
  });

  r.put('/api/lessons/:id/progress', ({ ctx, user, params, body }) => {
    const l = getLesson(ctx, params.id, user);
    const d = canWatch(user, getAccess(ctx, user.id), l);
    if (!d.ok) throw new HttpError(403, d.reason, lockedMessage(d.reason, l));
    const cap = l.duration_sec || 86400;
    const pos = body.position === undefined ? 0 : Math.min(int(Math.floor(Number(body.position)), 'position', { min: 0 }), cap);
    const done = body.completed === true ? 1 : 0;
    ctx.db.prepare(`INSERT INTO progress (user_id,lesson_id,position_sec,completed,updated_at) VALUES (?,?,?,?,?)
                    ON CONFLICT(user_id,lesson_id) DO UPDATE SET
                      position_sec = CASE WHEN ? THEN position_sec ELSE excluded.position_sec END,
                      completed = MAX(completed, excluded.completed), updated_at = excluded.updated_at`)
      .run(user.id, l.id, pos, done, ctx.now(), body.position === undefined ? 1 : 0);
    return { ok: true };
  });

  r.get('/api/progress', ({ ctx, user }) => {
    const rows = ctx.db.prepare(`SELECT p.*, l.title, l.duration_sec, c.title AS course_title, c.level FROM progress p
                                 JOIN lessons l ON l.id=p.lesson_id JOIN courses c ON c.id=l.course_id WHERE p.user_id=? ORDER BY p.updated_at DESC`).all(user.id);
    return {
      stats: { completed: rows.filter((x) => x.completed).length, started: rows.length, plan: getAccess(ctx, user.id).plan },
      lessons: rows.map((x) => ({ lessonId: x.lesson_id, title: x.title, course: x.course_title, level: x.level, positionSec: x.position_sec, completed: !!x.completed,
        percent: x.completed ? 100 : x.duration_sec ? Math.min(100, Math.round(100 * x.position_sec / x.duration_sec)) : 0, updatedAt: x.updated_at })),
    };
  });

  // ---------- resources library ----------
  r.get('/api/resources', { auth: 'none' }, ({ ctx, query }) => {
    let rows = ctx.db.prepare('SELECT * FROM resources WHERE published=1 ORDER BY featured DESC, id').all();
    if (query.category && query.category !== 'All Resources') rows = rows.filter((x) => x.category === query.category);
    const q = String(query.q || '').toLowerCase().trim();
    if (q) rows = rows.filter((x) => (x.title + ' ' + x.subtitle).toLowerCase().includes(q));
    return { resources: rows.map((x) => ({ id: x.id, title: x.title, subtitle: x.subtitle, kind: x.kind, category: x.category, featured: !!x.featured, minLevel: x.min_level, available: !!x.file_name })) };
  });

  r.get('/api/resources/:id/download', ({ ctx, req, res, user, params }) => {
    const x = ctx.db.prepare('SELECT * FROM resources WHERE id=? AND published=1').get(int(params.id, 'resource_id', { min: 1 }));
    if (!x) throw new HttpError(404, 'resource_not_found', 'Resource not found.');
    if (x.min_level && user.role === 'student') {
      const a = getAccess(ctx, user.id);
      if (!['active', 'grace'].includes(a.state)) throw new HttpError(403, 'subscription_required', 'Subscribe to download this resource.');
      if (levelIndex(x.min_level) > levelIndex(a.plan)) throw new HttpError(403, 'plan_too_low', `This resource needs the ${x.min_level} plan or higher.`);
    }
    if (!x.file_name) throw new HttpError(404, 'file_not_available_yet', 'This file has not been uploaded yet.');
    const ext = path.extname(x.file_name);
    const mime = { '.pdf': 'application/pdf', '.mid': 'audio/midi', '.zip': 'application/zip' }[ext] || 'application/octet-stream';
    sendFile(req, res, path.join(resourcesDir(ctx), path.basename(x.file_name)), mime, { inline: false, downloadName: x.title + ext });
    return HANDLED;
  });

  // ---------- newsletter opt-ins ----------
  r.post('/api/newsletter', { auth: 'none', limit: { name: 'newsletter', max: 10, windowMs: 3600000 } }, ({ ctx, body }) => {
    const { email } = require('../util');
    const address = email(body.email);
    ctx.db.prepare('INSERT INTO newsletter_subscribers (email,created_at) VALUES (?,?) ON CONFLICT(email) DO NOTHING').run(address, ctx.now());
    return { ok: true };
  });

  // ---------- support form ----------
  r.post('/api/support', { auth: 'optional', limit: { name: 'support', max: 5, windowMs: 3600000 } }, ({ ctx, user, body }) => {
    const { email } = require('../util');
    ctx.db.prepare('INSERT INTO support_messages (user_id,name,email,subject,message,created_at) VALUES (?,?,?,?,?,?)')
      .run(user ? user.id : null, text(body.name, 'name', { max: 100 }), email(body.email), text(body.subject, 'subject', { max: 150 }), text(body.message, 'message', { min: 5, max: 5000 }), ctx.now());
    return { ok: true, message: 'Thanks, we will get back to you by email.' };
  });
};

function lockedMessage(reason, l) {
  return {
    login_required: 'Sign in to watch.',
    subscription_required: 'Choose a plan to start watching.',
    subscription_expired: 'Your subscription has expired. Renew to keep watching.',
    plan_too_low: `Your plan does not include ${l.level} lessons. Upgrade to watch.`,
  }[reason] || 'Access denied.';
}
