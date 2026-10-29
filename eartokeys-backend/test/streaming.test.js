'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, DAY } = require('./helpers');

// Helper: an approved instructor uploads a video for a seeded lesson
async function withVideo(h, title) {
  const admin = await h.makeUser(`admin-${Math.random().toString(36).slice(2, 6)}@x.com`, 'admin');
  const lesson = h.lessonBy(title);
  const buf = h.mp4(6000);
  const up = await h.putVideo(admin.token, lesson.id, buf);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  return { lesson, buf, admin };
}

test('subscribers get a signed link and can seek with HTTP Range', async (t) => {
  const h = await boot(); t.after(h.close);
  const { lesson, buf } = await withVideo(h, 'Chord Progressions 101'); // Intermediate lesson
  const s = await h.signup();
  await h.pay(s, 'Intermediate');

  const link = await h.api('POST', `/api/lessons/${lesson.id}/stream-url`, { token: s.token });
  assert.equal(link.status, 200);
  assert.equal(link.body.watermark, s.email, 'link carries the viewer email for the on-screen watermark');
  assert.match(link.body.url, /\/api\/stream\/.+\..+/);

  const full = await fetch(link.body.url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.equal(Buffer.compare(Buffer.from(await full.arrayBuffer()), buf), 0, 'bytes are identical');

  const part = await fetch(link.body.url, { headers: { Range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 100-199/${buf.length}`);
  assert.equal(Buffer.compare(Buffer.from(await part.arrayBuffer()), buf.subarray(100, 200)), 0);
  assert.equal((await fetch(link.body.url, { headers: { Range: 'bytes=999999-' } })).status, 416);
});

test('access rules: none/expired locked, grace allowed, plan level enforced, free course open to signed-in users', async (t) => {
  const h = await boot(); t.after(h.close);
  const mid = (await withVideo(h, 'Chord Progressions 101')).lesson;
  const adv = (await withVideo(h, 'Jazz ii-V-I')).lesson;
  const free = (await withVideo(h, 'Welcome to the Piano')).lesson;
  const s = await h.signup();
  const url = (l) => h.api('POST', `/api/lessons/${l.id}/stream-url`, { token: s.token });

  assert.equal((await h.api('POST', `/api/lessons/${mid.id}/stream-url`)).status, 401, 'signed-out');
  assert.equal((await url(mid)).body.error.code, 'subscription_required');
  assert.equal((await url(free)).status, 200, 'free course needs only an account');

  const paid = await h.pay(s, 'Intermediate');
  assert.equal((await url(mid)).status, 200);
  assert.equal((await url(adv)).body.error.code, 'plan_too_low');

  h.clock.t = paid.body.access.periodEnd + 2 * DAY; // inside grace
  assert.equal((await url(mid)).status, 200, 'still watching during the grace period');
  const me = (await h.api('GET', '/api/me', { token: s.token })).body.access;
  assert.equal(me.state, 'grace');

  h.clock.t = paid.body.access.periodEnd + 8 * DAY; // locked
  assert.equal((await url(mid)).body.error.code, 'subscription_expired');
  assert.equal((await url(free)).status, 200, 'free lessons stay open');
});

test('a link already in someone\'s hands stops working when the subscription lapses', async (t) => {
  const h = await boot(); t.after(h.close);
  const { lesson } = await withVideo(h, 'Chord Progressions 101');
  const s = await h.signup();
  const paid = await h.pay(s, 'Intermediate');
  const { url } = (await h.api('POST', `/api/lessons/${lesson.id}/stream-url`, { token: s.token })).body;
  assert.equal((await fetch(url)).status, 200);
  h.clock.t = paid.body.access.periodEnd + 8 * DAY;
  assert.equal((await fetch(url, { headers: { Range: 'bytes=0-10' } })).status, 403);
});

test('stream links are tamper-proof and expire', async (t) => {
  const h = await boot(); t.after(h.close);
  const { lesson } = await withVideo(h, 'Chord Progressions 101');
  const s = await h.signup();
  await h.pay(s, 'Intermediate');
  const { url } = (await h.api('POST', `/api/lessons/${lesson.id}/stream-url`, { token: s.token })).body;
  const [body, sig] = url.split('/api/stream/')[1].split('.');
  const forgedBody = Buffer.from(JSON.stringify({ u: 9999, l: lesson.id, exp: h.clock.t + 1e9 })).toString('base64url');
  assert.equal((await fetch(`${h.base}/api/stream/${forgedBody}.${sig}`)).status, 403, 'edited payload rejected');
  assert.equal((await fetch(`${h.base}/api/stream/${body}.AAAA`)).status, 403, 'bad signature rejected');
  assert.equal((await fetch(`${h.base}/api/stream/garbage`)).status, 403);
  h.clock.t += 2 * 3600 * 1000; // past the 1 hour TTL
  assert.equal((await fetch(url)).status, 403, 'expired link rejected');
});

test('unpublished lessons are invisible to students; publishing needs a video', async (t) => {
  const h = await boot(); t.after(h.close);
  const admin = await h.makeUser('admin@x.com', 'admin');
  const s = await h.signup();
  const l = h.lessonBy('Reharmonization');
  assert.equal((await h.api('PATCH', `/api/studio/lessons/${l.id}`, { token: admin.token, body: { published: false } })).status, 200);
  assert.equal((await h.api('GET', `/api/lessons/${l.id}`, { token: s.token })).status, 404);
  assert.equal((await h.api('PATCH', `/api/studio/lessons/${l.id}`, { token: admin.token, body: { published: true } })).body.error.code, 'video_not_uploaded');
  await h.putVideo(admin.token, l.id);
  assert.equal((await h.api('PATCH', `/api/studio/lessons/${l.id}`, { token: admin.token, body: { published: true } })).status, 200);
});

test('uploads: size cap, file-type check, and instructors can only touch their own lessons', async (t) => {
  const h = await boot({ maxUpload: 50000 }); t.after(h.close);
  const inst = await h.makeUser('joshua@eartokeys.com', 'instructor');
  const other = await h.makeUser('eliana@eartokeys.com', 'instructor');
  const course = (await h.api('POST', '/api/studio/courses', { token: inst.token, body: { title: 'My New Course', level: 'Beginner' } })).body.course;
  const lesson = (await h.api('POST', '/api/studio/lessons', { token: inst.token, body: { courseId: course.id, title: 'Lesson A', durationSec: 120 } })).body.lesson;

  const big = h.mp4(60000);
  const tooBig = await h.api('PUT', `/api/studio/lessons/${lesson.id}/file`, { token: inst.token, raw: big, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(big.length) } });
  assert.equal(tooBig.status, 413);

  const fake = Buffer.from('MZ this is really a windows program '.repeat(20));
  const notVideo = await h.api('PUT', `/api/studio/lessons/${lesson.id}/file`, { token: inst.token, raw: fake, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(fake.length) } });
  assert.equal(notVideo.status, 415);
  assert.equal((await h.api('PUT', `/api/studio/lessons/${lesson.id}/file`, { token: inst.token, raw: fake, headers: { 'Content-Type': 'application/x-msdownload', 'Content-Length': String(fake.length) } })).status, 415);

  assert.equal((await h.putVideo(inst.token, lesson.id, h.mp4(2000))).status, 200);
  assert.equal((await h.putVideo(other.token, lesson.id, h.mp4(2000))).status, 404, 'someone else\'s lesson looks like it does not exist');
  const leftovers = require('node:fs').readdirSync(require('node:path').join(h.ctx.config.storageDir, 'lessons'));
  assert.equal(leftovers.filter((f) => f.endsWith('.part')).length, 0, 'no half-written files left behind');
  assert.equal(leftovers.length, 1);
});

test('progress is saved, resumes, and completion is sticky', async (t) => {
  const h = await boot(); t.after(h.close);
  const { lesson } = await withVideo(h, 'Chord Progressions 101');
  const s = await h.signup();
  await h.pay(s, 'Intermediate');
  await h.api('PUT', `/api/lessons/${lesson.id}/progress`, { token: s.token, body: { position: 300 } });
  assert.equal((await h.api('POST', `/api/lessons/${lesson.id}/stream-url`, { token: s.token })).body.resumeAt, 300);
  await h.api('PUT', `/api/lessons/${lesson.id}/progress`, { token: s.token, body: { completed: true } });
  await h.api('PUT', `/api/lessons/${lesson.id}/progress`, { token: s.token, body: { position: 10 } });
  const p = (await h.api('GET', '/api/progress', { token: s.token })).body;
  assert.equal(p.stats.completed, 1);
  assert.equal(p.lessons[0].completed, true);
  assert.equal(p.lessons[0].positionSec, 10);
});

test('public catalogue: courses, filters, curriculum with per-viewer lock state, plans', async (t) => {
  const h = await boot(); t.after(h.close);
  const all = (await h.api('GET', '/api/courses')).body.courses;
  assert.equal(all.length, 8);
  assert.equal(all[0].title, 'Piano for Complete Beginners', 'sorted by popularity');
  assert.equal((await h.api('GET', '/api/courses?level=Advanced')).body.courses.length, 2);
  assert.equal((await h.api('GET', '/api/courses?q=jazz')).body.courses[0].title, 'Jazz Piano Fundamentals');
  const detail = (await h.api('GET', '/api/courses/the-art-of-classical-piano')).body;
  assert.equal(detail.modules.length, 3);
  assert.equal(detail.modules[0].lessons[0].locked, true);
  assert.equal(detail.course.priceNgn, 7900);
  assert.equal((await h.api('GET', '/api/courses/nope')).status, 404);
});

test('resources: public list, login + plan needed to download, support form validated', async (t) => {
  const h = await boot(); t.after(h.close);
  assert.equal((await h.api('GET', '/api/resources?category=MIDI Files')).body.resources.length, 1);
  assert.equal((await h.api('GET', '/api/resources/1/download')).status, 401, 'sign in first');
  const s = await h.signup();
  assert.equal((await h.api('GET', '/api/resources/3/download', { token: s.token })).body.error.code, 'subscription_required');
  assert.equal((await h.api('GET', '/api/resources/1/download', { token: s.token })).body.error.code, 'file_not_available_yet');

  assert.equal((await h.api('POST', '/api/support', { body: { name: 'A', email: 'bad', subject: 'Hi', message: 'Hello there' } })).status, 400);
  assert.equal((await h.api('POST', '/api/support', { body: { name: 'Ada', email: 'ada@mail.com', subject: 'Refund', message: 'Hello there' } })).status, 200);
});

test('renewal reminders are sent once per period, in the right stages', async (t) => {
  const { runMaintenance } = require('../src/jobs');
  const h = await boot(); t.after(h.close);
  const s = await h.signup('reminder@mail.com');
  const paid = await h.pay(s, 'Beginner');
  const end = paid.body.access.periodEnd;
  const mails = () => h.ctx.db.prepare("SELECT subject FROM outbox WHERE to_email='reminder@mail.com' AND subject NOT LIKE '%verification%'").all().map((x) => x.subject);

  await runMaintenance(h.ctx);
  assert.equal(mails().length, 0, 'nothing while the plan is healthy');

  h.clock.t = end - 2 * DAY;
  await runMaintenance(h.ctx); await runMaintenance(h.ctx);
  assert.equal(mails().length, 1, 'renew-soon sent once even if the job runs twice');

  h.clock.t = end + DAY;
  await runMaintenance(h.ctx);
  assert.equal(mails().length, 2);
  assert.match(mails()[1], /grace period/);

  h.clock.t = end + 6.5 * DAY;
  await runMaintenance(h.ctx);
  assert.match(mails()[2], /within 24 hours/);

  h.clock.t = end + 7.5 * DAY;
  await runMaintenance(h.ctx);
  assert.match(mails()[3], /paused/);

  h.clock.t = end + 30 * DAY; // an old pending payment is cleaned up
  const c = await h.api('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'Beginner', billing: 'monthly' } });
  h.clock.t += 2 * DAY;
  const out = await runMaintenance(h.ctx);
  assert.equal(out.abandonedPayments, 1);
});
