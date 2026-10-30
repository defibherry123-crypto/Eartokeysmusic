"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { boot } = require("./helpers");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPrsAAAAASUVORK5CYII=",
  "base64",
);
test("profile biography and preferences are private, bounded and survive avatar changes", async (t) => {
  const h = await boot();
  t.after(h.close);
  const a = await h.signup(),
    b = await h.signup();
  assert.equal((await h.api("GET", "/api/profile")).status, 401);
  let r = await h.api("PATCH", "/api/profile", {
    token: a.token,
    body: {
      bio: "Practising Chopin",
      preferences: { lessonUpdates: true, unknown: "ignored" },
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.bio, "Practising Chopin");
  assert.deepEqual(r.body.preferences, { lessonUpdates: true });
  assert.equal(
    (await h.api("GET", "/api/profile", { token: b.token })).body.bio,
    "",
  );
  assert.equal(
    (
      await h.api("PATCH", "/api/profile", {
        token: a.token,
        body: { bio: "a".repeat(501) },
      })
    ).status,
    400,
  );
  const upload = () =>
    h.api("PUT", "/api/profile/avatar", {
      token: a.token,
      raw: PNG,
      headers: { "Content-Type": "image/png" },
    });
  const first = await upload();
  assert.equal(first.status, 200);
  assert.equal(first.body.bio, "Practising Chopin");
  const old = h.ctx.db
    .prepare("SELECT avatar_file FROM student_profiles WHERE user_id=?")
    .get(a.id).avatar_file;
  const image = await h.api("GET", first.body.avatarUrl, { token: a.token });
  assert.equal(image.status, 200);
  assert.deepEqual(Buffer.from(await image.res.arrayBuffer()), PNG);
  assert.equal(
    (await h.api("GET", first.body.avatarUrl, { token: b.token })).status,
    404,
  );
  assert.equal((await h.api("GET", first.body.avatarUrl)).status, 401);
  const second = await upload();
  assert.notEqual(second.body.avatarUrl, first.body.avatarUrl);
  assert.equal(
    fs.existsSync(path.join(h.ctx.config.storageDir, "avatars", old)),
    false,
  );
  assert.equal(
    (await h.api("DELETE", "/api/profile/avatar", { token: a.token })).status,
    200,
  );
  const profile = (await h.api("GET", "/api/profile", { token: a.token })).body;
  assert.equal(profile.avatarUrl, null);
  assert.equal(profile.bio, "Practising Chopin");
  assert.equal(
    fs.readdirSync(path.join(h.ctx.config.storageDir, "avatars")).length,
    0,
  );
  assert.equal(
    (
      await h.api("PATCH", "/api/profile", {
        token: a.token,
        body: { bio: "" },
      })
    ).status,
    200,
  );
});
test("profile upload rejects unsupported content, oversized files and cross-origin writes", async (t) => {
  const h = await boot();
  t.after(h.close);
  const a = await h.signup();
  for (const [raw, mime, status] of [
    [PNG, "image/svg+xml", 415],
    [Buffer.from("<script>bad</script>"), "image/png", 415],
    [Buffer.alloc(5 * 1048576 + 1), "image/png", 413],
  ])
    assert.equal(
      (
        await h.api("PUT", "/api/profile/avatar", {
          token: a.token,
          raw,
          headers: { "Content-Type": mime },
        })
      ).status,
      status,
    );
  assert.equal(
    (
      await h.api("PUT", "/api/profile/avatar", {
        token: a.token,
        raw: PNG,
        headers: {
          "Content-Type": "image/png",
          Origin: "https://evil.example",
        },
      })
    ).status,
    403,
  );
});
test("remember-me choice controls persistent versus browser-session login cookie", async (t) => {
  const h = await boot();
  t.after(h.close);
  const a = await h.signup();
  for (const remember of [true, false]) {
    const r = await h.api("POST", "/api/auth/login", {
      body: { email: a.email, password: "password123", remember },
    });
    assert.equal(r.status, 200);
    assert.equal(/Max-Age=/.test(r.headers.get("set-cookie")), remember);
    assert.match(r.headers.get("set-cookie"), /HttpOnly/);
  }
});
