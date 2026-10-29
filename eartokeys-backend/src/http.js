'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { HttpError } = require('./util');
const { authenticate } = require('./auth');

class Reply { constructor(status, body, headers = {}) { this.status = status; this.body = body; this.headers = headers; } }
const reply = (status, body, headers) => new Reply(status, body, headers);
const HANDLED = Symbol('handled');

function createRouter() {
  const routes = [];
  const add = (method) => (pattern, opts, handler) => {
    if (typeof opts === 'function') { handler = opts; opts = {}; }
    routes.push({ method, parts: pattern.split('/').filter(Boolean), opts: { auth: 'user', ...opts }, handler });
  };
  return {
    get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'),
    match(method, pathname) {
      const segs = pathname.split('/').filter(Boolean);
      let pathMatched = false;
      for (const r of routes) {
        if (r.parts.length !== segs.length) continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < segs.length && ok; i++) {
          if (r.parts[i].startsWith(':')) { try { params[r.parts[i].slice(1)] = decodeURIComponent(segs[i]); } catch { ok = false; } }
          else if (r.parts[i] !== segs[i]) ok = false;
        }
        if (!ok) continue;
        pathMatched = true;
        if (r.method === method || (method === 'HEAD' && r.method === 'GET')) return { route: r, params };
      }
      return { route: null, pathMatched };
    },
  };
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { reject(new HttpError(413, 'body_too_large', 'Request body too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

function serveStatic(ctx, req, res, pathname) {
  const root = path.resolve(ctx.config.publicDir);
  if (!fs.existsSync(root)) return false;
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return false; }
  let file = path.resolve(root, '.' + path.sep + rel);
  if (file !== root && !file.startsWith(root + path.sep)) return false; // path traversal guard
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { file = path.join(root, 'index.html'); }
  if (!fs.existsSync(file)) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  return true;
}

function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(data), ...headers });
  res.end(data);
}

function clientIp(ctx, req) {
  if (ctx.config.trustProxy) {
    const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (f) return f;
  }
  return req.socket.remoteAddress || 'unknown';
}

async function dispatch(ctx, router, req, res) {
  const url = new URL(req.url, 'http://localhost');
  req.ip = clientIp(ctx, req);
  const origin = req.headers.origin;
  const allowed = ctx.config.allowedOrigins.concat(ctx.config.baseUrl);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (ctx.config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (origin && ctx.config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Mode',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }

  const { route, params, pathMatched } = router.match(req.method, url.pathname);
  if (!route) {
    if (!url.pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD') && serveStatic(ctx, req, res, url.pathname)) return;
    throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'method_not_allowed' : 'not_found', pathMatched ? 'Method not allowed.' : 'Not found.');
  }
  const { opts } = route;

  const wait = ctx.limiter.check('ip:' + req.ip, 300, 60000);
  if (wait) throw new HttpError(429, 'rate_limited', 'Too many requests. Slow down.', { retryAfter: wait });
  if (opts.limit) {
    const w = ctx.limiter.check(`${opts.limit.name}:${req.ip}`, opts.limit.max, opts.limit.windowMs);
    if (w) throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait and try again.', { retryAfter: w });
  }

  let user = null;
  if (opts.auth !== 'none') {
    user = authenticate(ctx, req);
    if (opts.auth !== 'optional') {
      if (!user) throw new HttpError(401, 'unauthenticated', 'Please sign in.');
      if (opts.auth === 'verified' && !user.email_verified) throw new HttpError(403, 'email_not_verified', 'Verify your email first.');
      if (opts.auth === 'instructor' && !((user.role === 'instructor' && user.instructor_approved) || user.role === 'admin'))
        throw new HttpError(403, 'forbidden', user.role === 'instructor' ? 'Your instructor application is awaiting approval.' : 'Instructors only.');
      if (opts.auth === 'admin' && user.role !== 'admin') throw new HttpError(403, 'forbidden', 'Admins only.');
    }
  }

  // CSRF: a browser request that changes data must come from one of our own origins.
  const unsafe = !['GET', 'HEAD'].includes(req.method);
  if (unsafe && origin && !opts.noCsrf && !allowed.includes(origin)) throw new HttpError(403, 'bad_origin', 'Request origin not allowed.');

  let body = {}, raw = null;
  if (unsafe && !opts.stream) {
    raw = await readBody(req, opts.raw ? 1048576 : 102400);
    if (raw.length) {
      if (!/application\/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'unsupported_media', 'Send JSON with Content-Type: application/json.');
      try { body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON.'); }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object.');
    }
  }

  const out = await route.handler({ ctx, req, res, params, query: Object.fromEntries(url.searchParams), body, raw, user, ip: req.ip });
  if (out === HANDLED || res.writableEnded) return;
  if (out instanceof Reply) {
    if (out.headers.Location) { res.writeHead(out.status, out.headers); return res.end(); }
    return sendJson(res, out.status, out.body, out.headers);
  }
  return sendJson(res, 200, out ?? { ok: true });
}

function handler(ctx, router) {
  return async (req, res) => {
    try {
      await dispatch(ctx, router, req, res);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof HttpError) {
        const headers = e.extra && e.extra.retryAfter ? { 'Retry-After': String(e.extra.retryAfter) } : {};
        return sendJson(res, e.status, { error: { code: e.code, message: e.message, ...(e.extra && !e.extra.retryAfter ? e.extra : {}) } }, headers);
      }
      console.error('[error]', req.method, req.url, e);
      sendJson(res, 500, { error: { code: 'server_error', message: 'Something went wrong on our side.' } });
    }
  };
}

module.exports = { createRouter, handler, reply, HANDLED, Reply };
