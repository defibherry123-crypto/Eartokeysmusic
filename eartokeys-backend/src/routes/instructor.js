"use strict";
const path = require("node:path");
const fs = require("node:fs/promises");
const { HttpError, text, int, oneOf } = require("../util");
const { tx } = require("../db");
const { saveUpload, sendFile, FILE_TYPES, resourcesDir } = require("../media");
const { HANDLED } = require("../http");
const imageTypes = require("../image-types");
const staff = (user) => {
  if (!["instructor", "admin"].includes(user.role))
    throw new HttpError(403, "instructors_only", "Instructors only.");
};
const ownCourse = (ctx, user, id) => {
  const c = ctx.db
    .prepare("SELECT * FROM courses WHERE id=?")
    .get(int(id, "courseId", { min: 1 }));
  if (!c || (user.role !== "admin" && c.created_by !== user.id))
    throw new HttpError(404, "course_not_found", "Course not found.");
  return c;
};
const profileView = (ctx, user) => {
  const p = ctx.db
    .prepare("SELECT * FROM instructor_profiles WHERE user_id=?")
    .get(user.id);
  return {
    details: JSON.parse(p?.details || "{}"),
    completedAt: p?.completed_at || null,
    approved: !!user.instructor_approved,
    specialty: user.specialty || "",
  };
};
const roster = (ctx, user) =>
  ctx.db
    .prepare(
      `SELECT u.id,u.name,u.level,COUNT(DISTINCT p.lesson_id) started,SUM(p.completed) completed,MAX(p.updated_at) lastActive,COUNT(DISTINCT l.course_id) courses FROM progress p JOIN users u ON u.id=p.user_id JOIN lessons l ON l.id=p.lesson_id JOIN courses c ON c.id=l.course_id WHERE u.role='student' AND (?='admin' OR c.created_by=?) GROUP BY u.id ORDER BY lastActive DESC LIMIT 200`,
    )
    .all(user.role, user.id)
    .map((s) => ({
      ...s,
      percent: s.started ? Math.round((100 * s.completed) / s.started) : 0,
    }));
