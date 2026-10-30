"use strict";
const path = require("node:path");
const fs = require("node:fs/promises");
const { HttpError, text } = require("../util");
const { saveUpload, sendFile } = require("../media");
const { HANDLED } = require("../http");
const types = {
  "image/png": {
    ext: "png",
    ok: (b) => b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  },
  "image/jpeg": {
    ext: "jpg",
    ok: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  },
  "image/webp": {
    ext: "webp",
    ok: (b) =>
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
};
const dir = (ctx) => path.join(ctx.config.storageDir, "avatars");
const row = (ctx, id) =>
  ctx.db.prepare("SELECT * FROM student_profiles WHERE user_id=?").get(id);
const view = (p) => ({
  bio: p?.bio || "",
  preferences: JSON.parse(p?.preferences || "{}"),
  avatarUrl: p?.avatar_file
    ? "/api/profile/avatar?v=" + encodeURIComponent(p.avatar_file)
    : null,
});
module.exports = (r) => {
  r.get("/api/profile", ({ ctx, user }) => view(row(ctx, user.id)));
  r.patch("/api/profile", ({ ctx, user, body }) => {
    const old = row(ctx, user.id),
      bio =
        body.bio === undefined
          ? old?.bio || ""
          : text(body.bio, "bio", { max: 500, min: 0 });
    const prefs = JSON.parse(old?.preferences || "{}");
    if (body.preferences)
      for (const k of ["lessonUpdates", "communityReplies"])
        if (typeof body.preferences[k] === "boolean")
          prefs[k] = body.preferences[k];
    ctx.db
      .prepare(
        "INSERT INTO student_profiles (user_id,bio,preferences) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,preferences=excluded.preferences",
      )
      .run(user.id, bio, JSON.stringify(prefs));
    return view(row(ctx, user.id));
  });
  r.get("/api/profile/avatar", ({ ctx, user, req, res }) => {
    const p = row(ctx, user.id);
    if (!p?.avatar_file)
      throw new HttpError(
        404,
        "avatar_not_found",
        "No profile picture uploaded.",
      );
    sendFile(
      req,
      res,
      path.join(dir(ctx), path.basename(p.avatar_file)),
      p.avatar_mime,
    );
    return HANDLED;
  });
  r.put("/api/profile/avatar", { stream: true }, async ({ ctx, user, req }) => {
    const old = row(ctx, user.id),
      f = await saveUpload(ctx, req, {
        id: "avatar-" + user.id,
        dir: dir(ctx),
        types,
        max: 5 * 1048576,
      });
    try {
      ctx.db
        .prepare(
          "INSERT INTO student_profiles (user_id,avatar_file,avatar_mime) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET avatar_file=excluded.avatar_file,avatar_mime=excluded.avatar_mime",
        )
        .run(user.id, f.fileName, f.mime);
    } catch (e) {
      await fs.rm(path.join(dir(ctx), f.fileName), { force: true });
      throw e;
    }
    if (old?.avatar_file)
      await fs.rm(path.join(dir(ctx), path.basename(old.avatar_file)), {
        force: true,
      });
    return view(row(ctx, user.id));
  });
  r.delete("/api/profile/avatar", async ({ ctx, user }) => {
    const old = row(ctx, user.id);
    ctx.db
      .prepare(
        "UPDATE student_profiles SET avatar_file=NULL,avatar_mime=NULL WHERE user_id=?",
      )
      .run(user.id);
    if (old?.avatar_file)
      await fs.rm(path.join(dir(ctx), path.basename(old.avatar_file)), {
        force: true,
      });
    return view(row(ctx, user.id));
  });
};
