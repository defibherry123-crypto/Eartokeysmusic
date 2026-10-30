'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { HttpError, int, oneOf } = require('../util');
const { saveUpload, sendFile } = require('../media');
const { HANDLED } = require('../http');

const { TESTIMONIALS, videoUrl } = require('../testimonials');
const FEATURES = { chopin: 'Chopin’s Complete Nocturnes', anatomy: 'The Anatomy of a Grand Piano', drills: 'Daily Finger Independence', 'about-piano': 'About page piano', 'team-joshua': 'Joshua Rapheal — team portrait', 'team-elina': 'Elina Chris — team portrait', 'team-marcus': 'Marcus Ubon — team portrait', 'team-unwana': 'Unwana Berry — team portrait', 'founder-banner': 'Founder page banner', 'founder-practice': 'Founder page piano practice', 'founder-studio': 'Founder page teaching studio', 'terms-piano': 'Terms page piano', 'privacy-studio': 'Privacy page studio', ...TESTIMONIALS };
const TYPES = {
  'image/png': { ext: 'png', ok: b => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
  'image/jpeg': { ext: 'jpg', ok: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', ok: b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
};
const dir = ctx => path.join(ctx.config.storageDir, 'images');
const imageRow = (ctx, kind, target) => ctx.db.prepare('SELECT * FROM catalogue_images WHERE kind=? AND target=?').get(kind, String(target));
const imageUrl = (row, admin = false) => row ? `/api/${admin ? 'admin/' : ''}images/${row.kind}/${row.target}?v=${encodeURIComponent(row.file_name)}` : null;
function targetFor(ctx, params, publicOnly = false) {
  const kind = oneOf(params.kind, ['course', 'resource', 'feature'], 'kind');
  if (kind === 'feature') return { kind, target: oneOf(params.target, Object.keys(FEATURES), 'target'), title: FEATURES[params.target] };
  const target = int(params.target, 'target', { min: 1 });
  const table = kind === 'course' ? 'courses' : 'resources';
  const row = ctx.db.prepare(`SELECT * FROM ${table} WHERE id=?${publicOnly ? ' AND published=1' : ''}`).get(target);
  if (!row) throw new HttpError(404, 'target_not_found', 'Course or resource not found.');
  return { kind, target: String(target), title: row.title, ...(kind === 'course' ? { slug: row.slug } : {}) };
}
function targets(ctx, publicOnly = false) {
  return [...Object.entries(FEATURES).map(([target, title]) => ({ kind: 'feature', target, title })),
    ...['course', 'resource'].flatMap(kind => ctx.db.prepare(`SELECT * FROM ${kind === 'course' ? 'courses' : 'resources'}${publicOnly ? ' WHERE published=1' : ''} ORDER BY id`).all()
      .map(row => ({ kind, target: String(row.id), title: row.title, ...(kind === 'course' ? { slug: row.slug } : {}) })))];
}
module.exports = r => {
  r.get('/api/images', { auth: 'none' }, ({ ctx }) => ({ images: targets(ctx, true).flatMap(t => {
    const row = imageRow(ctx, t.kind, t.target);
    const video = t.kind === 'feature' ? videoUrl(ctx, t.target) : null;
    return row || video ? [{ ...t, imageUrl: imageUrl(row), videoUrl: video }] : [];
  }) }));
  r.get('/api/admin/images', { auth: 'admin' }, ({ ctx }) => ({ images: targets(ctx).map(t => ({ ...t, imageUrl: imageUrl(imageRow(ctx, t.kind, t.target), true), videoUrl: t.kind === 'feature' ? videoUrl(ctx, t.target) : null })) }));
  const serve = (admin) => ({ ctx, req, res, params }) => {
    const t = targetFor(ctx, params, !admin), row = imageRow(ctx, t.kind, t.target);
    if (!row) throw new HttpError(404, 'image_not_found', 'Image not uploaded yet.');
    sendFile(req, res, path.join(dir(ctx), path.basename(row.file_name)), row.mime);
    return HANDLED;
  };
  r.get('/api/images/:kind/:target', { auth: 'none' }, serve(false));
  r.get('/api/admin/images/:kind/:target', { auth: 'admin' }, serve(true));
  r.put('/api/admin/images/:kind/:target', { auth: 'admin', stream: true }, async ({ ctx, req, params }) => {
    const t = targetFor(ctx, params), old = imageRow(ctx, t.kind, t.target);
    const f = await saveUpload(ctx, req, { id: `${t.kind}-${t.target}`, dir: dir(ctx), types: TYPES, max: 5 * 1048576 });
    try {
      ctx.db.prepare('INSERT INTO catalogue_images (kind,target,file_name,mime,size_bytes) VALUES (?,?,?,?,?) ON CONFLICT(kind,target) DO UPDATE SET file_name=excluded.file_name,mime=excluded.mime,size_bytes=excluded.size_bytes')
        .run(t.kind, t.target, f.fileName, f.mime, f.size);
    } catch (e) { await fs.rm(path.join(dir(ctx), f.fileName), { force: true }); throw e; }
    if (old) await fs.rm(path.join(dir(ctx), path.basename(old.file_name)), { force: true });
    return { ok: true, imageUrl: imageUrl(imageRow(ctx, t.kind, t.target), true) };
  });
  r.delete('/api/admin/images/:kind/:target', { auth: 'admin' }, async ({ ctx, params }) => {
    const t = targetFor(ctx, params), old = imageRow(ctx, t.kind, t.target);
    ctx.db.prepare('DELETE FROM catalogue_images WHERE kind=? AND target=?').run(t.kind, t.target);
    if (old) await fs.rm(path.join(dir(ctx), path.basename(old.file_name)), { force: true });
    return { ok: true };
  });
};
