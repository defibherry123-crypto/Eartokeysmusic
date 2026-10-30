/* Installed in the static preview only. No account, payment or upload backend is deployed. */
(() => {
  "use strict";
  const data = window.__ETK_PREVIEW__;
  const originalFetch = window.fetch.bind(window);
  let viewing = sessionStorage.getItem("etk-preview-student") === "1";
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
      sessionStorage.setItem("etk-preview-student", "1");
      await window.PreviewSite.refresh?.();
      if (location.hash === "#/app/dash")
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      else location.hash = "#/app/dash";
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
