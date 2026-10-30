'use strict';
const http = require('node:http');
const { loadConfig } = require('./config');
const { openDb } = require('./db');
const { createMailer } = require('./mailer');
const { createLimiter } = require('./limiter');
const { PaystackGateway, MockGateway } = require('./gateway');
const { createRouter, handler } = require('./http');

/** Builds the whole app. Tests pass overrides (fake clock, fake gateway, in-memory DB). */
function createApp(overrides = {}) {
  const config = loadConfig(process.env, overrides.config || {});
  const ctx = {
    config,
    db: overrides.db || openDb(config.dbPath),
    now: overrides.now || (() => Date.now()),
    limiter: createLimiter(config.rateLimit),
    quiet: !!overrides.quiet,
  };
  ctx.gateway = overrides.gateway || (config.paystackSecret ? new PaystackGateway(config.paystackSecret) : new MockGateway(config.baseUrl));
  ctx.mailer = overrides.mailer || createMailer(ctx);

  const router = createRouter();
  for (const m of ['auth', 'catalog', 'billing', 'studio', 'admin', 'images', 'testimonials', 'profile', 'instructor']) require(`./routes/${m}`)(router);

  const server = http.createServer(handler(ctx, router));
  server.requestTimeout = 0;      // large video uploads can take a long time
  server.headersTimeout = 30000;
  return { ctx, server, close: () => { ctx.limiter.stop(); return new Promise((r) => server.close(r)); } };
}
module.exports = { createApp };
