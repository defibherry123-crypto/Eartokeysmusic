"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
test("Vercel build is independent of production credentials and the existing database", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etk-preview-build-"));
  const database = path.join(dir, "live.db");
  const canary = "Existing database must not be opened or replaced";
  fs.writeFileSync(database, canary);
  try {
    const build = spawnSync(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        "eartokeys-backend/scripts/build-preview.js",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "production",
          DB_PATH: database,
          STORAGE_DIR: dir,
          ADMIN_EMAIL: "private-account@build-test.example",
          ADMIN_PASSWORD: "PRIVATE_BUILD_CANARY_PASSWORD",
          APP_SECRET: "PRIVATE_BUILD_CANARY_APP_SECRET",
          PAYSTACK_SECRET_KEY: "PRIVATE_BUILD_CANARY_PAYSTACK",
        },
      },
    );
    assert.equal(build.status, 0, build.stderr);
    assert.equal(fs.readFileSync(database, "utf8"), canary);
    const output = path.join(root, "dist");
    const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
    assert.match(html, /preview\/runtime\.js/);
    assert.match(html, /preview\/screens\.js/);
    assert.match(html, /noindex,nofollow/);
    assert.ok(fs.existsSync(path.join(output, "preview/demo.mp4")));
    for (const forbidden of [
      ".env",
      "data",
      "storage",
      "src",
      "test",
      "node_modules",
    ])
      assert.equal(
        fs.existsSync(path.join(output, forbidden)),
        false,
        forbidden,
      );
    for (const name of ["catalogue.js", "runtime.js", "screens.js"]) {
      const content = fs.readFileSync(
        path.join(output, "preview", name),
        "utf8",
      );
      assert.doesNotMatch(
        content,
        /PRIVATE_BUILD_CANARY|private-account@build-test\.example/,
      );
    }
    const source = fs.readFileSync(
      path.join(root, "eartokeys-backend/public/index.html"),
      "utf8",
    );
    assert.doesNotMatch(source, /preview\/runtime\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
