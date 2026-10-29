'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { oneOf, HttpError } = require('../util');
const { saveUpload, sendFile, VIDEO_TYPES } = require('../media');
const { HANDLED } = require('../http');
const { TESTIMONIALS, videoRow, videoUrl } = require('../testimonials');
const dir = ctx => path.join(ctx.config.storageDir, 'testimonials');
const target = params => oneOf(params.target, Object.keys(TESTIMONIALS), 'target');
module.exports = r => {
  r.get('/api/testimonials/:target/video', { auth: 'none' }, ({ ctx, req, res, params }) => {
    const row = videoRow(ctx, target(params));
    if (!row) throw new HttpError(404, 'video_not_found', 'Performance video has not been uploaded yet.');
    sendFile(req, res, path.join(dir(ctx), path.basename(row.file_name)), row.mime);
    return HANDLED;
  });
  r.put('/api/admin/testimonials/:target/video', { auth: 'admin', stream: true }, async ({ ctx, req, params }) => {
    const key = target(params), old = videoRow(ctx, key);
    const f = await saveUpload(ctx, req, { id: key, dir: dir(ctx), types: VIDEO_TYPES, max: 100 * 1048576 });
    try {
      ctx.db.prepare('INSERT INTO testimonial_videos (target,file_name,mime,size_bytes) VALUES (?,?,?,?) ON CONFLICT(target) DO UPDATE SET file_name=excluded.file_name,mime=excluded.mime,size_bytes=excluded.size_bytes').run(key, f.fileName, f.mime, f.size);
    } catch (e) { await fs.rm(path.join(dir(ctx), f.fileName), { force: true }); throw e; }
    if (old) await fs.rm(path.join(dir(ctx), path.basename(old.file_name)), { force: true });
    return { ok: true, videoUrl: videoUrl(ctx, key) };
  });
  r.delete('/api/admin/testimonials/:target/video', { auth: 'admin' }, async ({ ctx, params }) => {
    const key = target(params), old = videoRow(ctx, key);
    ctx.db.prepare('DELETE FROM testimonial_videos WHERE target=?').run(key);
    if (old) await fs.rm(path.join(dir(ctx), path.basename(old.file_name)), { force: true });
    return { ok: true };
  });
};
