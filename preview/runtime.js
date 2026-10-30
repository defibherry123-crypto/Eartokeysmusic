/* Installed in the static preview only. No account, payment or upload backend is deployed. */
(() => {
  "use strict";
  const data = window.__ETK_PREVIEW__;
  const originalFetch = window.fetch.bind(window);
  let viewing = sessionStorage.getItem("etk-preview-student") === "1";
  const savedRole = sessionStorage.getItem("etk-preview-role") || "student";
  const facultyCourses = structuredClone(data.courses.courses).map((c) => ({
    ...c,
    published: true,
    settings: { modules: data.details[c.slug].modules.map((m) => m.title) },
  }));
  const facultyLessons = data.lessons.lessons.map((l) => ({
    ...l,
    published: true,
    hasVideo: true,
    module: l.module,
    position: l.position,
    settings: { description: l.description || "", tags: [] },
  }));
  const facultyResources = structuredClone(data.resources.resources).map(
    (r) => ({ ...r, published: true }),
  );
  const facultyProfile = {
    details: {
      experience: 10,
      specialization: "Classical Performance",
      biography:
        "Preview instructor profile. Add your own musical journey and teaching approach.",
      achievements: [],
      pedagogicalApproach:
        "Combine guided practice with clear technical demonstrations.",
      engagementStyle:
        "Support steady progress with achievable weekly milestones.",
      artisticVision:
        "Help each student develop confidence and musical expression.",
      proposedTitle: "Foundations of Piano Artistry",
      level: "Beginner",
      estimatedDuration: "4 Weeks",
      objectives: ["Develop a confident piano technique"],
      outline: "Module 1: Foundations\nModule 2: Musical expression",
    },
    completedAt: Date.now(),
    approved: true,
    specialty: "Classical Performance",
  };
  const facultyStudents = [
    {
      id: 101,
      name: "Sarah Jenkins",
      level: "Intermediate",
      courses: 1,
      started: 8,
      completed: 6,
      percent: 75,
      lastActive: Date.now(),
    },
    {
      id: 102,
      name: "Ben Lambert",
      level: "Beginner",
      courses: 1,
      started: 6,
      completed: 2,
      percent: 33,
      lastActive: Date.now() - 86400000,
    },
    {
      id: 103,
      name: "Lydia Wu",
      level: "Advanced",
      courses: 1,
      started: 10,
      completed: 9,
      percent: 90,
      lastActive: Date.now() - 2 * 86400000,
    },
  ];
  const profile = { bio: "", avatarUrl: null, preferences: {} };
  const user = {
    id: "preview-student",
    name: "Preview Student",
    email: "student@preview.example",
    role: "student",
    level: "Advanced",
    emailVerified: true,
    instructorApproved: false,
  };
  if (savedRole === "instructor") {
    Object.assign(user, {
      id: "preview-instructor",
      name: "Preview Instructor",
      email: "instructor@preview.example",
      role: "instructor",
      instructorApproved: true,
    });
  }
  const progress = {};
  const access = () => ({
    state: "active",
    plan: "Advanced",
    billing: "monthly",
    periodEnd: Date.now() + 30 * 86400000,
  });
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const error = (message, status = 409) =>
    json({ error: { code: "design_preview", message } }, status);
  const lesson = (row) => ({
    ...row,
    ready: true,
    locked: false,
    lockedReason: null,
    ...progress[row.id],
  });
  const me = () => ({ user, access: access() });
  window.PreviewSite = {
    async openStudent() {
      viewing = true;
      Object.assign(user, {
        id: "preview-student",
        name: "Preview Student",
        email: "student@preview.example",
        role: "student",
        instructorApproved: false,
      });
      sessionStorage.setItem("etk-preview-role", "student");
      sessionStorage.setItem("etk-preview-student", "1");
      await window.PreviewSite.refresh?.();
      if (location.hash === "#/app/dash")
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      else location.hash = "#/app/dash";
    },
    async openInstructor() {
      viewing = true;
      Object.assign(user, {
        id: "preview-instructor",
        name: "Preview Instructor",
        email: "instructor@preview.example",
        role: "instructor",
        instructorApproved: true,
      });
      sessionStorage.setItem("etk-preview-role", "instructor");
      sessionStorage.setItem("etk-preview-student", "1");
      await window.PreviewSite.refresh?.();
      if (location.hash === "#/studio")
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      else location.hash = "#/studio";
    },
    async notice() {
      return error(
        "This is a design preview. Use the local app for real accounts, uploads and payments.",
      );
    },
  };
  window.fetch = async (input, options = {}) => {
    const url = new URL(
      typeof input === "string" ? input : input.url,
      location.href,
    );
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
      return originalFetch(input, options);
    const method = (
      options.method || (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const p = url.pathname;
    // No request is ever forwarded to a live API from this preview.
    if (method === "GET") {
      if (p === "/api/plans") return json(data.plans);
      if (p === "/api/courses") return json(data.courses);
      if (p.startsWith("/api/courses/")) {
        const detail =
          data.details[decodeURIComponent(p.slice("/api/courses/".length))];
        if (!detail) return error("Course not found.", 404);
        return json({
          ...detail,
          modules: detail.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map(lesson),
          })),
        });
      }
      if (p === "/api/resources") return json(data.resources);
      if (p === "/api/images") return json({ images: [] });
      if (p === "/api/me")
        return viewing
          ? json(me())
          : error("Open Student Preview to browse the student screens.", 401);
      if (!viewing)
        return error(
          "Open Student Preview to browse the student screens.",
          401,
        );
      if (p === "/api/profile") return json(profile);
      if (p === "/api/instructor/profile") return json(facultyProfile);
      if (p === "/api/studio/courses") return json({ courses: facultyCourses });
      if (p === "/api/studio/lessons")
        return json({
          lessons: facultyLessons.map((l) => ({
            ...l,
            courseId: l.courseId || 1,
          })),
        });
      if (p === "/api/studio/resources")
        return json({ resources: facultyResources });
      if (p === "/api/studio/overview")
        return json({
          totalStudents: 3,
          activeCourses: facultyCourses.filter((c) => c.published).length,
          completionRate: 67,
          monthlyRevenue: null,
          students: facultyStudents,
          activity: [
            {
              name: "Sarah Jenkins",
              title: "Five-Finger Exercises",
              completed: true,
              at: Date.now(),
            },
          ],
        });
      if (p === "/api/studio/students")
        return json({ students: facultyStudents });
      const studentMatch = /^\/api\/studio\/students\/(\d+)$/.exec(p);
      if (studentMatch) {
        const student = facultyStudents.find((s) => s.id === +studentMatch[1]);
        if (!student) return error("Student not found.", 404);
        return json({
          student,
          lessons: facultyLessons
            .slice(0, 3)
            .map((l) => ({
              ...l,
              course: "Piano Foundations",
              at: Date.now(),
              completed: false,
            })),
          note: student.note || "",
        });
      }
      if (p === "/api/billing/history")
        return json({ access: access(), payments: [] });
      if (p === "/api/lessons")
        return json({
          access: access(),
          lessons: data.lessons.lessons.map(lesson),
        });
      const match = /^\/api\/lessons\/(\d+)$/.exec(p);
      if (match) {
        const row = data.lessons.lessons.find((l) => l.id === +match[1]);
        if (!row) return error("Lesson not found.", 404);
        return json({
          lesson: lesson(row),
          course: {
            id: row.courseId,
            title: row.courseTitle,
            slug: row.courseSlug,
          },
          siblings: data.lessons.lessons
            .filter((l) => l.courseId === row.courseId)
            .map(lesson),
          access: access(),
        });
      }
      return error(
        "This feature needs the live backend. This site is a design preview.",
      );
    }
    if (method === "POST" && p === "/api/auth/logout") {
      viewing = false;
      sessionStorage.removeItem("etk-preview-student");
      return json({ ok: true });
    }
    if (!viewing)
      return error(
        "Accounts are not created or authenticated on this preview. Choose Student Preview to explore without signing in.",
      );
    let body = {};
    if (typeof options.body === "string") {
      try {
        body = JSON.parse(options.body);
      } catch {}
    }
    if (method === "PATCH" && p === "/api/instructor/profile") {
      const { complete, ...details } = body;
      Object.assign(facultyProfile.details, details);
      if (complete) facultyProfile.completedAt = Date.now();
      return json(facultyProfile);
    }
    if (method === "POST" && p === "/api/studio/courses") {
      const course = {
        id: Math.max(...facultyCourses.map((c) => c.id), 0) + 1,
        slug: "preview-course-" + Date.now(),
        ...body,
        published: false,
        settings: {},
      };
      facultyCourses.push(course);
      return json({ course });
    }
    const courseMatch =
      /^\/api\/studio\/courses\/(\d+)(?:\/(settings|reorder))?$/.exec(p);
    if (courseMatch) {
      const c = facultyCourses.find((c) => c.id === +courseMatch[1]);
      if (!c) return error("Course not found.", 404);
      if (courseMatch[2] === "settings") {
        Object.assign(c.settings, body);
        return json({ settings: c.settings });
      }
      if (courseMatch[2] === "reorder") {
        for (const [i, id] of body.order.entries()) {
          const l = facultyLessons.find((l) => l.id === id);
          if (l) l.position = i + 1;
        }
        return json({ ok: true });
      }
      Object.assign(c, body);
      return json({ course: c });
    }
    if (method === "POST" && p === "/api/studio/lessons") {
      const l = {
        id: Math.max(...facultyLessons.map((l) => l.id), 0) + 1,
        ...body,
        published: false,
        hasVideo: false,
        position: facultyLessons.length + 1,
        settings: {},
      };
      facultyLessons.push(l);
      return json({ lesson: l });
    }
    const facultyLessonMatch =
      /^\/api\/studio\/lessons\/(\d+)(?:\/(settings))?$/.exec(p);
    if (facultyLessonMatch) {
      const l = facultyLessons.find((l) => l.id === +facultyLessonMatch[1]);
      if (!l) return error("Lesson not found.", 404);
      if (method === "DELETE") {
        facultyLessons.splice(facultyLessons.indexOf(l), 1);
        return json({ ok: true });
      }
      if (facultyLessonMatch[2]) {
        Object.assign(l.settings, body);
        return json({ settings: l.settings });
      }
      Object.assign(l, body);
      return json({ lesson: l });
    }
    const noteMatch = /^\/api\/studio\/students\/(\d+)\/notes$/.exec(p);
    if (noteMatch) {
      const student = facultyStudents.find((s) => s.id === +noteMatch[1]);
      if (student) student.note = body.note;
      return json({ ok: true });
    }
    if (method === "PATCH" && p === "/api/me") {
      if (typeof body.name === "string") user.name = body.name.slice(0, 100);
      if (["Beginner", "Intermediate", "Advanced"].includes(body.level))
        user.level = body.level;
      return json(me());
    }
    if (method === "PATCH" && p === "/api/profile") {
      if (typeof body.bio === "string") profile.bio = body.bio.slice(0, 500);
      if (body.preferences) profile.preferences = body.preferences;
      return json(profile);
    }
    const watched = /^\/api\/lessons\/(\d+)\/progress$/.exec(p);
    if (method === "PUT" && watched) {
      progress[watched[1]] = {
        completed: !!body.completed || !!progress[watched[1]]?.completed,
        positionSec: +body.position || 0,
      };
      return json({ ok: true });
    }
    if (method === "POST" && /^\/api\/lessons\/\d+\/stream-url$/.test(p))
      return json({
        url: "/preview/demo.mp4",
        expiresAt: Date.now() + 86400000,
        watermark: "DESIGN PREVIEW · SAMPLE CLIP",
        resumeAt: 0,
      });
    return error(
      "This is a design preview. No payment, email, file upload, or account change is sent to a server.",
    );
  };
})();
