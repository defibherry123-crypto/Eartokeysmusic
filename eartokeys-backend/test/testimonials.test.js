'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot } = require('./helpers');
const VIDEO = fs.readFileSync(path.join(__dirname, '../samples/demo.mp4'));
const upload = (h, token, key='cindy', data=VIDEO, mime='video/mp4') => h.api('PUT', `/api/admin/testimonials/${key}/video`, { token, raw:data, headers:{'Content-Type':mime} });
test('only admins can upload or remove public testimonial videos', async t => {
  const h=await boot();t.after(h.close);const student=await h.signup();const instructor=await h.makeUser('testimonial-instructor@test.test','instructor');
  for(const token of [undefined,student.token,instructor.token]) {
    assert.equal((await upload(h,token)).status,token?403:401);
    assert.equal((await h.api('DELETE','/api/admin/testimonials/cindy/video',{token})).status,token?403:401);
  }
});
test('testimonial videos are listed without a poster and support public playback and seeking', async t => {
  const h=await boot();t.after(h.close);const admin=await h.makeUser('testimonial-admin@test.test','admin');
  for(const key of ['cindy','haifeng','nayelie'])assert.equal((await upload(h,admin.token,key)).status,200);
  const images=(await h.api('GET','/api/images')).body.images;
  assert.equal(images.length,3);assert.equal(images[0].imageUrl,null);assert.match(images[0].videoUrl,/\/api\/testimonials\//);
  const res=await h.api('GET','/api/testimonials/cindy/video',{headers:{Range:'bytes=0-31'}});
  assert.equal(res.status,206);assert.equal(res.headers.get('content-type'),'video/mp4');assert.deepEqual(Buffer.from(await res.res.arrayBuffer()),VIDEO.subarray(0,32));
});
test('replacing/removing a testimonial video cleans storage and validates file content', async t => {
  const h=await boot();t.after(h.close);const admin=await h.makeUser('testimonial-replace@test.test','admin');
  const first=await upload(h,admin.token),old=h.ctx.db.prepare('SELECT file_name FROM testimonial_videos').get().file_name;
  const second=await upload(h,admin.token);assert.notEqual(first.body.videoUrl,second.body.videoUrl);assert.equal(fs.existsSync(path.join(h.ctx.config.storageDir,'testimonials',old)),false);
  assert.equal((await upload(h,admin.token,'unknown')).status,400);
  assert.equal((await upload(h,admin.token,'cindy',Buffer.from('this is not a video'))).status,415);
  assert.equal((await upload(h,admin.token,'cindy',VIDEO,'image/svg+xml')).status,415);
  assert.equal((await h.api('DELETE','/api/admin/testimonials/cindy/video',{token:admin.token})).status,200);
  assert.equal((await h.api('GET','/api/testimonials/cindy/video')).status,404);
  assert.deepEqual((await h.api('GET','/api/images')).body.images,[]);
  assert.equal(fs.readdirSync(path.join(h.ctx.config.storageDir,'testimonials')).length,0);
});
