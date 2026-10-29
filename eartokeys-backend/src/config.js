'use strict';
const path = require('node:path');

function loadConfig(env = process.env, overrides = {}) {
  const isProd = (env.NODE_ENV || 'development') === 'production';
  const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
  const trim = (s) => s.replace(/\/$/, '');
  const frontendUrl = trim(env.FRONTEND_URL || 'http://localhost:3000');
  const cfg = {
    isProd,
    port: num(env.PORT, 3000),
    baseUrl: trim(env.BASE_URL || 'http://localhost:3000'),
    frontendUrl,
    allowedOrigins: (env.ALLOWED_ORIGINS || frontendUrl).split(',').map((s) => trim(s.trim())).filter(Boolean),
    trustProxy: env.TRUST_PROXY === '1',
    dbPath: env.DB_PATH || path.join(process.cwd(), 'data', 'etk.db'),
    storageDir: env.STORAGE_DIR || path.join(process.cwd(), 'storage'),
    publicDir: env.PUBLIC_DIR || path.join(process.cwd(), 'public'),
    maxUploadBytes: num(env.MAX_UPLOAD_MB, 2048) * 1024 * 1024,
    secret: env.APP_SECRET || '',
    paystackSecret: env.PAYSTACK_SECRET_KEY || '',
    graceDays: num(env.GRACE_DAYS, 7),
    sessionDays: num(env.SESSION_DAYS, 30),
    streamTtlSec: num(env.STREAM_TTL_SECONDS, 3600),
    rateLimit: (env.RATE_LIMIT || 'on') !== 'off',
    adminEmail: env.ADMIN_EMAIL || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    ...overrides,
  };
  if (!cfg.secret) {
    if (isProd) throw new Error('APP_SECRET is required in production');
    cfg.secret = 'dev-only-secret-do-not-use-in-production-0000';
  }
  if (isProd && cfg.secret.length < 32) throw new Error('APP_SECRET must be at least 32 characters');
  if (isProd && !cfg.paystackSecret && !overrides.gateway) throw new Error('PAYSTACK_SECRET_KEY is required in production');
  cfg.secureCookies = isProd || cfg.baseUrl.startsWith('https://');
  return cfg;
}
module.exports = { loadConfig };
