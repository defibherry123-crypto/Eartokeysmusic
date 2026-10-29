'use strict';
/**
 * npm run demo  (development only)
 * Makes the app fully testable on your own computer:
 *   - gives every lesson a short sample video (samples/demo.mp4), so playback and seeking work
 *   - gives every library resource a tiny sample PDF / MIDI file, so downloads work
 *   - creates ready-made accounts, one for every subscription state (all share the password below)
 * Safe to run again. It never overwrites a video or file you uploaded yourself.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../src/app');
const { seed } = require('../src/seed');
const { hashPassword } = require('../src/auth');
const { DAY } = require('../src/util');
const { lessonsDir, resourcesDir } = require('../src/media');

const PASSWORD = 'Demo-Pass-123';
const SAMPLE = path.join(__dirname, '..', 'samples', 'demo.mp4');

// [name, email, role, level, subscription]
const ACCOUNTS = [
  ['Demo Active', 'active@demo.test', 'student', 'Intermediate', { plan: 'Intermediate', from: -5, to: 25 }],
  ['Demo Grace', 'grace@demo.test', 'student', 'Beginner', { plan: 'Beginner', from: -33, to: -3 }],
  ['Demo Expired', 'expired@demo.test', 'student', 'Beginner', { plan: 'Beginner', from: -60, to: -30 }],
  ['Demo New', 'new@demo.test', 'student', 'Beginner', null],
  ['Demo Instructor', 'instructor@demo.test', 'instructor', null, null],
];

const minimalPdf = (title) => {
  const text = `BT /F1 24 Tf 72 700 Td (${title.replace(/[()\\]/g, '')} - sample file) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1');
};
// header chunk + one track containing a single middle-C note
const MIDI = Buffer.from('4d546864000000060000000101e04d54726b0000000c00903c6040803c4000ff2f00', 'hex');

(async () => {
  const app = createApp({ quiet: true });
  const { ctx } = app;
  const { db } = ctx;
  if (ctx.config.isProd) throw new Error('npm run demo is for development only.');
  await seed(ctx, { log: () => {} });
  const now = Date.now();
  const hash = await hashPassword(PASSWORD);

  for (const [name, email, role, level, sub] of ACCOUNTS) {
    let u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!u) {
      const id = Number(db.prepare('INSERT INTO users (name,email,password_hash,role,instructor_approved,email_verified,level,specialty,created_at) VALUES (?,?,?,?,?,1,?,?,?)')
        .run(name, email, hash, role, role === 'instructor' ? 1 : 0, level, role === 'instructor' ? 'Classical piano' : null, now).lastInsertRowid);
      u = { id };
      if (sub) db.prepare("INSERT INTO periods (user_id,plan,billing,starts_at,ends_at,source,created_at) VALUES (?,?,'monthly',?,?,'admin',?)")
        .run(id, sub.plan, now + sub.from * DAY, now + sub.to * DAY, now);
    }
    if (role === 'instructor') {  // let the demo instructor own one course so the studio has something in it
      const c = db.prepare("SELECT id FROM courses WHERE slug='chords-by-ear'").get();
      if (c) {
        db.prepare('UPDATE courses SET created_by=? WHERE id=? AND created_by IS NULL').run(u.id, c.id);
        db.prepare('UPDATE lessons SET created_by=? WHERE course_id=? AND created_by IS NULL').run(u.id, c.id);
      }
    }
  }

  let videos = 0, files = 0;
  if (fs.existsSync(SAMPLE)) {
    fs.mkdirSync(lessonsDir(ctx), { recursive: true });
    for (const l of db.prepare('SELECT id FROM lessons WHERE file_name IS NULL').all()) {
      const name = `${l.id}-demo.mp4`;
      fs.copyFileSync(SAMPLE, path.join(lessonsDir(ctx), name));
      db.prepare('UPDATE lessons SET file_name=?, mime=?, size_bytes=? WHERE id=?').run(name, 'video/mp4', fs.statSync(SAMPLE).size, l.id);
      videos++;
    }
  } else console.log('samples/demo.mp4 not found: lessons were left without video.');
  fs.mkdirSync(resourcesDir(ctx), { recursive: true });
  for (const r of db.prepare('SELECT id,title,kind FROM resources WHERE file_name IS NULL').all()) {
    const midi = r.kind === 'MIDI', name = `${r.id}-demo.${midi ? 'mid' : 'pdf'}`;
    fs.writeFileSync(path.join(resourcesDir(ctx), name), midi ? MIDI : minimalPdf(r.title));
    db.prepare('UPDATE resources SET file_name=? WHERE id=?').run(name, r.id);
    files++;
  }

  console.log(`Demo ready: ${videos} lessons got the sample video, ${files} resources got a sample file.`);
  console.log(`\nDemo accounts (password for all: ${PASSWORD})`);
  console.log('  active@demo.test      student, Intermediate plan, active');
  console.log('  grace@demo.test       student, plan ended 3 days ago: 7-day grace period, banner shows days left');
  console.log('  expired@demo.test     student, grace over: only free lessons open');
  console.log('  new@demo.test         student, never subscribed: use this one to try the payment flow');
  console.log('  instructor@demo.test  approved instructor (sign in at #/instlogin)');
  console.log(ctx.config.adminEmail ? `  ${ctx.config.adminEmail}  admin (password from ADMIN_PASSWORD in .env)` : '  (no admin: set ADMIN_EMAIL and ADMIN_PASSWORD in .env, then run npm run seed)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