const student = (ctx, user, id) => {
  const s = roster(ctx, user).find(
    (x) => x.id === int(id, "studentId", { min: 1 }),
  );
  if (!s)
    throw new HttpError(
      404,
      "student_not_found",
      "Student not found in your courses.",
    );
  return s;
};
module.exports = (r) => {
  r.get("/api/instructor/profile", ({ ctx, user }) => {
    staff(user);
    return profileView(ctx, user);
  });
  r.patch("/api/instructor/profile", ({ ctx, user, body }) => {
    staff(user);
    const old = profileView(ctx, user),
      d = { ...old.details };
    const fields = {
      biography: 6000,
      specialization: 60,
      pedagogicalApproach: 6000,
      engagementStyle: 6000,
      artisticVision: 6000,
      proposedTitle: 150,
      outline: 12000,
      estimatedDuration: 50,
    };
    for (const [key, max] of Object.entries(fields))
      if (body[key] !== undefined)
        d[key] = text(body[key], key, { min: 0, max });
    if (body.experience !== undefined)
      d.experience =
        body.experience === "" || body.experience === null
          ? null
          : int(body.experience, "experience", { max: 100 });
    if (body.level !== undefined)
      d.level = oneOf(
        body.level,
        ["Beginner", "Intermediate", "Advanced"],
        "level",
      );
    if (body.step !== undefined)
      d.step = int(body.step, "step", { min: 1, max: 3 });
    for (const key of ["achievements", "objectives"])
      if (body[key] !== undefined) {
        if (!Array.isArray(body[key]) || body[key].length > 20)
          throw new HttpError(
            400,
            "invalid_list",
            "Use at most 20 " + key + ".",
          );
        d[key] = body[key].map((v) => text(v, key, { max: 300 }));
      }
    if (body.complete) {
      for (const key of [
        "biography",
        "specialization",
        "pedagogicalApproach",
        "engagementStyle",
        "artisticVision",
        "proposedTitle",
        "outline",
      ])
        if (!d[key]?.trim())
          throw new HttpError(
            400,
            "incomplete_profile",
            "Complete your " +
              key.replace(/[A-Z]/g, (c) => " " + c.toLowerCase()) +
              " before submitting.",
          );
      if (
        d.experience === null ||
        d.experience === undefined ||
        !d.objectives?.length
      )
        throw new HttpError(
          400,
          "incomplete_profile",
          "Add your experience and at least one learning objective.",
        );
    }
    tx(ctx.db, () => {
      ctx.db
        .prepare(
          "INSERT INTO instructor_profiles (user_id,details,completed_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET details=excluded.details,completed_at=excluded.completed_at,updated_at=excluded.updated_at",
        )
        .run(
          user.id,
          JSON.stringify(d),
          body.complete ? ctx.now() : old.completedAt,
          ctx.now(),
        );
      if (d.specialization)
        ctx.db
          .prepare("UPDATE users SET specialty=? WHERE id=?")
          .run(d.specialization, user.id);
    });
    return profileView(ctx, user);
  });
  r.get("/api/studio/overview", { auth: "instructor" }, ({ ctx, user }) => {
    const students = roster(ctx, user),
      courses = ctx.db
        .prepare(
          "SELECT id,title,published FROM courses WHERE (?='admin' OR created_by=?)",
        )
        .all(user.role, user.id),
      started = students.reduce((n, s) => n + s.started, 0),
      completed = students.reduce((n, s) => n + s.completed, 0);
    return {
      totalStudents: students.length,
      activeCourses: courses.filter((c) => c.published).length,
      completionRate: started ? Math.round((completed / started) * 100) : 0,
      monthlyRevenue: null,
      students,
      activity: ctx.db
        .prepare(
          `SELECT u.name,l.title,p.completed,p.updated_at at FROM progress p JOIN users u ON u.id=p.user_id JOIN lessons l ON l.id=p.lesson_id JOIN courses c ON c.id=l.course_id WHERE (?='admin' OR c.created_by=?) ORDER BY p.updated_at DESC LIMIT 12`,
        )
        .all(user.role, user.id),
    };
  });
  r.get("/api/studio/students", { auth: "instructor" }, ({ ctx, user }) => ({
    students: roster(ctx, user),
  }));
  r.get(
    "/api/studio/students/:id",
    { auth: "instructor" },
    ({ ctx, user, params }) => {
      const s = student(ctx, user, params.id),
        lessons = ctx.db
          .prepare(
            `SELECT l.id,l.title,c.title course,p.completed,p.position_sec positionSec,p.updated_at at FROM progress p JOIN lessons l ON l.id=p.lesson_id JOIN courses c ON c.id=l.course_id WHERE p.user_id=? AND (?='admin' OR c.created_by=?) ORDER BY p.updated_at DESC`,
          )
          .all(s.id, user.role, user.id);
      return {
        student: s,
        lessons,
        note:
          ctx.db
            .prepare(
              "SELECT note FROM instructor_student_notes WHERE instructor_id=? AND student_id=?",
            )
            .get(user.id, s.id)?.note || "",
      };
    },
  );
  r.put(
    "/api/studio/students/:id/notes",
    { auth: "instructor" },
    ({ ctx, user, params, body }) => {
      const s = student(ctx, user, params.id),
        note = text(body.note, "note", { min: 0, max: 6000 });
      ctx.db
        .prepare(
          "INSERT INTO instructor_student_notes (instructor_id,student_id,note,updated_at) VALUES (?,?,?,?) ON CONFLICT(instructor_id,student_id) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at",
        )
        .run(user.id, s.id, note, ctx.now());
      return { ok: true, note };
    },
  );
  r.patch(
    "/api/studio/courses/:id/settings",
    { auth: "instructor" },
    ({ ctx, user, params, body }) => {
      const c = ownCourse(ctx, user, params.id),
        d = JSON.parse(
          ctx.db
            .prepare("SELECT details FROM course_settings WHERE course_id=?")
            .get(c.id)?.details || "{}",
        );
      for (const [key, max] of Object.entries({
        instrument: 80,
        audience: 1000,
        publishAt: 50,
      }))
        if (body[key] !== undefined)
          d[key] = text(body[key], key, { min: 0, max });
      if (body.modules !== undefined) {
        if (!Array.isArray(body.modules) || body.modules.length > 50)
          throw new HttpError(
            400,
            "invalid_modules",
            "Use at most 50 modules.",
          );
        d.modules = body.modules.map((v) => text(v, "module", { max: 120 }));
      }
      if (body.accessType !== undefined)
        d.accessType = oneOf(
          body.accessType,
          ["subscription", "free", "one_time"],
          "accessType",
        );
      for (const k of ["priceUsd", "discountUsd", "capacity"])
        if (body[k] !== undefined) {
          if (
            !Number.isFinite(Number(body[k])) ||
            Number(body[k]) < 0 ||
            Number(body[k]) > 100000
          )
            throw new HttpError(
              400,
              "invalid_price",
              "Enter a valid " + k + ".",
            );
          d[k] = Number(body[k]);
        }
      for (const k of ["unlimited", "publicListing", "searchEngines"])
        if (body[k] !== undefined) d[k] = !!body[k];
      ctx.db
        .prepare(
          "INSERT INTO course_settings (course_id,details) VALUES (?,?) ON CONFLICT(course_id) DO UPDATE SET details=excluded.details",
        )
        .run(c.id, JSON.stringify(d));
      return { settings: d };
    },
  );
  r.put(
    "/api/studio/courses/:id/reorder",
    { auth: "instructor" },
    ({ ctx, user, params, body }) => {
      const c = ownCourse(ctx, user, params.id),
        ids = ctx.db
          .prepare("SELECT id FROM lessons WHERE course_id=?")
          .all(c.id)
          .map((x) => x.id),
        order = body.order;
      if (
        !Array.isArray(order) ||
        order.length !== ids.length ||
        new Set(order).size !== ids.length ||
        order.some((id) => !ids.includes(id))
      )
        throw new HttpError(
          400,
          "invalid_order",
          "Include every lesson in this course exactly once.",
        );
      tx(ctx.db, () =>
        order.forEach((id, i) =>
          ctx.db
            .prepare("UPDATE lessons SET position=? WHERE id=?")
            .run(i + 1, id),
        ),
      );
      return { ok: true };
    },
  );
  r.patch(
    "/api/studio/lessons/:id/settings",
    { auth: "instructor" },
    ({ ctx, user, params, body }) => {
      const l = ctx.db
        .prepare("SELECT * FROM lessons WHERE id=?")
        .get(int(params.id, "lessonId", { min: 1 }));
      if (!l) throw new HttpError(404, "lesson_not_found", "Lesson not found.");
      ownCourse(ctx, user, l.course_id);
      const d = JSON.parse(
        ctx.db
          .prepare("SELECT details FROM lesson_settings WHERE lesson_id=?")
          .get(l.id)?.details || "{}",
      );
      if (body.description !== undefined)
        d.description = text(body.description, "description", {
          min: 0,
          max: 6000,
        });
      if (body.tags !== undefined) {
        if (!Array.isArray(body.tags) || body.tags.length > 20)
          throw new HttpError(400, "invalid_tags", "Use at most 20 tags.");
        d.tags = body.tags.map((v) => text(v, "tag", { max: 60 }));
      }
      ctx.db
        .prepare(
          "INSERT INTO lesson_settings (lesson_id,details) VALUES (?,?) ON CONFLICT(lesson_id) DO UPDATE SET details=excluded.details",
        )
        .run(l.id, JSON.stringify(d));
      return { settings: d };
    },
  );
  r.get(
    "/api/studio/courses/:id/image",
    { auth: "instructor" },
    ({ ctx, user, params, req, res }) => {
      const c = ownCourse(ctx, user, params.id),
        row = ctx.db
          .prepare(
            "SELECT * FROM catalogue_images WHERE kind='course' AND target=?",
          )
          .get(String(c.id));
      if (!row)
        throw new HttpError(
          404,
          "image_not_found",
          "No course image uploaded.",
        );
      sendFile(
        req,
        res,
        path.join(
          ctx.config.storageDir,
          "images",
          path.basename(row.file_name),
        ),
        row.mime,
      );
      return HANDLED;
    },
  );
  r.put(
    "/api/studio/courses/:id/image",
    { auth: "instructor", stream: true },
    async ({ ctx, user, params, req }) => {
      const c = ownCourse(ctx, user, params.id),
        old = ctx.db
          .prepare(
            "SELECT * FROM catalogue_images WHERE kind='course' AND target=?",
          )
          .get(String(c.id)),
        dir = path.join(ctx.config.storageDir, "images"),
        f = await saveUpload(ctx, req, {
          id: "course-" + c.id,
          dir,
          types: imageTypes,
          max: 5 * 1048576,
        });
      try {
        ctx.db
          .prepare(
            "INSERT INTO catalogue_images (kind,target,file_name,mime,size_bytes) VALUES ('course',?,?,?,?) ON CONFLICT(kind,target) DO UPDATE SET file_name=excluded.file_name,mime=excluded.mime,size_bytes=excluded.size_bytes",
          )
          .run(String(c.id), f.fileName, f.mime, f.size);
      } catch (e) {
        await fs.rm(path.join(dir, f.fileName), { force: true });
        throw e;
      }
      if (old)
        await fs.rm(path.join(dir, path.basename(old.file_name)), {
          force: true,
        });
      return {
        ok: true,
        imageUrl:
          "/api/studio/courses/" +
          c.id +
          "/image?v=" +
          encodeURIComponent(f.fileName),
      };
    },
  );
  const resource = (ctx, user, id) => {
    const x = ctx.db
      .prepare(
        "SELECT r.* FROM resources r JOIN resource_owners o ON o.resource_id=r.id WHERE r.id=? AND (?='admin' OR o.user_id=?)",
      )
      .get(int(id, "resourceId", { min: 1 }), user.role, user.id);
    if (!x)
      throw new HttpError(404, "resource_not_found", "Resource not found.");
    return x;
  };
  const resourceView = (x) => ({
    id: x.id,
    title: x.title,
    subtitle: x.subtitle,
    kind: x.kind,
    category: x.category,
    minLevel: x.min_level,
    available: !!x.file_name,
    published: !!x.published,
  });
  r.get("/api/studio/resources", { auth: "instructor" }, ({ ctx, user }) => ({
    resources: ctx.db
      .prepare(
        "SELECT r.* FROM resources r JOIN resource_owners o ON o.resource_id=r.id WHERE (?='admin' OR o.user_id=?) ORDER BY r.id DESC",
      )
      .all(user.role, user.id)
      .map(resourceView),
  }));
  r.post(
    "/api/studio/resources",
    { auth: "instructor" },
    ({ ctx, user, body }) =>
      tx(ctx.db, () => {
        const id = Number(
          ctx.db
            .prepare(
              "INSERT INTO resources (title,subtitle,kind,category,min_level,published) VALUES (?,?,?,?,?,0)",
            )
            .run(
              text(body.title, "title", { max: 150 }),
              text(body.subtitle || "", "subtitle", { min: 0, max: 200 }),
              oneOf(body.kind || "PDF", ["PDF", "MIDI", "DOC"], "kind"),
              oneOf(
                body.category || "Sheet Music",
                ["Sheet Music", "MIDI Files"],
                "category",
              ),
              body.minLevel
                ? oneOf(
                    body.minLevel,
                    ["Beginner", "Intermediate", "Advanced"],
                    "minLevel",
                  )
                : null,
            ).lastInsertRowid,
        );
        ctx.db
          .prepare(
            "INSERT INTO resource_owners (resource_id,user_id) VALUES (?,?)",
          )
          .run(id, user.id);
        return { resource: resourceView(resource(ctx, user, id)) };
      }),
  );
  r.patch(
    "/api/studio/resources/:id",
    { auth: "instructor" },
    ({ ctx, user, params, body }) => {
      const x = resource(ctx, user, params.id);
      if (body.published && !x.file_name)
        throw new HttpError(
          409,
          "file_missing",
          "Upload a file before publishing.",
        );
      ctx.db
        .prepare("UPDATE resources SET published=? WHERE id=?")
        .run(body.published ? 1 : 0, x.id);
      return { resource: resourceView(resource(ctx, user, x.id)) };
    },
  );
  r.put(
    "/api/studio/resources/:id/file",
    { auth: "instructor", stream: true },
    async ({ ctx, user, params, req }) => {
      const x = resource(ctx, user, params.id),
        f = await saveUpload(ctx, req, {
          id: x.id,
          dir: resourcesDir(ctx),
          types: FILE_TYPES,
          max: 100 * 1048576,
          oldFile: x.file_name,
        });
      ctx.db
        .prepare("UPDATE resources SET file_name=? WHERE id=?")
        .run(f.fileName, x.id);
      return { ok: true, sizeBytes: f.size };
    },
  );
};
