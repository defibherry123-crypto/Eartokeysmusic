'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { HttpError, signToken, verifyToken } = require('./util');

const lessonsDir = (ctx) => path.join(ctx.config.storageDir, 'lessons');
const resourcesDir = (ctx) => path.join(ctx.config.storageDir, 'resources');

/** Short-lived link that is only valid for one person and one lesson. */
function makeStreamToken(ctx, userId, lessonId) {
  const ttl = ctx.config.streamTtlSec * 1000;
  const exp = ctx.now() + ttl;
  return { token: signToken(ctx.config.secret, { u: userId, l: lessonId, exp }), expiresAt: exp };
}
const readStreamToken = (ctx, token) => verifyToken(ctx.config.secret, token, ctx.now());

const VIDEO_TYPES = {
  'video/mp4': { ext: 'mp4', ok: (b) => b.toString('latin1', 4, 8) === 'ftyp' },
  'video/quicktime': { ext: 'mov', ok: (b) => b.toString('latin1', 4, 8) === 'ftyp' },
  'video/webm': { ext: 'webm', ok: (b) => b.readUInt32BE(0) === 0x1a45dfa3 },
};
const FILE_TYPES = {
  'application/pdf': { ext: 'pdf', ok: (b) => b.toString('latin1', 0, 4) === '%PDF' },
  'audio/midi': { ext: 'mid', ok: (b) => b.toString('latin1', 0, 4) === 'MThd' },
  'audio/x-midi': { ext: 'mid', ok: (b) => b.toString('latin1', 0, 4) === 'MThd' },
  'application/zip': { ext: 'zip', ok: (b) => b.toString('latin1', 0, 2) === 'PK' },
};

/**
 * Save an upload straight to disk (never held in memory), enforcing the size cap WHILE streaming.
 * The first bytes are checked against the declared type so a renamed .exe can't be stored as a "video".
 */
async function saveUpload(ctx, req, { id, dir, types, max, oldFile }) {
  const ctype = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const t = types[ctype];
  if (!t) throw new HttpError(415, 'unsupported_media', `Unsupported file type. Allowed: ${Object.keys(types).join(', ')} (set the Content-Type header).`);
  const declared = Number(req.headers['content-length']);
  if (!declared) throw new HttpError(411, 'length_required', 'Content-Length header is required.');
  if (declared > max) throw new HttpError(413, 'file_too_large', `File is larger than the ${Math.round(max / 1048576)} MB limit.`);

  await fsp.mkdir(dir, { recursive: true });
  const finalName = `${id}-${crypto.randomBytes(8).toString('hex')}.${t.ext}`;
  const tmp = path.join(dir, finalName + '.part');
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (bytes > max) return cb(new HttpError(413, 'file_too_large', 'File exceeds the size limit.'));
      cb(null, chunk);
    },
  });
  try {
    await pipeline(req, limiter, fs.createWriteStream(tmp));
    const fh = await fsp.open(tmp, 'r');
    const head = Buffer.alloc(12);
    await fh.read(head, 0, 12, 0);
    await fh.close();
    if (bytes < 12 || !t.ok(head)) throw new HttpError(415, 'invalid_file', 'The file content does not match its type.');
    await fsp.rename(tmp, path.join(dir, finalName));
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
  if (oldFile) await fsp.rm(path.join(dir, path.basename(oldFile)), { force: true });
  return { fileName: finalName, mime: ctype, size: bytes };
}

/** Serve a file with HTTP Range support so the player can seek. */
function sendFile(req, res, filePath, mime, { inline = true, downloadName } = {}) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { throw new HttpError(404, 'file_missing', 'File not found.'); }
  const size = stat.size;
  const headers = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': inline ? 'inline' : `attachment; filename="${(downloadName || path.basename(filePath)).replace(/[^\w.\- ]/g, '_')}"`,
  };
  let start = 0, end = size - 1, status = 200;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (m[1] === '' && m[2] === '')) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); }
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(Number(m[2]), size - 1); }
    if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

module.exports = { VIDEO_TYPES, FILE_TYPES, lessonsDir, resourcesDir, makeStreamToken, readStreamToken, saveUpload, sendFile };
