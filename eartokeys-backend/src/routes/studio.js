'use strict';
const { HttpError, text, int, oneOf, slugify } = require('../util');
const { LEVELS } = require('../plans');
const { saveUpload, VIDEO_TYPES, lessonsDir } = require('../media');

/** Instructors manage their own content; admins manage everything. */
const own = (user, row) => user.role === 'admin' || row.created_by === user.id;

module.exports = (r) => {
  const getCourse = (ctx, user, id) => {
    const c = ctx.db.prepare('SELECT * FROM courses WHERE id=?').get(int(id, 'course_id', { min: 1 }));
    if (!c || !own(user, c)) throw new HttpError(404, 'course_not_found', 'Course not found.');
    return c;
  };
  const getLesson = (ctx, user, id) => {
    const l = ctx.db.prepare('SELECT * FROM lessons WHERE id=?').get(int(id, 'lesson_id', { min: 1 }));
    if (!l || !own(user, l)) throw new HttpError(404, 'lesson_not_found', 'Lesson not found.');
    return l;
  };
  const lv = (l) => ({ id: l.id, courseId: l.course_id, module: l.module, position: l.position, title: l.title, durationSec: l.duration_sec, published: !!l.published, hasVideo: !!l.file_name, sizeBytes: l.size_bytes, freePreview: !!l.free_preview });
  const cv = (c) => ({ id: c.id, slug: c.slug, title: c.title, level: c.level, hours: c.hours, description: c.description, published: !!c.published, isFree: !!c.is_free });

  // ----- courses -----
  r.get('/api/studio/courses', { auth: 'instructor' }, ({ ctx, user }) =>
    ({ courses: (user.role === 'admin' ? ctx.db.prepare('SELECT * FROM courses ORDER BY id').all() : ctx.db.prepare('SELECT * FROM courses WHERE created_by=? ORDER BY id').all(user.id)).map(cv) }));

  r.post('/api/studio/courses', { auth: 'instructor' }, ({ ctx, user, body }) => {
    const title = text(body.title, 'title', { max: 120 });
    let slug = slugify(title) || 'course';
    if (ctx.db.prepare('SELECT 1 FROM courses WHERE slug=?').get(slug)) slug += '-' + Date.now().toString(36);
    const id = Number(ctx.db.prepare('INSERT INTO courses (slug,title,level,hours,description,is_free,published,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(slug, title, oneOf(body.level, LEVELS, 'level'), int(body.hours ?? 0, 'hours', { max: 1000 }), text(body.description ?? '', 'description', { min: 0, max: 2000 }), user.role === 'admin' && body.isFree ? 1 : 0, 0, user.id, ctx.now()).lastInsertRowid);
    return { course: cv(ctx.db.prepare('SELECT * FROM courses WHERE id=?').get(id)) };
  });

  r.patch('/api/studio/courses/:id', { auth: 'instructor' }, ({ ctx, user, params, body }) => {
    const c = getCourse(ctx, user, params.id);
    ctx.db.prepare('UPDATE courses SET title=?, level=?, hours=?, description=?, published=? WHERE id=?').run(
      body.title !== undefined ? text(body.title, 'title', { max: 120 }) : c.title,
      body.level !== undefined ? oneOf(body.level, LEVELS, 'level') : c.level,
      body.hours !== undefined ? int(body.hours, 'hours', { max: 1000 }) : c.hours,
      body.description !== undefined ? text(body.description, 'description', { min: 0, max: 2000 }) : c.description,
      body.published !== undefined ? (body.published ? 1 : 0) : c.published, c.id);
    return { course: cv(ctx.db.prepare('SELECT * FROM courses WHERE id=?').get(c.id)) };
  });

  // ----- lessons / video studio -----
  r.get('/api/studio/lessons', { auth: 'instructor' }, ({ ctx, user }) =>
    ({ lessons: (user.role === 'admin' ? ctx.db.prepare('SELECT * FROM lessons ORDER BY course_id, position, id').all() : ctx.db.prepare('SELECT * FROM lessons WHERE created_by=? ORDER BY course_id, position, id').all(user.id)).map(lv) }));

  r.post('/api/studio/lessons', { auth: 'instructor' }, ({ ctx, user, body }) => {
    const course = getCourse(ctx, user, body.courseId);
    const pos = ctx.db.prepare('SELECT COALESCE(MAX(position),0)+1 p FROM lessons WHERE course_id=?').get(course.id).p;
    const id = Number(ctx.db.prepare('INSERT INTO lessons (course_id,module,position,title,duration_sec,free_preview,published,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(course.id, text(body.module ?? 'Module 1', 'module', { max: 120 }), pos, text(body.title, 'title', { max: 150 }), int(body.durationSec ?? 0, 'durationSec', { max: 36000 }), body.freePreview ? 1 : 0, 0, user.id, ctx.now()).lastInsertRowid);
    return { lesson: lv(ctx.db.prepare('SELECT * FROM lessons WHERE id=?').get(id)) };
  });

  r.patch('/api/studio/lessons/:id', { auth: 'instructor' }, ({ ctx, user, params, body }) => {
    const l = getLesson(ctx, user, params.id);
    const publish = body.published !== undefined ? (body.published ? 1 : 0) : l.published;
    if (publish && !l.file_name) throw new HttpError(409, 'video_not_uploaded', 'Upload the video before publishing this lesson.');
    ctx.db.prepare('UPDATE lessons SET title=?, module=?, position=?, duration_sec=?, free_preview=?, published=? WHERE id=?').run(
      body.title !== undefined ? text(body.title, 'title', { max: 150 }) : l.title,
      body.module !== undefined ? text(body.module, 'module', { max: 120 }) : l.module,
      body.position !== undefined ? int(body.position, 'position', { max: 10000 }) : l.position,
      body.durationSec !== undefined ? int(body.durationSec, 'durationSec', { max: 36000 }) : l.duration_sec,
      body.freePreview !== undefined ? (body.freePreview ? 1 : 0) : l.free_preview, publish, l.id);
    return { lesson: lv(ctx.db.prepare('SELECT * FROM lessons WHERE id=?').get(l.id)) };
  });

  // Raw video body (Content-Type: video/mp4) streamed to disk. Works with fetch/XHR and large files.
  r.put('/api/studio/lessons/:id/file', { auth: 'instructor', stream: true, limit: { name: 'upload', max: 30, windowMs: 3600000 } }, async ({ ctx, req, user, params }) => {
    const l = getLesson(ctx, user, params.id);
    const f = await saveUpload(ctx, req, { id: l.id, dir: lessonsDir(ctx), types: VIDEO_TYPES, max: ctx.config.maxUploadBytes, oldFile: l.file_name });
    ctx.db.prepare('UPDATE lessons SET file_name=?, mime=?, size_bytes=? WHERE id=?').run(f.fileName, f.mime, f.size, l.id);
    return { lesson: lv(ctx.db.prepare('SELECT * FROM lessons WHERE id=?').get(l.id)) };
  });

  r.delete('/api/studio/lessons/:id', { auth: 'instructor' }, async ({ ctx, user, params }) => {
    const l = getLesson(ctx, user, params.id);
    ctx.db.prepare('DELETE FROM lessons WHERE id=?').run(l.id);
    if (l.file_name) await require('node:fs/promises').rm(require('node:path').join(lessonsDir(ctx), require('node:path').basename(l.file_name)), { force: true });
    return { ok: true };
  });
};
