"use strict";
// Build a self-contained design preview. Never open the real database or .env.
const fs = require("node:fs/promises");
const path = require("node:path");
const { openDb } = require("../src/db");
const { seed } = require("../src/seed");
const { createRouter } = require("../src/http");
const root = path.resolve(__dirname, "../..");
const output = path.join(root, "dist");
async function build() {
  const db = openDb(":memory:");
  try {
    const ctx = {
      db,
      now: () => Date.now(),
      config: { graceDays: 7, adminEmail: "", adminPassword: "" },
    };
    await seed(ctx, { log() {} });
    const router = createRouter();
    require("../src/routes/catalog")(router);
    const read = async (url) => {
      const { route, params } = router.match("GET", url);
      if (!route) throw new Error("Missing preview catalogue route: " + url);
      return route.handler({ ctx, user: null, query: {}, params });
    };
    const snapshot = {
      plans: await read("/api/plans"),
      courses: await read("/api/courses"),
      resources: await read("/api/resources"),
      lessons: await read("/api/lessons"),
      details: {},
    };
    for (const c of snapshot.courses.courses)
      snapshot.details[c.slug] = await read("/api/courses/" + c.slug);
    await fs.rm(output, { recursive: true, force: true });
    await fs.cp(path.join(root, "eartokeys-backend/public"), output, {
      recursive: true,
    });
    await fs.mkdir(path.join(output, "preview"), { recursive: true });
    await fs.cp(path.join(root, "preview"), path.join(output, "preview"), {
      recursive: true,
    });
    await fs.copyFile(
      path.join(root, "eartokeys-backend/samples/demo.mp4"),
      path.join(output, "preview/demo.mp4"),
    );
    await fs.writeFile(
      path.join(output, "preview/catalogue.js"),
      "window.__ETK_PREVIEW__=" +
        JSON.stringify(snapshot).replace(/</g, "\\u003c") +
        ";\n",
    );
    const index = path.join(output, "index.html");
    let html = await fs.readFile(index, "utf8");
    html = html.replace(
      "<head>",
      '<head><meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/preview/preview.css">',
    );
    html = html.replace(
      '<script src="/etk-api.js"></script>',
      '<script src="/preview/catalogue.js"></script><script src="/preview/runtime.js"></script><script src="/etk-api.js"></script>',
    );
    html = html.replace(
      '<script src="/student-ui.js"></script>',
      '<script src="/student-ui.js"></script><script src="/preview/screens.js"></script>',
    );
    await fs.writeFile(index, html);
    await fs.writeFile(
      path.join(output, "robots.txt"),
      "User-agent: *\nDisallow: /\n",
    );
    console.log(
      `Client preview built in dist/: ${snapshot.courses.courses.length} courses, ${snapshot.lessons.lessons.length} lesson layouts. No live database or secrets included.`,
    );
  } finally {
    db.close();
  }
}
build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
