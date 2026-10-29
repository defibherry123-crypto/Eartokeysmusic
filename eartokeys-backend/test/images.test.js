'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { boot } = require('./helpers');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPrsAAAAASUVORK5CYII=', 'base64');
const upload = (h, token, target, data = PNG, mime = 'image/png') => h.api('PUT', `/api/admin/images/${target}`, { token, raw: data, headers: { 'Content-Type': mime } });
test('only admins can manage catalogue images', async t => {
  const h = await boot(); t.after(h.close);
  const student = await h.signup(), instructor = await h.makeUser('images-instructor@test.test', 'instructor');
  for (const token of [undefined, student.token, instructor.token]) {
    const expected = token ? 403 : 401;
    assert.equal((await h.api('GET', '/api/admin/images', { token })).status, expected);
    assert.equal((await upload(h, token, 'resource/1')).status, expected);
    assert.equal((await h.api('DELETE', '/api/admin/images/resource/1', { token })).status, expected);
  }
});
test('uploaded course, resource and featured images are publicly readable', async t => {
  const h = await boot(); t.after(h.close); const admin = await h.makeUser('images-admin@test.test', 'admin');
  assert.equal((await h.api('GET', '/api/admin/images', { token: admin.token })).body.images.length, 15);
  for (const target of ['course/1','resource/1','feature/chopin','feature/anatomy','feature/drills']) {
    assert.equal((await upload(h, admin.token, target)).status, 200);
    const image = await h.api('GET', `/api/images/${target}`);
    assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await image.res.arrayBuffer()), PNG);
  }
  const images = (await h.api('GET', '/api/images')).body.images;
  assert.equal(images.length, 5); assert.equal(images.find(x => x.kind === 'course').slug, 'the-art-of-classical-piano');
});
test('replacement changes image URL and cleans old files; removal restores no image', async t => {
  const h = await boot(); t.after(h.close); const admin = await h.makeUser('replace-admin@test.test', 'admin');
  const first = await upload(h, admin.token, 'course/1'), old = h.ctx.db.prepare('SELECT * FROM catalogue_images').get();
  const second = await upload(h, admin.token, 'course/1');
  assert.notEqual(first.body.imageUrl, second.body.imageUrl);
  assert.equal(fs.existsSync(path.join(h.ctx.config.storageDir, 'images', old.file_name)), false);
  assert.equal(fs.readdirSync(path.join(h.ctx.config.storageDir, 'images')).length, 1);
  assert.equal((await h.api('DELETE', '/api/admin/images/course/1', { token: admin.token })).status, 200);
  assert.equal((await h.api('GET', '/api/images/course/1')).status, 404);
  assert.deepEqual((await h.api('GET', '/api/images')).body.images, []);
  assert.equal(fs.readdirSync(path.join(h.ctx.config.storageDir, 'images')).length, 0);
});
test('invalid content, unsupported formats, oversized files and unknown targets are rejected', async t => {
  const h = await boot(); t.after(h.close); const admin = await h.makeUser('validation-admin@test.test', 'admin');
  assert.equal((await upload(h, admin.token, 'resource/1', Buffer.from('<script>bad</script>'))).status, 415);
  assert.equal((await upload(h, admin.token, 'resource/1', PNG, 'image/svg+xml')).status, 415);
  assert.equal((await upload(h, admin.token, 'resource/1', Buffer.alloc(5 * 1048576 + 1))).status, 413);
  assert.equal((await upload(h, admin.token, 'resource/99999')).status, 404);
  assert.equal((await upload(h, admin.token, 'feature/unknown')).status, 400);
  assert.equal((await h.api('GET', '/api/images')).body.images.length, 0);
});
test('unpublished product images are private but admins can preview them', async t => {
  const h = await boot(); t.after(h.close); const admin = await h.makeUser('private-admin@test.test', 'admin');
  await upload(h, admin.token, 'course/1'); await upload(h, admin.token, 'resource/1');
  h.ctx.db.exec('UPDATE courses SET published=0 WHERE id=1; UPDATE resources SET published=0 WHERE id=1;');
  assert.deepEqual((await h.api('GET', '/api/images')).body.images, []);
  for (const target of ['course/1','resource/1']) {
    assert.equal((await h.api('GET', `/api/images/${target}`)).status, 404);
    assert.equal((await h.api('GET', `/api/admin/images/${target}`, { token: admin.token })).status, 200);
  }
});
test('image registry survives SQLite reopen and schema initialization is repeatable', async t => {
  const h = await boot(); t.after(h.close); const file = path.join(h.ctx.config.storageDir, 'migration.db');
  let db = openDb(file); db.prepare('INSERT INTO catalogue_images VALUES (?,?,?,?,?)').run('feature','chopin','example.png','image/png',PNG.length); db.close();
  db = openDb(file); assert.equal(db.prepare('SELECT file_name FROM catalogue_images').get().file_name, 'example.png'); db.close();
});
