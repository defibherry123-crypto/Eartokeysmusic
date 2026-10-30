"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { boot } = require("./helpers");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPrsAAAAASUVORK5CYII=",
  "base64",
);
const course = async (h, u) =>
  (
    await h.api("POST", "/api/studio/courses", {
      token: u.token,
      body: {
        title: "Private Curriculum",
        level: "Beginner",
        description: "A structured course",
      },
    })
  ).body.course;
const lesson = async (h, u, c, title = "Owned Lesson") =>
  (
    await h.api("POST", "/api/studio/lessons", {
      token: u.token,
      body: { courseId: c.id, title, module: "Module 1", durationSec: 60 },
    })
  ).body.lesson;
test("pending instructors save complete profiles without granting themselves approval", async (t) => {
  const h = await boot();
  t.after(h.close);
  const u = await h.makeUser("pending-faculty@test.test", "instructor", {
      approved: 0,
    }),
    s = await h.signup();
  assert.equal((await h.api("GET", "/api/instructor/profile")).status, 401);
  assert.equal(
    (await h.api("GET", "/api/instructor/profile", { token: s.token })).status,
    403,
  );
  assert.equal(
    (
      await h.api("PATCH", "/api/instructor/profile", {
        token: u.token,
        body: { complete: true },
      })
    ).status,
    400,
  );
  const details = {
    experience: 0,
    specialization: "Classical Performance",
    biography: "My musical journey",
    achievements: ["Music degree"],
    pedagogicalApproach: "Demonstrate and practise",
    engagementStyle: "Weekly milestones",
    artisticVision: "Musical confidence",
    proposedTitle: "Piano Foundations",
    level: "Beginner",
    estimatedDuration: "4 Weeks",
    objectives: ["Learn to play by ear"],
    outline: "Module 1: Fundamentals",
    complete: true,
    approved: true,
  };
  const r = await h.api("PATCH", "/api/instructor/profile", {
    token: u.token,
    body: details,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.approved, false);
  assert.ok(r.body.completedAt);
  assert.equal(r.body.details.experience, 0);
  assert.equal(
    (await h.api("GET", "/api/studio/courses", { token: u.token })).status,
    403,
  );
  assert.equal(
    (await h.api("GET", "/api/instructor/profile", { token: u.token })).body
      .details.biography,
    details.biography,
  );
  assert.equal(
    (
      await h.api("PATCH", "/api/instructor/profile", {
        token: u.token,
        body: { experience: 101 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await h.api("PATCH", "/api/instructor/profile", {
        token: u.token,
        body: { biography: "x".repeat(6001) },
      })
    ).status,
    400,
  );
});
test("roster and private notes include only students learning owned content", async (t) => {
  const h = await boot();
  t.after(h.close);
  const a = await h.makeUser("a-faculty@test.test", "instructor"),
    b = await h.makeUser("b-faculty@test.test", "instructor"),
    s = await h.signup(),
    other = await h.signup(),
    c = await course(h, a),
    d = await course(h, b),
    l = await lesson(h, a, c),
    m = await lesson(h, b, d);
  h.ctx.db
    .prepare(
      "INSERT INTO progress (user_id,lesson_id,position_sec,completed,updated_at) VALUES (?,?,10,1,?)",
    )
    .run(s.id, l.id, h.clock.t);
  h.ctx.db
    .prepare(
      "INSERT INTO progress (user_id,lesson_id,position_sec,completed,updated_at) VALUES (?,?,10,0,?)",
    )
    .run(other.id, m.id, h.clock.t);
  const stats = (await h.api("GET", "/api/studio/overview", { token: a.token }))
    .body;
  assert.equal(stats.totalStudents, 1);
  assert.equal(stats.completionRate, 100);
  assert.equal(stats.monthlyRevenue, null);
  assert.equal(stats.students[0].id, s.id);
  assert.equal(
    (await h.api("GET", "/api/studio/students/" + other.id, { token: a.token }))
      .status,
    404,
  );
  assert.equal(
    (
      await h.api("PUT", `/api/studio/students/${s.id}/notes`, {
        token: a.token,
        body: { note: "Private observation" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await h.api("GET", "/api/studio/students/" + s.id, { token: a.token }))
      .body.note,
    "Private observation",
  );
  assert.equal(
    (await h.api("GET", "/api/studio/students/" + s.id, { token: b.token }))
      .status,
    404,
  );
});
test("course drafts, lesson metadata and full reorder enforce instructor ownership", async (t) => {
  const h = await boot();
  t.after(h.close);
  const a = await h.makeUser("draft-a@test.test", "instructor"),
    b = await h.makeUser("draft-b@test.test", "instructor"),
    c = await course(h, a),
    first = await lesson(h, a, c, "First"),
    second = await lesson(h, a, c, "Second"),
    url = `/api/studio/courses/${c.id}/settings`;
  assert.equal(
    (
      await h.api("PATCH", url, {
        token: b.token,
        body: { audience: "Someone else" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await h.api("PATCH", url, {
        token: a.token,
        body: {
          instrument: "Grand Piano",
          audience: "New pianists",
          modules: ["Module 1", "Module 2"],
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (await h.api("GET", "/api/studio/courses", { token: a.token })).body
      .courses[0].settings.audience,
    "New pianists",
  );
  assert.equal(
    (
      await h.api("PATCH", `/api/studio/lessons/${first.id}/settings`, {
        token: b.token,
        body: { description: "Not mine" },
      })
    ).status,
    404,
  );
  await h.api("PATCH", `/api/studio/lessons/${first.id}/settings`, {
    token: a.token,
    body: { description: "First lesson explanation", tags: ["Technique"] },
  });
  const reorder = `/api/studio/courses/${c.id}/reorder`;
  assert.equal(
    (
      await h.api("PUT", reorder, {
        token: a.token,
        body: { order: [first.id, first.id] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await h.api("PUT", reorder, {
        token: b.token,
        body: { order: [second.id, first.id] },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await h.api("PUT", reorder, {
        token: a.token,
        body: { order: [second.id, first.id] },
      })
    ).status,
    200,
  );
  assert.deepEqual(
    h.ctx.db
      .prepare("SELECT id FROM lessons WHERE course_id=? ORDER BY position")
      .all(c.id)
      .map((l) => l.id),
    [second.id, first.id],
  );
  await h.putVideo(a.token, first.id);
  await h.api("PATCH", "/api/studio/lessons/" + first.id, {
    token: a.token,
    body: { published: true },
  });
  await h.api("PATCH", "/api/studio/courses/" + c.id, {
    token: a.token,
    body: { published: true },
  });
  assert.equal(
    (await h.api("GET", "/api/courses/" + c.slug)).body.modules[0].lessons[0]
      .description,
    "First lesson explanation",
  );
});
test("instructor course images stay private in draft and cannot be changed by other instructors", async (t) => {
  const h = await boot();
  t.after(h.close);
  const a = await h.makeUser("image-a@test.test", "instructor"),
    b = await h.makeUser("image-b@test.test", "instructor"),
    c = await course(h, a),
    url = `/api/studio/courses/${c.id}/image`;
  assert.equal(
    (
      await h.api("PUT", url, {
        token: b.token,
        raw: PNG,
        headers: { "Content-Type": "image/png" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await h.api("PUT", url, {
        token: a.token,
        raw: PNG,
        headers: { "Content-Type": "image/png" },
      })
    ).status,
    200,
  );
  assert.equal((await h.api("GET", url, { token: a.token })).status, 200);
  assert.equal((await h.api("GET", url, { token: b.token })).status, 404);
  assert.equal((await h.api("GET", "/api/images/course/" + c.id)).status, 404);
  assert.equal(
    (
      await h.api("PUT", url, {
        token: a.token,
        raw: Buffer.from("<script>bad</script>"),
        headers: { "Content-Type": "image/png" },
      })
    ).status,
    415,
  );
  await h.api("PATCH", "/api/studio/courses/" + c.id, {
    token: a.token,
    body: { published: true },
  });
  assert.equal((await h.api("GET", "/api/images/course/" + c.id)).status, 200);
});
test("faculty resources enforce ownership and a file is required for publication", async (t) => {
  const h = await boot();
  t.after(h.close);
  const a = await h.makeUser("resource-a@test.test", "instructor"),
    b = await h.makeUser("resource-b@test.test", "instructor"),
    s = await h.signup();
  const r = await h.api("POST", "/api/studio/resources", {
    token: a.token,
    body: { title: "My Practice Guide", kind: "PDF" },
  });
  assert.equal(r.status, 200);
  const id = r.body.resource.id,
    url = `/api/studio/resources/${id}`,
    pdf = Buffer.from("%PDF-1.4\nsample");
  assert.equal(
    (await h.api("GET", "/api/studio/resources", { token: b.token })).body
      .resources.length,
    0,
  );
  assert.equal(
    (await h.api("PATCH", url, { token: a.token, body: { published: true } }))
      .status,
    409,
  );
  assert.equal(
    (
      await h.api("PUT", url + "/file", {
        token: b.token,
        raw: pdf,
        headers: { "Content-Type": "application/pdf" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await h.api("PUT", url + "/file", {
        token: a.token,
        raw: pdf,
        headers: { "Content-Type": "application/pdf" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await h.api("GET", "/api/resources/" + id + "/download", {
        token: s.token,
      })
    ).status,
    404,
  );
  await h.api("PATCH", url, { token: a.token, body: { published: true } });
  assert.equal(
    (
      await h.api("GET", "/api/resources/" + id + "/download", {
        token: s.token,
      })
    ).status,
    200,
  );
  assert.equal(
    (await h.api("GET", "/api/studio/resources", { token: s.token })).status,
    403,
  );
});
test("one-time access proposals and future release dates remain drafts", async (t) => {
  const h = await boot();
  t.after(h.close);
  const a = await h.makeUser("publication@test.test", "instructor"),
    c = await course(h, a);
  await h.api("PATCH", `/api/studio/courses/${c.id}/settings`, {
    token: a.token,
    body: { accessType: "one_time", priceUsd: 149 },
  });
  assert.equal(
    (
      await h.api("PATCH", "/api/studio/courses/" + c.id, {
        token: a.token,
        body: { published: true },
      })
    ).status,
    409,
  );
  await h.api("PATCH", `/api/studio/courses/${c.id}/settings`, {
    token: a.token,
    body: { accessType: "subscription", publishAt: "2099-01-01T12:00" },
  });
  assert.equal(
    (
      await h.api("PATCH", "/api/studio/courses/" + c.id, {
        token: a.token,
        body: { published: true },
      })
    ).status,
    409,
  );
  assert.equal(
    h.ctx.db.prepare("SELECT published FROM courses WHERE id=?").get(c.id)
      .published,
    0,
  );
});
