/* Instructor workspace based on the supplied faculty references. */
const InstructorUI = (() => {
  const I = {
    profile: { details: {} },
    avatar: null,
    overview: { students: [], activity: [] },
    students: [],
    resources: [],
    query: "",
    lessonFilter: "All Lessons",
    resourceFilter: "All Files",
    reviewFilter: "All",
    page: 1,
    course: null,
    videoUrl: null,
    videoWidth: 0,
    videoHeight: 0,
    videoDescription: "",
    videoTags: "",
    reviewTab: "Feedback",
    ratings: [7, 7, 7, 7],
  };
  const icon = StudentUI.icon;
  I.logo = () =>
    `<a class="iu-logo" href="#/home"><b>&#119070;</b>EartoKeysMusic</a>`;
  I.avatar = (name = S.user?.name || "", own = true) =>
    I.avatarUrl && own
      ? `<img class="iu-avatar" src="${esc(I.avatarUrl)}" alt="Your headshot">`
      : `<span class="iu-avatar">${name.slice(0, 1)}</span>`;
  I.footer = () =>
    `<footer class="iu-footer"><span>© 2026 EartoKeysMusic. All rights reserved.</span><nav><a href="#/terms">Terms</a><a href="#/privacy">Privacy</a><a href="#/support">Support</a></nav></footer>`;
  I.note = (message) => `<p class="iu-notice">${message}</p>`;
  I.empty = (message) => `<div class="iu-empty">${message}</div>`;
  I.badge = (text, kind = "") =>
    `<span class="iu-badge ${kind}">${esc(text)}</span>`;
  I.photo = (url, extra = "") =>
    `<div class="iu-photo ${extra}">${uploadedPhoto(url)}</div>`;
  I.courseImage = (c) => c?.imageUrl || imageFor("course", c?.id);
  I.top = (title = "", actions = "") =>
    `<header class="iu-top">${title ? `<h2>${title}</h2>` : `<label class="iu-search">${icon("search")}<input id="iu-search" type="search" placeholder="Search students, courses, assets..." aria-label="Search instructor workspace" value="${esc(I.query)}" oninput="InstructorUI.query=this.value;InstructorUI.page=1;rt(1)"></label>`}<div class="iu-top-actions">${actions || '<button class="btn" onclick="InstructorUI.newCourse()">Quick Create</button>'}<a aria-label="Notifications" href="#/studio/notifications">${icon("bell")}</a><a aria-label="Instructor settings" href="#/onboard/1">${icon("settings")}</a>${I.avatar()}</div></header>`;
  const oldShell = shell;
  shell = function (role, on, html) {
    if (role !== "inst") return oldShell(role, on, html);
    return I.shell(on, html);
  };
  I.shell = (on, html) =>
    `<div class="instructor-shell"><aside class="instructor-sidebar">${I.logo()}<p>Instructor Portal</p><nav aria-label="Instructor navigation">${[
      ["studio", "Dashboard", "dashboard"],
      ["studio/courses", "My Courses", "courses"],
      ["studio/lessons", "Lessons", "resources"],
      ["studio/lesson", "Video Studio", "video"],
      ["studio/students", "Students", "community"],
      ["studio/reviews", "Performance Reviews", "comment"],
      ["studio/resources", "Resources", "resources"],
    ]
      .map(
        ([r, t, x]) =>
          `<a href="#/${r}" class="${on === r ? "active" : ""}" ${on === r ? 'aria-current="page"' : ""}>${icon(x)}${t}</a>`,
      )
      .join(
        "",
      )}</nav><div class="iu-sidebar-bottom"><a class="btn w" href="#/studio/sessions">Start New Session</a><div class="iu-sidebar-divider"></div><a href="#/studio/notifications">${icon("bell")}Notifications</a><a href="#/onboard/1">${icon("settings")}Settings</a><a class="iu-instructor-id" href="#/onboard/1">${I.avatar()}<span><b>${S.user?.name || "Instructor"}</b><small>Instructor</small></span></a><button class="iu-signout" onclick="signOut()">Sign out</button></div></aside><main class="instructor-main">${html}</main></div>`;
  I.matches = (s) => s.toLowerCase().includes(I.query.toLowerCase());
  I.load = async () => {
    I.profile = await ETK.call("GET", "/api/instructor/profile");
    const p = await ETK.call("GET", "/api/profile");
    I.avatarUrl = p.avatarUrl;
    I.onboard = { ...I.profile.details };
    I.onboard.achievements ||= [];
    if (!I.onboard.objectives?.length) I.onboard.objectives = [""];
    I.onboard.level ||= "Beginner";
    I.onboard.estimatedDuration ||= "4 Weeks";
    I.onboard.specialization ||= I.profile.specialty || "Classical Performance";
  };
  const oldPreload = preload;
  preload = async function (a, b, c) {
    if (a === "onboard") {
      if (S.user?.role === "sub") return;
      await I.load();
      return;
    }
    await oldPreload(a, b, c);
    if (a === "instlogin" || a === "join") {
      await loadCatalogImages();
      return;
    }
    if (a !== "studio") return;
    await I.load();
    if (S.studioErr) return;
    if (!b) I.overview = await ETK.call("GET", "/api/studio/overview");
    if (b === "students")
      I.students = (await ETK.call("GET", "/api/studio/students")).students;
    if (b === "student") {
      I.studentDetail = null;
      I.studentDetail = await ETK.call("GET", "/api/studio/students/" + c);
    }
    if (b === "resources")
      I.resources = (await ETK.call("GET", "/api/studio/resources")).resources;
    if (b === "create") {
      const id =
        Q.get("course") ||
        I.course?.id ||
        sessionStorage.getItem("etk-course-draft-" + S.user.id);
      I.course = S.icourses.find((x) => x.id == id) || null;
    }
  };
  I.togglePassword = () => {
    const p = document.querySelector("#p");
    p.type = p.type === "password" ? "text" : "password";
    document
      .querySelector("[data-iu-password]")
      .setAttribute(
        "aria-label",
        p.type === "password" ? "Show password" : "Hide password",
      );
  };
  I.login = () =>
    accountAction(async () => {
      const d = await ETK.login(
        document.querySelector("#e").value.trim(),
        document.querySelector("#p").value,
      );
      if (!["instructor", "admin"].includes(d.user.role)) {
        await ETK.logout();
        S.user = null;
        setAccess(null);
        throw new Error(
          "Use an instructor account for this portal. Student sign-in is available from the main website.",
        );
      }
      setMe(d);
      if (S.user.role === "admin") return go("#/admin");
      if (!S.user.verified) return go("#/verify");
      await I.load();
      go(I.profile.completedAt ? "#/studio" : "#/onboard/1");
    });
  I.auth = (join) =>
    `<div class="iu-auth ${join ? "iu-join" : "iu-login"}"><section class="iu-auth-photo" style="background-image:linear-gradient(0deg,#0005,transparent 65%),url('${esc(imageFor("feature", join ? "instructor-join" : "instructor-login") || imageFor("feature", "founder-studio") || "/assets/piano-hero.png")}')">${join ? I.logo() : ""}<div class="${join ? "iu-glass" : ""}"><h2>${join ? "The Art of<br>Instruction" : "EartoKeysMusic"}</h2><p>${join ? "Join an elite circle of educators dedicated to the mastery of piano performance. At EartoKeys, we bridge the gap between classical tradition and digital innovation." : "“The piano keys are black and white but they sound like a million colors in your mind.”"}</p></div></section><section class="iu-auth-content">${join ? "" : I.logo()}<h1>${join ? "Join the Faculty" : "Instructor Portal"}</h1><p>${join ? "Begin your journey as a distinguished instructor at EarToKeysMusic." : "Sign in to manage your students and curriculum."}</p><form class="auth-form" onsubmit="event.preventDefault();${join ? "joinI()" : "InstructorUI.login()"}"><p data-form-error class="iu-form-error" role="alert" hidden></p>${join ? '<label>Full Name<input id="n" required autocomplete="name" maxlength="100" placeholder="Joshua Raphael"></label>' : ""}<label>${join ? "Professional Email" : "Email Address"}<span class="iu-input-icon">${join ? "" : privacyIcon("mail")}<input id="e" type="email" autocomplete="email" required placeholder="${join ? "j.sterling@conservatory.edu" : "instructor@gmail.com"}"></span></label>${join ? `<label>Specialty<select id="sp" required><option value="">Select your discipline</option>${["Classical Performance", "Jazz & Improvisation", "Worship Piano", "Music Theory", "Piano Technique"].map((s) => `<option>${s}</option>`).join("")}</select></label>` : ""}<label><span class="iu-label-line">Password${join ? "" : '<a href="#/reset">Forgot Password?</a>'}</span><span class="iu-input-icon iu-password">${join ? "" : icon("lock")}<input id="p" type="password" required ${join ? 'minlength="8"' : ""} autocomplete="${join ? "new-password" : "current-password"}" placeholder="${join ? "Min. 8 characters" : "••••••••"}"><button type="button" data-iu-password aria-label="Show password" onclick="InstructorUI.togglePassword()">${icon("eye")}</button></span></label><button class="btn w" type="submit">${join ? "Apply to Teach" : "SIGN IN"} ${icon("arrow")}</button></form>${join ? '<p class="iu-approval-copy">New instructors require administrator approval before publishing.</p>' : '<div class="iu-or">OR</div>'}<p class="iu-auth-switch">${join ? 'Already have an account? <a href="#/instlogin">Sign In</a>' : 'New to Eartokeys? <a href="#/join">CREATE ACCOUNT</a>'}</p><footer>${join ? '<a href="#/privacy">PRIVACY</a><a href="#/support">SUPPORT</a><a href="#/terms">TERMS</a>' : '© 2026 EartoKeysMusic. All rights reserved. | <a href="#/terms">Terms</a> | <a href="#/privacy">Privacy</a>'}</footer></section></div>`;
  V.instlogin = () => I.auth(false);
  V.join = () => I.auth(true);
  I.field = (key, value) => {
    I.onboard[key] = value;
    if (route().a === "onboard" && route().b === "2") {
      clearTimeout(I.autoTimer);
      I.autoTimer = setTimeout(
        () =>
          I.persistOnboarding(false).catch((e) => I.status(e.message, true)),
        900,
      );
    }
  };
  I.status = (message, error = false) => {
    const p = document.querySelector("#iu-save-status");
    if (p) {
      p.textContent = message;
      p.dataset.error = error;
    }
  };
  I.persistOnboarding = async (complete) => {
    clearTimeout(I.autoTimer);
    const body = JSON.parse(
      JSON.stringify({
        ...I.onboard,
        step: Math.min(3, +route().b || 1),
        complete: !!complete,
      }),
    );
    body.objectives = (body.objectives || []).filter((x) => x.trim());
    body.achievements = (body.achievements || []).filter((x) => x.trim());
    I.saveChain = (I.saveChain || Promise.resolve())
      .catch(() => {})
      .then(() => ETK.call("PATCH", "/api/instructor/profile", body));
    const d = await I.saveChain;
    I.profile = d;
    I.status("Draft saved");
    return d;
  };
  I.saveOnboarding = async (next, complete = false) => {
    const buttons = document.querySelectorAll(
      ".iu-onboard button[type=submit],.iu-onboard .iu-save-draft",
    );
    buttons.forEach((b) => (b.disabled = true));
    try {
      await I.persistOnboarding(complete);
      if (next) go("#/onboard/" + next);
      else toast("Instructor draft saved");
    } catch (e) {
      I.status(e.message, true);
      toast(e.message);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  };
  I.addAchievement = () => {
    const input = document.querySelector("#iu-achievement");
    if (!input.value.trim()) return;
    I.onboard.achievements.push(input.value.trim().slice(0, 300));
    rt();
  };
  I.removeAchievement = (index) => {
    I.onboard.achievements.splice(index, 1);
    rt();
  };
  I.addObjective = () => {
    I.onboard.objectives.push("");
    rt();
  };
  I.uploadHeadshot = async (file) => {
    if (!file) return;
    try {
      await ETK.upload("/api/profile/avatar", file, prog, file.type);
      I.avatarUrl = (await ETK.call("GET", "/api/profile")).avatarUrl;
      rt();
      toast("Headshot saved");
    } catch (e) {
      toast(e.message);
    }
  };
  I.stepper = (step) =>
    `<div class="iu-onboard-stepper">${[1, 2, 3].map((n) => `<span class="${n <= step ? "active" : ""}">${n < step ? "✓" : n}</span>`).join("")}</div>`;
  V.onboard = (step) => {
    step = Math.min(4, Math.max(1, +step || 1));
    const d = I.onboard || {},
      field = (key, label, placeholder, rows = 0) =>
        `<label>${label}${rows ? `<textarea rows="${rows}" maxlength="${key === "outline" ? 12000 : 6000}" required placeholder="${placeholder}" oninput="InstructorUI.field('${key}',this.value)">${esc(d[key] || "")}</textarea>` : `<input value="${esc(d[key] ?? "")}" placeholder="${placeholder}" required oninput="InstructorUI.field('${key}',this.value)">`}</label>`;
    let content;
    if (step === 4)
      content = `<section class="iu-onboard-complete"><span class="iu-success">${icon("check")}</span><h1>${I.profile.approved ? "Welcome to the Faculty" : "Your Profile Is Submitted"}</h1><p>${I.profile.approved ? "Your profile is saved. You can now build your curriculum in the instructor workspace." : "Your profile and curriculum plan are saved. An administrator must approve your instructor account before you can publish."}</p><a class="btn" href="#/studio">Enter Instructor Portal</a><a href="#/onboard/1">Edit Your Profile</a></section>`;
    else if (step === 1)
      content = `<div class="iu-onboard-heading"><div class="iu-mini-steps"><i></i><i></i><i></i></div><span>Step 1 of 3</span><h1>Create Your Profile</h1><p>Help our students get to know the master behind the<br> music.</p></div><form class="iu-onboard-form" onsubmit="event.preventDefault();InstructorUI.saveOnboarding(2)"><section class="iu-headshot-card">${I.avatar()}<div><h2>Professional Headshot</h2><p>Upload a high-resolution portrait. Aim for a studio-quality look with natural lighting.</p><label class="iu-file-link">${icon("uploads")}Browse Files<input type="file" accept="image/png,image/jpeg,image/webp" onchange="InstructorUI.uploadHeadshot(this.files[0])"></label></div></section><div class="iu-two"><label>Years of Teaching Experience<input type="number" min="0" max="100" required value="${d.experience ?? ""}" placeholder="e.g. 15" oninput="InstructorUI.field('experience',this.value)"></label><label>Primary Specialization<select required onchange="InstructorUI.field('specialization',this.value)">${["Classical Performance", "Jazz & Improvisation", "Worship Piano", "Music Theory", "Piano Technique"].map((s) => `<option ${d.specialization === s ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>${field("biography", "Instructor Biography", "Share your musical journey, your teaching philosophy, and what students can expect from your lessons...", 6)}<small>Recommended: 200–400 words for an editorial feel.</small><label>Notable Achievements</label><div class="iu-add-row"><input id="iu-achievement" maxlength="300" placeholder="e.g. Doctorate from Juilliard"><button type="button" aria-label="Add achievement" onclick="InstructorUI.addAchievement()">+</button></div><div class="iu-achievements">${(d.achievements || []).map((a, i) => `<div>✪ ${esc(a)}<button type="button" aria-label="Remove achievement" onclick="InstructorUI.removeAchievement(${i})">×</button></div>`).join("")}</div><p id="iu-save-status" role="status"></p><div class="iu-onboard-actions"><button type="button" class="btn out iu-save-draft" onclick="InstructorUI.saveOnboarding()">Save Draft</button><button class="btn" type="submit">Next Step: Teaching Philosophy ${icon("arrow")}</button></div></form>`;
    else if (step === 2)
      content = `<div class="iu-onboard-heading"><h1>Teaching Philosophy</h1><p>Define your unique educational voice and artistic values to help students find<br> their perfect mentor.</p>${I.stepper(2)}</div><form class="iu-onboard-form iu-philosophy" onsubmit="event.preventDefault();InstructorUI.saveOnboarding(3)"><section class="iu-panel">${[
        [
          "pedagogicalApproach",
          "Pedagogical Approach",
          "Describe your fundamental teaching methods and how you structure your lessons.",
          "e.g., I focus on a balance of technical proficiency and creative expression...",
        ],
        [
          "engagementStyle",
          "Student Engagement Style",
          "How do you motivate students and adapt to different learning paces?",
          "e.g., I believe in positive reinforcement and setting achievable weekly milestones...",
        ],
        [
          "artisticVision",
          "Artistic Vision",
          "What is the ultimate goal you have for your students’ musical journey?",
          "e.g., To cultivate a lifelong love for music and the confidence to perform...",
        ],
      ]
        .map(
          ([k, t, copy, placeholder]) =>
            `<div><h2>${t}</h2><p>${copy}</p><textarea required rows="6" maxlength="6000" aria-label="${t}" placeholder="${placeholder}" oninput="InstructorUI.field('${k}',this.value)">${esc(d[k] || "")}</textarea></div>`,
        )
        .join(
          "",
        )}</section><div class="iu-onboard-actions"><button class="btn out" type="button" onclick="InstructorUI.saveOnboarding(1)">Back to Profile</button><span id="iu-save-status" role="status">Settings are saved as you configure.</span><button type="submit" class="btn">Continue to Curriculum Planning</button></div></form>`;
    else
      content = `<div class="iu-onboard-heading"><h1>Plan Your Curriculum</h1><p>Define the roadmap for your students’ success.</p></div><form class="iu-onboard-form iu-planning" onsubmit="event.preventDefault();InstructorUI.onboard.objectives=InstructorUI.onboard.objectives.filter(x=>x.trim());InstructorUI.saveOnboarding(4,true)"><section class="iu-panel">${field("proposedTitle", "Proposed Course Title", "e.g., Mastering Romantic Period Dynamics")}<div class="iu-two"><label>Target Difficulty Level<select onchange="InstructorUI.field('level',this.value)">${L.map((l) => `<option ${d.level === l ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>Estimated Duration<select onchange="InstructorUI.field('estimatedDuration',this.value)">${["4 Weeks", "8 Weeks", "12 Weeks", "Self-paced"].map((t) => `<option ${d.estimatedDuration === t ? "selected" : ""}>${t}</option>`).join("")}</select></label></div><label>Key Learning Objectives</label><div class="iu-objectives">${(d.objectives?.length ? d.objectives : [""]).map((x, i) => `<div><input required maxlength="300" aria-label="Objective ${i + 1}" placeholder="Objective ${i + 1}: What will students learn?" value="${esc(x)}" oninput="InstructorUI.onboard.objectives[${i}]=this.value"><button type="button" aria-label="Remove objective ${i + 1}" onclick="InstructorUI.onboard.objectives.splice(${i},1);rt()">${privacyIcon("trash")}</button></div>`).join("")}</div><button type="button" class="iu-text-button" onclick="InstructorUI.addObjective()">+ Add Another Objective</button>${field("outline", "Curriculum Outline", "Module 1: Introduction to Musicality\nModule 2: The Art of Phrasing\nModule 3: Advanced Pedal Techniques...", 9)}<p id="iu-save-status" role="status"></p><div class="iu-onboard-actions"><button type="button" class="iu-text-button" onclick="InstructorUI.saveOnboarding(2)">← Previous Step</button><button type="submit" class="btn">Complete Registration</button></div></section><div class="iu-tips">${[
        ["Clear Path", "Students prefer linear, outcome-based roadmaps."],
        ["Visual Cues", "Plan for high-quality video demonstrations."],
        ["We’re Here", "Contact support for help polishing your outline."],
      ]
        .map(([t, copy]) => `<div><h3>${t}</h3><p>${copy}</p></div>`)
        .join("")}</div></form>`;
    return `<div class="iu-onboard"><header class="iu-onboard-header">${I.logo()}<a href="#/studio" aria-label="Instructor workspace">${icon("community")}</a></header>${content}${I.footer()}</div>`;
  };
  I.stat = (label, value, x = "resources", foot = "") =>
    `<article class="iu-stat"><span>${label}</span><i>${icon(x)}</i><b>${value}</b><small>${foot}</small></article>`;
  I.rosterTable = (students, short = false) =>
    `<div class="iu-table-wrap"><table><thead><tr><th>Student</th><th>${short ? "Current Courses" : "Course Enrollment"}</th><th>Progress</th><th>${short ? "Status" : "Last Active"}</th></tr></thead><tbody>${students.map((s) => `<tr><td><a class="iu-person" href="#/studio/student/${s.id}">${I.avatar(esc(s.name), false)}<b>${esc(s.name)}</b></a></td><td>${s.courses} ${s.courses === 1 ? "course" : "courses"}<small>${esc(s.level || "Level not set")}</small></td><td><div class="iu-progress"><i style="width:${s.percent}%"></i></div><small>${s.percent}% of started lessons completed</small></td><td>${short ? I.badge(Date.now() - s.lastActive < 7 * 86400000 ? "Active" : "Inactive", Date.now() - s.lastActive < 7 * 86400000 ? "green" : "gray") : when(s.lastActive)}</td></tr>`).join("") || '<tr><td colspan="4">Students appear after they start lessons in your courses.</td></tr>'}</tbody></table></div>`;
  IN.studio = () => {
    const d = I.overview,
      pending = S.rev.filter((r) => r.st === "Pending");
    return I.shell(
      "studio",
      `${I.top()}<div class="iu-content"><h1>Welcome back, ${S.user.name.split(" ")[0]}.</h1><p class="iu-lead">Manage your students, refine your curriculum, and share your musical expertise.</p>${!I.profile.completedAt ? I.note('Complete your <a href="#/onboard/1">instructor profile</a> to introduce yourself to students.') : ""}<div class="iu-stats">${I.stat("Total Students", d.totalStudents ?? 0, "community", "Students learning your content")}${I.stat("Active Courses", d.activeCourses ?? 0, "courses", "Published courses")}${I.stat("Completion Rate", (d.completionRate ?? 0) + "%", "check", "Completed / started lessons")}${I.stat("Monthly Revenue", d.monthlyRevenue == null ? "—" : naira(d.monthlyRevenue), "card", "Instructor payouts are not tracked")}</div><div class="iu-dashboard-grid"><section><article class="iu-panel iu-flush"><header><h3>Pending Performance Reviews</h3><a href="#/studio/reviews">View All →</a></header>${I.note("Review preview · sample submissions are stored on this browser.")}<div class="iu-review-summaries">${
        pending
          .slice(0, 2)
          .map(
            (r) =>
              `<div>${I.avatar(esc(r.s), false)}<div><b>${esc(r.s)}</b><small>${esc(r.p)}</small></div><a class="btn out sm" href="#/studio/reviews/${S.rev.indexOf(r)}">Review</a></div>`,
          )
          .join("") || I.empty("All sample reviews completed.")
      }</div></article><article class="iu-panel iu-flush"><header><h3>Recent Student Progress</h3><a aria-label="Download student progress CSV" href="#/studio/students" onclick="event.preventDefault();InstructorUI.exportStudents()">${icon("download")}</a></header>${I.rosterTable(d.students || [], true)}<a class="iu-panel-foot" href="#/studio/students">Load More Students</a></article></section><aside><h3>Quick Actions</h3><a class="iu-quick-card dark" href="#/studio/create/1" onclick="InstructorUI.resetCourse()">${icon("courses")}<h2>Create New Course</h2><p>Launch a new curriculum for your students.</p></a><a class="iu-quick-card" href="#/studio/lesson">${icon("uploads")}<h2>Upload Lesson</h2><p>Add new video content or sheet music.</p></a><a class="iu-quick-card" href="#/studio/sessions">${icon("calendar")}<h2>Schedule Live Class</h2><p>Plan your next teaching session.</p></a><article class="iu-panel iu-flush"><header><h3>Activity Feed</h3></header><div class="iu-activity">${(d.activity || []).map((a) => `<div><i>${icon(a.completed ? "check" : "play")}</i><p><b>${esc(a.name)}</b> ${a.completed ? "completed" : "practised"}<br><strong>${esc(a.title)}</strong><small>${when(a.at)}</small></p></div>`).join("") || I.empty("Activity will appear when students practise your lessons.")}</div><a href="#/studio/students" class="iu-panel-foot">See all activity</a></article></aside></div></div>`,
    );
  };
  I.exportStudents = async () => {
    try {
      const students = (await ETK.call("GET", "/api/studio/students")).students,
        cell = (s) =>
          '"' +
          String(s ?? "")
            .replace(/^([=+\-@])/, "'$1")
            .replace(/"/g, '""') +
          '"';
      StudentUI.downloadBlob(
        "Name,Level,Started,Completed,Last active\r\n" +
          students
            .map((s) =>
              [
                s.name,
                s.level,
                s.started,
                s.completed,
                new Date(s.lastActive).toISOString(),
              ]
                .map(cell)
                .join(","),
            )
            .join("\r\n"),
        "student-progress.csv",
        "text/csv",
      );
    } catch (e) {
      toast(e.message);
    }
  };
  I.dialog = (title, body, action) => {
    document.querySelector("#iu-dialog")?.close();
    const dialog = document.createElement("dialog");
    dialog.id = "iu-dialog";
    dialog.className = "iu-dialog";
    dialog.innerHTML = `<form><header><h2>${title}</h2><button type="button" aria-label="Close dialog">×</button></header>${body}<p role="alert" class="iu-form-error" hidden></p><button class="btn w" type="submit">Save</button></form>`;
    dialog.querySelector("header button").onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector("[type=submit]");
      button.disabled = true;
      try {
        await action(new FormData(e.target));
        dialog.close();
      } catch (error) {
        const p = dialog.querySelector("[role=alert]");
        p.hidden = false;
        p.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    document.body.append(dialog);
    dialog.showModal();
  };
  I.resetCourse = () => {
    I.course = null;
    I.heroFile = null;
    sessionStorage.removeItem("etk-course-draft-" + S.user.id);
  };
  I.newCourse = () => {
    I.resetCourse();
    go("#/studio/create/1");
  };
  newC = I.newCourse;
  I.editCourse = (id) => {
    I.course = S.icourses.find((c) => c.id == id);
    go("#/studio/create/1?course=" + id);
  };
  editC = I.editCourse;
  I.modules = (c) => [
    ...new Set([
      ...(c.settings?.modules || []),
      ...S.ilessons.filter((l) => l.courseId === c.id).map((l) => l.module),
    ]),
  ];
  I.curriculum = (c, wizard = false) => {
    const lessons = S.ilessons
      .filter((l) => l.courseId === c.id)
      .sort((a, b) => a.position - b.position);
    return `<section class="iu-panel iu-curriculum"><header><div><h2>${esc(c.title)}</h2><p>${I.modules(c).length} modules · ${lessons.length} lessons</p></div><div><button class="btn out sm" onclick="InstructorUI.editCourse(${c.id})">Edit Details</button>${wizard ? "" : `<button class="btn sm" onclick="togC(${c.id},${c.published ? 0 : 1})">${c.published ? "Unpublish" : "Publish Changes"}</button>`}</div></header>${
      I.modules(c)
        .map(
          (m, mi) =>
            `<section class="iu-module"><header><h3>${esc(m)}</h3><button class="iu-icon-btn" aria-label="Rename module ${mi + 1}" onclick="InstructorUI.renameModule(${c.id},${mi})">${privacyIcon("edit")}</button></header>${lessons
              .filter((l) => l.module === m)
              .map(
                (l) =>
                  `<div class="iu-module-lesson"><span>${icon(l.hasVideo ? "video" : "resources")}</span><button class="iu-lesson-name" onclick="InstructorUI.editLesson(${l.id})">${esc(l.title)}<small>${mins(l.durationSec)} min · ${l.hasVideo ? "Video uploaded" : "Awaiting video"}</small></button>${I.badge(l.published ? "Published" : "Draft", l.published ? "green" : "")}<button class="iu-icon-btn" aria-label="Move ${esc(l.title)} up" onclick="InstructorUI.moveLesson(${c.id},${l.id},-1)">↑</button><button class="iu-icon-btn" aria-label="Move ${esc(l.title)} down" onclick="InstructorUI.moveLesson(${c.id},${l.id},1)">↓</button><button class="iu-icon-btn" aria-label="Remove ${esc(l.title)}" onclick="delL(${l.id})">${privacyIcon("trash")}</button></div>`,
              )
              .join(
                "",
              )}<button class="iu-add-lesson" onclick="InstructorUI.addLesson(${c.id},${mi})">+ Add New Lesson</button></section>`,
        )
        .join("") || I.empty("Start by adding a module to your curriculum.")
    }<button class="btn out" onclick="InstructorUI.addModule(${c.id})">+ Insert New Module</button></section>`;
  };
  I.addModule = (id) => {
    const c = S.icourses.find((c) => c.id === id);
    I.dialog(
      "Add Module",
      '<label>Module Title<input name="title" required maxlength="120" placeholder="e.g. Foundations of Piano"></label>',
      async (f) => {
        await ETK.call("PATCH", `/api/studio/courses/${id}/settings`, {
          modules: [...I.modules(c), f.get("title").trim()],
        });
        await reload();
      },
    );
  };
  I.renameModule = (id, index) => {
    const c = S.icourses.find((c) => c.id === id),
      modules = I.modules(c),
      old = modules[index];
    I.dialog(
      "Rename Module",
      `<label>Module Title<input required maxlength="120" name="title" value="${esc(old)}"></label>`,
      async (f) => {
        const name = f.get("title").trim();
        for (const l of S.ilessons.filter(
          (l) => l.courseId === id && l.module === old,
        ))
          await ETK.call("PATCH", "/api/studio/lessons/" + l.id, {
            module: name,
          });
        modules[index] = name;
        await ETK.call("PATCH", `/api/studio/courses/${id}/settings`, {
          modules,
        });
        await reload();
      },
    );
  };
  I.moveLesson = async (courseId, id, delta) => {
    const sorted = S.ilessons
        .filter((l) => l.courseId === courseId)
        .sort((a, b) => a.position - b.position)
        .map((l) => l.id),
      index = sorted.indexOf(id);
    if (index + delta < 0 || index + delta >= sorted.length) return;
    [sorted[index], sorted[index + delta]] = [
      sorted[index + delta],
      sorted[index],
    ];
    try {
      await ETK.call("PUT", `/api/studio/courses/${courseId}/reorder`, {
        order: sorted,
      });
      await reload();
    } catch (e) {
      toast(e.message);
    }
  };
  I.addLesson = (id, index) => {
    S.ci = id;
    ls = {
      id: null,
      t: "",
      file: null,
      courseId: id,
      m: I.modules(S.icourses.find((c) => c.id === id))[index] || "Module 1",
      free: false,
      dur: 0,
    };
    I.videoDescription = "";
    I.videoTags = "";
    go("#/studio/lesson");
  };
  IN.courses = () => {
    const courses = S.icourses.filter((c) => I.matches(c.title));
    const current = S.icourses.find((c) => c.id === S.ci) || courses[0];
    return I.shell(
      "studio/courses",
      `${I.top()}<div class="iu-content"><div class="iu-heading"><div><h1>Curriculum Management</h1><p>Structure your masterclasses, organize your lessons, and build inspiring learning journeys.</p></div><button class="btn" onclick="InstructorUI.newCourse()">+ Create New Course</button></div><div class="iu-course-cards">${courses.map((c) => `<article class="iu-card ${current?.id === c.id ? "selected" : ""}">${I.photo(I.courseImage(c))}<div><h2>${esc(c.title)}</h2><p>${c.level} · ${S.ilessons.filter((l) => l.courseId === c.id).length} lessons</p>${I.badge(c.published ? "Published" : "Draft", c.published ? "green" : "")}<button class="btn ${current?.id === c.id ? "" : "out"} w" onclick="S.ci=${c.id};rt()">${current?.id === c.id ? "Currently Editing" : "Manage"}</button></div></article>`).join("") || I.empty("Create your first course to start building your curriculum.")}</div>${current ? I.curriculum(current) : ""}</div>`,
    );
  };
  I.wizardSteps = (step) =>
    `<div class="iu-wizard-steps">${["Fundamentals", "Curriculum", "Pricing & Publication", "Review"].map((s, i) => `<button class="${i + 1 <= step ? "active" : ""}" onclick="${I.course?.id ? `go('#/studio/create/${i + 1}?course=${I.course.id}')` : "toast('Save the course fundamentals first.')"}"><span>${i + 1 < step ? "✓" : i + 1}</span>${s}</button>`).join("")}</div>`;
  I.pickHero = (file) => {
    if (!file) return;
    I.heroFile = file;
    const label = document.querySelector("#iu-hero-name");
    if (label) label.textContent = file.name;
  };
  I.saveCourse = async (next) => {
    if (I.courseBusy) return;
    const f = document.querySelector("#iu-course-form");
    if (!f.reportValidity()) return;
    I.courseBusy = true;
    const button = f.querySelector("[type=submit]");
    if (button) button.disabled = true;
    try {
      const values = new FormData(f),
        patch = {
          title: values.get("title"),
          description: values.get("description"),
          level: values.get("level"),
          hours: Number(values.get("hours") || 0),
        };
      const d = await ETK.call(
        I.course?.id ? "PATCH" : "POST",
        "/api/studio/courses" + (I.course?.id ? "/" + I.course.id : ""),
        patch,
      );
      I.course = d.course;
      sessionStorage.setItem(
        "etk-course-draft-" + S.user.id,
        String(I.course.id),
      );
      await ETK.call("PATCH", `/api/studio/courses/${I.course.id}/settings`, {
        instrument: values.get("instrument"),
        audience: values.get("audience"),
      });
      if (I.heroFile) {
        await ETK.upload(
          `/api/studio/courses/${I.course.id}/image`,
          I.heroFile,
          prog,
          I.heroFile.type,
        );
        I.heroFile = null;
      }
      S.ci = I.course.id;
      toast("Course draft saved");
      if (next) go(`#/studio/create/${next}?course=${I.course.id}`);
      else await reload();
    } catch (e) {
      toast(e.message);
    } finally {
      I.courseBusy = false;
      if (button) button.disabled = false;
    }
  };
  I.savePricing = async (next) => {
    const form = document.querySelector("#iu-pricing-form");
    if (!form.reportValidity()) return;
    const f = new FormData(form),
      settings = {
        accessType: f.get("accessType"),
        priceUsd: Number(f.get("priceUsd") || 0),
        discountUsd: Number(f.get("discountUsd") || 0),
        unlimited: !!f.get("unlimited"),
        capacity: Number(f.get("capacity") || 0),
        publicListing: !!f.get("publicListing"),
        searchEngines: !!f.get("searchEngines"),
        publishAt: f.get("publishAt") || "",
      };
    try {
      await ETK.call(
        "PATCH",
        `/api/studio/courses/${I.course.id}/settings`,
        settings,
      );
      toast("Publication settings saved");
      go(`#/studio/create/${next}?course=${I.course.id}`);
    } catch (e) {
      toast(e.message);
    }
  };
  I.publishCourse = async () => {
    try {
      await ETK.call("PATCH", `/api/studio/courses/${I.course.id}`, {
        published: true,
      });
      toast("Course published");
      go("#/studio/courses");
    } catch (e) {
      toast(e.message);
    }
  };
  IN.create = (step) => {
    step = +step || 1;
    const c = I.course || {
        title: "",
        description: "",
        level: "Beginner",
        hours: 0,
        settings: {},
      },
      d = c.settings || {};
    if (!c.id) step = 1;
    let content;
    if (step === 1)
      content = `<h1 class="iu-large-title">Course Fundamentals</h1><p class="iu-lead">Establish the core identity of your masterclass. This information will be the first thing potential students see on the platform.</p><form id="iu-course-form" class="iu-panel iu-course-form" onsubmit="event.preventDefault();InstructorUI.saveCourse(2)"><div><label>Course Title<input name="title" required maxlength="120" value="${esc(c.title)}" placeholder="e.g. Mastering the Chopin Nocturnes"></label><small>Keep it evocative and clear.</small><label>Course Description<textarea name="description" maxlength="2000" required rows="7" placeholder="Describe the journey your students will take...">${esc(c.description)}</textarea></label><div class="iu-two"><label>Primary Instrument<select name="instrument">${["Grand Piano", "Digital Piano", "Keyboard"].map((t) => `<option ${d.instrument === t ? "selected" : ""}>${t}</option>`).join("")}</select></label><label>Difficulty Level<select name="level">${L.map((l) => `<option ${c.level === l ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><label>Total Content Hours<input type="number" name="hours" min="0" max="1000" value="${c.hours}"></label></div><div><label>Hero Image</label><label class="iu-image-drop">${c.imageUrl ? `<img src="${esc(c.imageUrl)}" alt="Current course cover">` : icon("uploads")}<span id="iu-hero-name">Click to upload or drag and drop</span><small>PNG, JPG or WebP · up to 5 MB</small><input type="file" accept="image/png,image/jpeg,image/webp" onchange="InstructorUI.pickHero(this.files[0])"></label><label>Target Audience<textarea name="audience" rows="3" maxlength="1000" placeholder="e.g., Aspiring concert pianists, conservatoire students...">${esc(d.audience || "")}</textarea></label><aside class="iu-tip"><h3>Instructor Tip</h3><p>Choose a clear, well-lit thumbnail that represents your course.</p></aside></div><div class="iu-wizard-footer iu-full"><a href="#/studio/courses">× Cancel</a><button type="button" class="btn out" onclick="InstructorUI.saveCourse()">Save as Draft</button><button class="btn" type="submit">Next: Curriculum ${icon("arrow")}</button></div></form>`;
    else if (step === 2)
      content = `<div class="iu-heading"><div><span class="iu-eyebrow">Step 2 of 4</span><h1>Curriculum Builder</h1><p>Organize your course into modules and lessons.</p></div><button class="btn" onclick="InstructorUI.addModule(${c.id})">+ Add New Module</button></div>${I.curriculum(c, true)}<div class="iu-tip"><h3>Curriculum Assistant</h3><p>A clear sequence helps students follow your course. Add an introduction, guided practice, and a final performance.</p></div><div class="iu-wizard-footer"><a href="#/studio/create/1?course=${c.id}">← Back to Course Info</a><button class="btn out" onclick="InstructorUI.previewCourse()">Preview Curriculum</button><a class="btn" href="#/studio/create/3?course=${c.id}">Next: Pricing & Publication →</a></div>`;
    else if (step === 3)
      content = `<h1>Pricing & Publication</h1><p class="iu-lead">Finalize how students will access this masterclass and set your release strategy.</p><form id="iu-pricing-form" onsubmit="event.preventDefault();InstructorUI.savePricing(4)"><div class="iu-pricing-grid"><section class="iu-panel"><h3 class="iu-orange">Access Type</h3>${[
        [
          "free",
          "Free Access",
          "Available to registered users at no cost after administrator approval.",
        ],
        [
          "one_time",
          "One-time Purchase",
          "Save a purchase-price proposal for administrator review.",
        ],
        [
          "subscription",
          "Part of Subscription",
          "Included in the platform’s membership tiers.",
        ],
      ]
        .map(
          ([value, title, copy]) =>
            `<label class="iu-access-choice"><input type="radio" name="accessType" value="${value}" ${(d.accessType || "subscription") === value ? "checked" : ""}><span><b>${title}</b><small>${copy}</small></span></label>`,
        )
        .join(
          "",
        )}<div class="iu-price-inputs iu-two"><label>Set Course Price (USD)<input type="number" name="priceUsd" min="0" max="100000" step="0.01" value="${d.priceUsd || 0}"></label><label>Discount Price (Optional)<input type="number" name="discountUsd" min="0" max="100000" step="0.01" value="${d.discountUsd || 0}"></label></div>${I.note("Checkout currently uses subscription pricing set by the platform. One-time pricing and free-access requests are saved for administrator review.")}</section><aside><section class="iu-panel"><h3 class="iu-orange">Enrollment</h3><label class="iu-check"><input type="checkbox" name="unlimited" ${d.unlimited !== false ? "checked" : ""}>Unlimited Students</label><label>Proposed Capacity<input type="number" min="0" max="100000" name="capacity" value="${d.capacity || 0}"></label><p>Capacity is a planning preference; enrollment limits are not enforced.</p></section><section class="iu-panel"><h3 class="iu-orange">Visibility Preferences</h3><label class="iu-check"><input type="checkbox" name="publicListing" ${d.publicListing !== false ? "checked" : ""}>Public Listing</label><label class="iu-check"><input type="checkbox" name="searchEngines" ${d.searchEngines !== false ? "checked" : ""}>Search Engines</label><small>Saved preferences for review. Published courses appear in the catalogue.</small></section></aside><section class="iu-panel iu-full"><h3 class="iu-orange">Publication Strategy</h3><div class="iu-two"><div><h2>Publish Immediately</h2><p>Publish the course manually after reviewing its content.</p><h2>Schedule Release</h2><p>Save a planned release time for your draft.</p></div><label>Planned Release<input name="publishAt" type="datetime-local" value="${esc(d.publishAt || "")}"><small>A planned date does not automatically publish the course.</small></label></div></section></div><div class="iu-wizard-footer"><a href="#/studio/create/2?course=${c.id}">← Back to Curriculum</a><button class="btn" type="submit">Save & Review Course →</button></div></form>`;
    else
      content = `<div class="iu-review-course-heading"><h1>Final Masterpiece Review</h1><p>One last look before you publish your course.</p></div><div class="iu-course-review-grid"><section><article class="iu-card">${I.photo(I.courseImage(c))}<div><h2>${esc(c.title)}</h2><p>${esc(c.description)}</p></div></article>${I.curriculum(c, true)}</section><aside><div class="iu-panel iu-review-price"><h3>Publication & Pricing</h3><h2>${d.accessType === "one_time" ? "Price Proposal" : d.accessType === "free" ? "Free Access Request" : "Subscription Course"}</h2><p>${c.level} · ${c.hours} hours</p><p>${S.ilessons.filter((l) => l.courseId === c.id).length} lessons</p><p>${d.publishAt ? "Planned release: " + esc(d.publishAt) : "Manual publication"}</p></div><div class="iu-tip"><h3>Content Review</h3><p>Upload and publish your lesson videos before sharing the course with students.</p></div><button class="btn w" onclick="InstructorUI.publishCourse()">Publish Course ${icon("check")}</button><a class="btn out w" href="#/studio/create/3?course=${c.id}">Back to Pricing</a></aside></div>`;
    return I.shell(
      "studio/courses",
      `${I.top("Create New Course", '<a href="#/studio/courses">Save & Exit</a>')}<div class="iu-content">${I.wizardSteps(step)}${content}</div>`,
    );
  };
  I.previewCourse = () => {
    const c = I.course;
    if (!c) return;
    I.dialog(
      "Curriculum Preview",
      `<h3>${esc(c.title)}</h3>${
        I.modules(c)
          .map(
            (m) =>
              `<h4>${esc(m)}</h4><ul>${S.ilessons
                .filter((l) => l.courseId === c.id && l.module === m)
                .map(
                  (l) =>
                    `<li>${esc(l.title)} · ${mins(l.durationSec)} min</li>`,
                )
                .join("")}</ul>`,
          )
          .join("") || "<p>No lessons yet.</p>"
      }`,
      async () => {},
    );
  };
  I.editLesson = (id) => {
    const l = S.ilessons.find((l) => l.id === id);
    if (!l) return;
    ls = {
      id: l.id,
      t: l.title,
      file: null,
      courseId: l.courseId,
      m: l.module,
      free: l.freePreview,
      dur: l.durationSec,
    };
    I.videoDescription = l.settings?.description || "";
    I.videoTags = (l.settings?.tags || []).join(", ");
    if (I.videoUrl) URL.revokeObjectURL(I.videoUrl);
    I.videoUrl = null;
    go("#/studio/lesson");
  };
  I.newLesson = () => {
    ls = {
      id: null,
      t: "",
      file: null,
      courseId: S.ci || S.icourses[0]?.id,
      m: "Module 1",
      free: false,
      dur: 0,
    };
    I.videoDescription = "";
    I.videoTags = "";
    I.videoUrl = null;
    go("#/studio/lesson");
  };
  newLesson = I.newLesson;
  I.pickVideo = (file) => {
    if (!file) return;
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(vtype(file)))
      return toast("Choose an MP4, MOV or WebM video.");
    ls.file = file;
    if (I.videoUrl) URL.revokeObjectURL(I.videoUrl);
    I.videoUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      ls.dur = Math.round(video.duration) || 0;
      I.videoWidth = video.videoWidth;
      I.videoHeight = video.videoHeight;
      const metadata = document.querySelector("#iu-video-metadata");
      if (metadata) metadata.innerHTML = I.videoMetadata();
    };
    video.src = I.videoUrl;
    rt();
  };
  I.videoMetadata = () =>
    `<div>${icon("clock")}<b>${ls.dur ? mins(ls.dur) + " min" : "—"}</b><small>Duration</small></div><div>${icon("video")}<b>${I.videoWidth ? I.videoWidth + " × " + I.videoHeight : "—"}</b><small>Resolution</small></div><div>${icon("resources")}<b>${ls.file ? (ls.file.size / 1048576).toFixed(1) + " MB" : "—"}</b><small>File Size</small></div>`;
  I.saveLesson = async (publish) => {
    if (I.videoBusy) return;
    if (!ls.t.trim()) return toast("Add a lesson title.");
    if (!ls.courseId) return toast("Create or select a course first.");
    if (
      publish &&
      !ls.file &&
      !S.ilessons.find((l) => l.id === ls.id)?.hasVideo
    )
      return toast("Select a video before publishing.");
    I.videoBusy = true;
    try {
      const patch = {
        courseId: ls.courseId,
        title: ls.t.trim(),
        module: ls.m.trim() || "Module 1",
        durationSec: ls.dur || 0,
        freePreview: !!ls.free,
      };
      const d = await ETK.call(
        ls.id ? "PATCH" : "POST",
        "/api/studio/lessons" + (ls.id ? "/" + ls.id : ""),
        patch,
      );
      ls.id = d.lesson.id;
      await ETK.call("PATCH", `/api/studio/lessons/${ls.id}/settings`, {
        description: I.videoDescription,
        tags: I.videoTags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (ls.file) {
        await ETK.upload(
          "/api/studio/lessons/" + ls.id + "/file",
          ls.file,
          prog,
          vtype(ls.file),
        );
        ls.file = null;
      }
      if (publish)
        await ETK.call("PATCH", "/api/studio/lessons/" + ls.id, {
          published: true,
        });
      toast(publish ? "Lesson published" : "Lesson draft saved");
      S.ci = ls.courseId;
      if (I.videoUrl) URL.revokeObjectURL(I.videoUrl);
      I.videoUrl = null;
      ls = {
        id: null,
        t: "",
        file: null,
        courseId: S.ci,
        m: "Module 1",
        free: false,
        dur: 0,
      };
      I.videoDescription = "";
      I.videoTags = "";
      go("#/studio/lessons");
    } catch (e) {
      toast(e.message + " Your draft is retained for retry.");
    } finally {
      I.videoBusy = false;
    }
  };
  IN.lesson = () => {
    if (!S.icourses.length)
      return I.shell(
        "studio/lesson",
        `${I.top()}<div class="iu-content"><h1>Video Studio</h1>${I.empty("Create a course before adding your first lesson.")}<button class="btn" onclick="InstructorUI.newCourse()">Create Course</button></div>`,
      );
    if (!S.icourses.find((c) => c.id === ls.courseId))
      ls.courseId = S.ci || S.icourses[0].id;
    return I.shell(
      "studio/lesson",
      `${I.top()}<div class="iu-content"><div class="iu-heading"><div><h1>Video Studio</h1><p>Compose, upload, and refine your next piano masterclass.</p></div><div><button class="btn out" onclick="InstructorUI.saveLesson(false)">Save Draft</button><button class="btn" onclick="InstructorUI.saveLesson(true)">Publish Lesson</button></div></div><div class="iu-video-grid"><section><div class="iu-video-drop" ondragover="event.preventDefault()" ondrop="event.preventDefault();InstructorUI.pickVideo(event.dataTransfer.files[0])">${I.videoUrl ? `<video src="${esc(I.videoUrl)}" controls preload="metadata"></video>` : `<span class="iu-square-icon">${icon("uploads")}</span><h2>Drop your lesson here</h2><p>Upload your lesson footage. We support MP4, MOV, and WebM.</p>`}<label class="btn out iu-file-button">${ls.file ? esc(ls.file.name) : "Select File"}<input id="iu-video-file" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onchange="InstructorUI.pickVideo(this.files[0])"></label></div><div class="iu-panel iu-video-metadata" id="iu-video-metadata">${I.videoMetadata()}</div><h4 class="iu-section-label">Lesson Assets</h4><div class="iu-two"><button class="btn out" onclick="InstructorUI.addResource('PDF')">${icon("resources")}Upload Sheet Music (PDF)</button><button class="btn out" onclick="InstructorUI.addResource('MIDI')">${icon("resources")}Upload MIDI File</button></div><small class="iu-muted">Assets are saved through Resource Manager and can be published to the library.</small></section><section class="iu-panel iu-video-details"><h2>Lesson Details</h2><label>Lesson Title<textarea rows="2" required maxlength="150" oninput="ls.t=this.value" placeholder="e.g., Masterclass: Debussy Clair de Lune">${esc(ls.t)}</textarea></label><label>Description<textarea rows="5" maxlength="6000" placeholder="Briefly describe what students will master in this lesson..." oninput="InstructorUI.videoDescription=this.value">${esc(I.videoDescription)}</textarea></label><div class="iu-rule"></div><label>Select Course<select onchange="ls.courseId=+this.value;ls.m='Module 1';rt()" ${ls.id ? "disabled" : ""}>${S.icourses.map((c) => `<option value="${c.id}" ${ls.courseId === c.id ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select></label><label>Module<input list="iu-modules" maxlength="120" value="${esc(ls.m)}" oninput="ls.m=this.value"><datalist id="iu-modules">${I.modules(
        S.icourses.find((c) => c.id === ls.courseId),
      )
        .map((m) => `<option value="${esc(m)}">`)
        .join(
          "",
        )}</datalist></label><label>Tags<input placeholder="Intermediate, Classical" maxlength="1000" value="${esc(I.videoTags)}" oninput="InstructorUI.videoTags=this.value"></label><div class="iu-rule"></div><h4>Publishing Options</h4><label class="iu-check"><input type="checkbox" ${ls.free ? "checked" : ""} onchange="ls.free=this.checked">Free Preview</label><small>A free preview can be watched by any signed-in student.</small><button class="btn w" onclick="InstructorUI.saveLesson(true)">Publish Now</button></section></div></div>`,
    );
  };
  IN.lessons = () => {
    const all = S.ilessons.filter(
        (l) =>
          I.matches(l.title) &&
          (I.lessonFilter === "All Lessons" ||
            (I.lessonFilter === "Published" && l.published) ||
            (I.lessonFilter === "Drafts" && !l.published) ||
            cOf(l.courseId).level === I.lessonFilter),
      ),
      pages = Math.ceil(all.length / 6);
    I.page = Math.min(I.page, pages || 1);
    return I.shell(
      "studio/lessons",
      `${I.top()}<div class="iu-content"><div class="iu-heading"><div><span class="iu-eyebrow">Curriculum Repository</span><h1>Lesson Plans</h1></div><button class="btn" onclick="InstructorUI.newLesson()">+ Create New Lesson</button></div><div class="iu-filters">${["All Lessons", "Published", "Drafts", ...L].map((x) => `<button class="${I.lessonFilter === x ? "active" : ""}" onclick="InstructorUI.lessonFilter='${x}';InstructorUI.page=1;rt()">${x}</button>`).join("")}</div><div class="iu-lesson-grid">${all
        .slice((I.page - 1) * 6, I.page * 6)
        .map(
          (l) =>
            `<article class="iu-card">${I.photo(I.courseImage(cOf(l.courseId)))}${I.badge(l.published ? "Published" : "Draft", l.published ? "green" : "")}<div><h2>${esc(l.title)}</h2><p>${esc(l.settings?.description || cOf(l.courseId).title || "")}</p><div class="iu-card-meta"><span>${mins(l.durationSec)} min</span><span>${l.hasVideo ? "Video uploaded" : "No video"}</span></div><button class="btn out w" onclick="InstructorUI.editLesson(${l.id})">Edit Lesson</button><button class="iu-text-button" onclick="pubV(${l.id})">${l.published ? "Unpublish" : "Publish"}</button></div></article>`,
        )
        .join(
          "",
        )}<button class="iu-card iu-new-card" onclick="InstructorUI.newLesson()"><span>+</span><h2>Create a New Lesson</h2><p>Add a new lesson to your curriculum.</p></button></div><div class="iu-list-footer"><p>Showing ${all.length ? Math.min((I.page - 1) * 6 + 1, all.length) : 0}–${Math.min(I.page * 6, all.length)} of ${all.length} lessons</p>${I.pagination(pages)}</div></div>`,
    );
  };
  I.pagination = (pages) =>
    `<div class="iu-pagination">${Array.from({ length: pages }, (_, i) => `<button class="${I.page === i + 1 ? "active" : ""}" aria-label="Page ${i + 1}" onclick="InstructorUI.page=${i + 1};rt()">${i + 1}</button>`).join("")}</div>`;
  IN.students = () => {
    const list = I.students.filter((s) => I.matches(s.name));
    return I.shell(
      "studio/students",
      `${I.top()}<div class="iu-content"><div class="iu-heading"><h1>Student Roster</h1><button class="btn out" onclick="InstructorUI.exportStudents()">${icon("download")}Export Progress</button></div><div class="iu-stats three">${I.stat("Total Students", I.students.length, "community")}${I.stat("Active Practice", I.students.length ? Math.round((100 * I.students.filter((s) => Date.now() - s.lastActive < 7 * 86400000).length) / I.students.length) + "%" : "0%", "check", "Practised in the last 7 days")}${I.stat(
        "Lessons Completed",
        I.students.reduce((n, s) => n + s.completed, 0),
        "resources",
      )}</div><section class="iu-panel iu-flush">${I.rosterTable(list)}</section><p class="iu-muted">Showing ${list.length} students learning your content.</p></div>`,
    );
  };
  I.saveStudentNote = async (id) => {
    try {
      const d = await ETK.call("PUT", `/api/studio/students/${id}/notes`, {
        note: document.querySelector("#iu-student-note").value,
      });
      if (I.studentDetail) I.studentDetail.note = d.note;
      toast("Private note saved");
    } catch (e) {
      toast(e.message);
    }
  };
  I.resourceMime = (file) =>
    ({
      pdf: "application/pdf",
      mid: "audio/midi",
      midi: "audio/midi",
      zip: "application/zip",
    })[(file.name.split(".").pop() || "").toLowerCase()] || file.type;
  I.addResource = (kind) => {
    I.pendingResourceId = null;
    return I.dialog(
      "Upload Resource",
      `<label>Title<input name="title" required maxlength="150" placeholder="Resource title"></label><label>Description<input name="subtitle" maxlength="200"></label><div class="iu-two"><label>File Type<select name="kind">${["PDF", "MIDI", "DOC"].map((k) => `<option ${kind === k ? "selected" : ""}>${k}</option>`).join("")}</select></label><label>Minimum Plan<select name="minLevel"><option value="">Free for members</option>${L.map((l) => `<option>${l}</option>`).join("")}</select></label></div><label>File<input type="file" name="file" required accept=".pdf,.mid,.midi,.zip,application/pdf,audio/midi,application/zip"></label><small>PDF, MIDI or ZIP · up to 100 MB. New resources stay in draft until published.</small>`,
      async (f) => {
        if (!I.pendingResourceId) {
          const d = await ETK.call("POST", "/api/studio/resources", {
            title: f.get("title"),
            subtitle: f.get("subtitle"),
            kind: f.get("kind"),
            category: f.get("kind") === "MIDI" ? "MIDI Files" : "Sheet Music",
            minLevel: f.get("minLevel") || null,
          });
          I.pendingResourceId = d.resource.id;
        }
        await ETK.upload(
          `/api/studio/resources/${I.pendingResourceId}/file`,
          f.get("file"),
          prog,
          I.resourceMime(f.get("file")),
        );
        toast("Resource uploaded as draft");
        if (route().b === "resources") await reload();
        else go("#/studio/resources");
      },
    );
  };
  I.toggleResource = async (id) => {
    const r = I.resources.find((r) => r.id === id);
    try {
      await ETK.call("PATCH", "/api/studio/resources/" + id, {
        published: !r.published,
      });
      await reload();
      toast(
        r.published
          ? "Resource unpublished"
          : "Resource published to the library",
      );
    } catch (e) {
      toast(e.message);
    }
  };
  I.replaceResource = (id) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.mid,.midi,.zip";
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      try {
        await ETK.upload(
          `/api/studio/resources/${id}/file`,
          f,
          prog,
          I.resourceMime(f),
        );
        toast("Resource file replaced");
        await reload();
      } catch (e) {
        toast(e.message);
      }
    };
    input.click();
  };
  IN.resources = () => {
    const list = I.resources.filter(
      (r) =>
        I.matches(r.title) &&
        (I.resourceFilter === "All Files" || r.kind === I.resourceFilter),
    );
    return I.shell(
      "studio/resources",
      `${I.top()}<div class="iu-content"><div class="iu-heading"><div><span class="iu-eyebrow">Faculty Archive</span><h1>Resource Manager</h1></div><button class="btn" onclick="InstructorUI.addResource()">${icon("uploads")}Upload Resource</button></div><div class="iu-stats">${I.stat("Total Documents", I.resources.filter((r) => r.kind !== "MIDI").length, "resources")}${I.stat("MIDI Tracks", I.resources.filter((r) => r.kind === "MIDI").length, "resources")}${I.stat("Published Resources", I.resources.filter((r) => r.published).length, "check")}${I.stat("Uploaded Files", I.resources.filter((r) => r.available).length, "uploads")}</div><div class="iu-resource-tabs">${["All Files", "PDF", "MIDI", "DOC"].map((t) => `<button class="${I.resourceFilter === t ? "active" : ""}" onclick="InstructorUI.resourceFilter='${t}';rt()">${t}</button>`).join("")}</div><div class="iu-resource-grid">${list.map((r) => `<article class="iu-panel iu-resource-card"><span class="iu-square-icon">${icon("resources")}</span><h2>${esc(r.title)}</h2><small>${r.kind} · ${r.minLevel ? esc(r.minLevel) + " plan" : "Free for members"}</small><p>${esc(r.subtitle)}</p><div class="iu-resource-bottom">${I.badge(r.published ? "Published" : "Draft", r.published ? "green" : "")}<button class="iu-text-button" onclick="InstructorUI.replaceResource(${r.id})">${r.available ? "Replace File" : "Upload File"}</button><button class="btn out sm" onclick="InstructorUI.toggleResource(${r.id})">${r.published ? "Unpublish" : "Publish"}</button></div></article>`).join("")}<button class="iu-resource-drop" onclick="InstructorUI.addResource()">${icon("uploads")}<h2>Upload a Resource</h2><p>PDF, MIDI or ZIP<br>Up to 100 MB per file</p></button></div><h2 class="iu-section-heading">Resource Library Status</h2><section class="iu-panel iu-flush"><div class="iu-table-wrap"><table><thead><tr><th>File Name</th><th>Type</th><th>Visibility</th><th>File</th></tr></thead><tbody>${I.resources.map((r) => `<tr><td>${esc(r.title)}</td><td>${r.kind}</td><td>${r.published ? "Public" : "Draft"}</td><td>${r.available ? "Uploaded" : "Missing"}</td></tr>`).join("") || '<tr><td colspan="4">No resources uploaded yet.</td></tr>'}</tbody></table></div></section><a class="btn iu-archive-support" href="#/support">${icon("support")}Archive Support</a></div>`,
    );
  };
  I.local = (key, fallback) => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("etk-instructor-" + S.user.id + "-" + key),
        ) || fallback
      );
    } catch {
      return fallback;
    }
  };
  I.store = (key, value) =>
    localStorage.setItem(
      "etk-instructor-" + S.user.id + "-" + key,
      JSON.stringify(value),
    );
  I.reviewData = (index) => ({
    ratings: [7, 7, 7, 7],
    notes: [],
    privateNote: "",
    status: S.rev[index]?.st || "Pending",
    ...I.local("review-" + index, {}),
  });
  I.reviewRows = () =>
    S.rev.map((r, index) => ({ ...r, ...I.reviewData(index), index }));
  I.saveReviewDraft = (index) => {
    const draft = I.reviewData(index);
    draft.ratings = I.ratings;
    const text = document.querySelector("#iu-private-notes");
    if (text) draft.privateNote = text.value;
    I.store("review-" + index, draft);
  };
  I.grade = (ratings) => {
    const average = ratings.reduce((n, x) => n + Number(x), 0) / ratings.length;
    return average >= 9
      ? "A (Distinction)"
      : average >= 8
        ? "A− (Distinction)"
        : average >= 7
          ? "B+ (Merit)"
          : average >= 6
            ? "B (Merit)"
            : "C (Developing)";
  };
  I.rate = (index, criterion, value) => {
    I.ratings[criterion] = +value;
    document.querySelector("#iu-rating-" + criterion).textContent =
      Number(value).toFixed(1) + "/10";
    document.querySelector("#iu-estimated-grade").textContent = I.grade(
      I.ratings,
    );
    I.saveReviewDraft(index);
  };
  I.addReviewNote = (index) => {
    const time = document.querySelector("#iu-review-video")?.currentTime || 0;
    I.dialog(
      "Add Time-stamped Feedback",
      `<label>Timestamp (seconds)<input type="number" name="time" min="0" value="${Math.floor(time)}"></label><label>Feedback<textarea name="text" required rows="5" maxlength="3000" placeholder="Add detailed performance feedback..."></textarea></label>`,
      async (f) => {
        const data = I.reviewData(index);
        data.notes.push({ time: +f.get("time"), text: f.get("text") });
        I.store("review-" + index, data);
        rt();
      },
    );
  };
  I.pickReviewVideo = (file) => {
    if (!file) return;
    if (I.reviewVideoUrl) URL.revokeObjectURL(I.reviewVideoUrl);
    I.reviewVideoUrl = URL.createObjectURL(file);
    rt();
  };
  I.pickScore = (file) => {
    if (!file) return;
    if (file.type !== "application/pdf")
      return toast("Choose a PDF reference score.");
    if (I.reviewScoreUrl) URL.revokeObjectURL(I.reviewScoreUrl);
    I.reviewScoreUrl = URL.createObjectURL(file);
    rt();
  };
  I.completeReview = (index) => {
    I.saveReviewDraft(index);
    const d = I.reviewData(index);
    d.status = "Reviewed";
    d.grade = I.grade(d.ratings);
    d.savedAt = Date.now();
    I.store("review-" + index, d);
    go("#/studio/review-complete/" + index);
  };
  IN.reviews = (index) => {
    const pending = I.reviewRows().filter((r) => r.status === "Pending"),
      reviewed = I.reviewRows().filter((r) => r.status !== "Pending");
    if (index != null && S.rev[index]) return I.reviewScreen(+index);
    const rows = I.reviewRows().filter(
      (r) =>
        I.matches(r.s + " " + r.p) &&
        (I.reviewFilter === "All" || r.status === I.reviewFilter),
    );
    return I.shell(
      "studio/reviews",
      `${I.top()}<div class="iu-content"><h1>Performance Reviews</h1><p class="iu-lead">Provide expert feedback to help your students master their craft.</p>${I.note("Review preview: sample submissions and feedback are stored on this browser. No review is delivered to a student.")}<div class="iu-stats three">${I.stat("Pending Reviews", pending.length, "comment", "Awaiting feedback")}${I.stat("Avg. Response", "—", "clock", "Live review delivery is not connected")}${I.stat("Completed Reviews", reviewed.length, "check", "Local preview evaluations")}</div><section class="iu-panel iu-flush"><header><h3>Submission Queue</h3><select aria-label="Filter review status" onchange="InstructorUI.reviewFilter=this.value;rt()">${["All", "Pending", "Reviewed"].map((t) => `<option ${I.reviewFilter === t ? "selected" : ""}>${t}</option>`).join("")}</select></header><div class="iu-table-wrap"><table><thead><tr><th>Student</th><th>Piece</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map((r) => `<tr><td><div class="iu-person">${I.avatar(esc(r.s), false)}<b>${esc(r.s)}</b></div></td><td>${esc(r.p)}</td><td>${esc(r.d)}</td><td>${I.badge(r.status, r.status === "Pending" ? "" : "green")}</td><td><a class="btn ${r.status === "Pending" ? "" : "out"} sm" href="#/studio/reviews/${r.index}">${r.status === "Pending" ? "Start Review" : "View Results"}</a></td></tr>`).join("") || '<tr><td colspan="5">No matching submissions.</td></tr>'}</tbody></table></div><p class="iu-panel-foot">Showing ${rows.length} sample submissions</p></section><h2 class="iu-section-heading">Weekly Insights</h2><div class="iu-two"><aside class="iu-tip"><h3>Personalized Feedback</h3><p>Highlight what went well and give clear next steps for improvement.</p></aside><aside class="iu-tip"><h3>Time-stamped Notes</h3><p>Attach comments to specific moments in a practice recording.</p></aside></div></div>`,
    );
  };
  I.reviewScreen = (index) => {
    const r = S.rev[index],
      d = I.reviewData(index);
    if (I.reviewIndex !== index) {
      I.reviewVideoUrl = null;
      I.reviewScoreUrl = null;
      I.reviewIndex = index;
      I.reviewTime = 0;
    }
    I.ratings = [...d.ratings];
    return I.shell(
      "studio/reviews",
      `${I.top("← Review Submission", `<button class="btn" onclick="InstructorUI.completeReview(${index})">Submit Review</button>`)}<div class="iu-content iu-review-layout"><section><h1 class="iu-review-title">${esc(r.p)}</h1><p>${esc(r.s)} · ${esc(r.d)} · Sample submission</p>${I.note("Evaluation preview — feedback stays on this browser. Select a recording to review locally.")}<div class="iu-review-recording">${I.reviewVideoUrl || window.PreviewSite ? `<video id="iu-review-video" controls src="${esc(I.reviewVideoUrl || "/preview/demo.mp4")}" poster="/assets/piano-hero.png" onloadedmetadata="this.currentTime=InstructorUI.reviewTime||0" ontimeupdate="InstructorUI.reviewTime=this.currentTime"></video>` : `${I.photo(null)}<span>${icon("play")}Sample Recording</span>`}</div><label class="btn out iu-file-button">Select Recording<input type="file" accept="video/mp4,video/quicktime,video/webm" onchange="InstructorUI.pickReviewVideo(this.files[0])"></label><section class="iu-panel iu-score"><header><h2>Reference Score</h2><label class="iu-file-link">Upload PDF<input type="file" accept="application/pdf" onchange="InstructorUI.pickScore(this.files[0])"></label></header>${I.reviewScoreUrl ? `<object data="${esc(I.reviewScoreUrl)}" type="application/pdf"><a href="${esc(I.reviewScoreUrl)}" target="_blank" rel="noopener">Open Reference Score</a></object>` : I.empty("Attach a reference score for this preview.")}</section></section><section class="iu-panel iu-evaluation"><header><h2>Evaluation Panel</h2><button class="iu-icon-btn" aria-label="Save review draft" onclick="InstructorUI.saveReviewDraft(${index});toast('Preview draft saved')">${icon("clock")}</button></header><div class="iu-resource-tabs">${["Feedback", "Technical", "Notes"].map((t) => `<button class="${I.reviewTab === t ? "active" : ""}" onclick="InstructorUI.reviewTab='${t}';InstructorUI.saveReviewDraft(${index});rt()">${t}</button>`).join("")}</div>${I.reviewTab !== "Notes" ? `<div class="iu-feedback-heading"><h4>Time-stamped Feedback</h4><button onclick="InstructorUI.addReviewNote(${index})">⊕ Add Note</button></div>${d.notes.map((n, ni) => `<article class="iu-timestamp-note"><button onclick="const v=document.querySelector('#iu-review-video');if(v)v.currentTime=${Number(n.time) || 0}">${Math.floor(n.time / 60)}:${String(n.time % 60).padStart(2, "0")}</button><p>${esc(n.text)}</p><button class="iu-note-remove" aria-label="Remove note ${ni + 1}" onclick="const d=InstructorUI.reviewData(${index});d.notes.splice(${ni},1);InstructorUI.store('review-'+${index},d);rt()">×</button></article>`).join("") || '<p class="iu-muted">Add time-stamped feedback while reviewing a recording.</p>'}<h4>Technical Ratings</h4>${["Articulation", "Dynamics", "Tempo Stability", "Musicality / Soul"].map((t, i) => `<label class="iu-rating"><span>${t}<output id="iu-rating-${i}">${Number(d.ratings[i]).toFixed(1)}/10</output></span><input type="range" min="0" max="10" step="0.1" value="${d.ratings[i]}" oninput="InstructorUI.rate(${index},${i},this.value)"></label>`).join("")}` : ""}<div class="iu-grade"><small>Estimated Grade</small><h2 id="iu-estimated-grade">${d.grade || I.grade(d.ratings)}</h2></div><label>Instructor Private Notes<textarea id="iu-private-notes" maxlength="6000" rows="6" placeholder="Add confidential notes for your own review..." oninput="InstructorUI.saveReviewDraft(${index})">${esc(d.privateNote)}</textarea></label><button class="btn w" onclick="InstructorUI.completeReview(${index})">Complete Evaluation</button><small>Saved as a local preview</small></section></div>`,
    );
  };
  IN["review-complete"] = (index) => {
    const r = S.rev[index];
    if (!r) return IN.reviews();
    const d = I.reviewData(index);
    return I.shell(
      "studio/reviews",
      `${I.top()}<div class="iu-content iu-review-confirm"><span class="iu-success">${icon("check")}</span><h1>Review Saved Successfully</h1><p>Your preview feedback has been saved on this browser.</p><div class="iu-review-confirm-card"><section class="iu-panel"><div class="iu-person">${I.avatar(esc(r.s), false)}<div><h2>${esc(r.s)}</h2><p>${esc(r.p)}</p></div></div><h2>${d.grade || I.grade(d.ratings)}</h2><div class="iu-review-scores">${["Articulation", "Dynamics", "Tempo", "Musicality"].map((t, i) => `<div><span>${t}</span><div class="iu-progress"><i style="width:${d.ratings[i] * 10}%"></i></div><b>${d.ratings[i]}/10</b></div>`).join("")}</div></section><aside class="iu-panel iu-orange-panel"><h2>Feedback Prepared</h2><p>No email or notification has been sent. Live delivery is not connected.</p></aside></div><h2>What’s Next?</h2><div class="iu-two"><a class="iu-panel" href="#/studio/reviews"><h3>Next in Queue →</h3><p>Continue reviewing sample submissions.</p></a><a class="iu-panel" href="#/studio/reviews/${index}"><h3>View Evaluation →</h3><p>Reopen the saved preview feedback.</p></a></div></div>`,
    );
  };
  I.planSession = (type) =>
    I.dialog(
      type,
      `<label>Session Title<input name="title" required maxlength="150" placeholder="e.g., Jazz Harmony Workshop"></label><label>Date & Time<input type="datetime-local" name="date" required></label><label>Meeting Link (Optional)<input type="url" name="url" placeholder="https://..."></label><p>Planning preview: this does not start a broadcast, create a meeting, or notify students.</p>`,
      async (f) => {
        const plans = I.local("sessions", []);
        plans.unshift({
          id: crypto.randomUUID(),
          type,
          title: f.get("title"),
          date: f.get("date"),
          url: f.get("url"),
        });
        I.store("sessions", plans);
        toast("Session plan saved on this browser");
        rt();
      },
    );
  IN.sessions = () =>
    I.shell(
      "studio/sessions",
      `${I.top()}<div class="iu-content"><span class="iu-eyebrow">Instructor Activity</span><h1 class="iu-large-title">Start New Session</h1><p class="iu-lead">Select your session type to begin. All studio sessions are optimized for high-quality audio and professional cinematography recording.</p>${I.note("Session planning preview. Broadcasting, meeting creation, and cloud recording are not connected.")}<div class="iu-session-cards">${[
        [
          "Live Masterclass",
          "Broadcast to your global students in real-time. Plan a shared learning experience.",
          "Plan Broadcast",
          "community",
        ],
        [
          "Studio Recording",
          "Capture lesson footage for your curriculum. Plan your next recording.",
          "Plan Recording",
          "video",
        ],
        [
          "1:1 Coaching",
          "Plan a personalized session with a student.",
          "Plan Coaching",
          "community",
        ],
      ]
        .map(
          ([t, copy, cta, x]) =>
            `<article class="iu-panel"><span class="iu-square-icon">${icon(x)}</span><h2>${t}</h2><p>${copy}</p><button class="iu-text-button" onclick="InstructorUI.planSession('${t}')">${cta} →</button></article>`,
        )
        .join(
          "",
        )}</div><h2 class="iu-section-heading">Recent Session Plans</h2><section class="iu-panel iu-flush">${
        I.local("sessions", [])
          .map(
            (s) =>
              `<div class="iu-session-row">${icon("calendar")}<div><h3>${esc(s.title)}</h3><small>${esc(s.type)} · ${esc(s.date)}</small></div><button class="btn out sm" onclick="InstructorUI.store('sessions',InstructorUI.local('sessions',[]).filter(s=>s.id!=='${s.id}'));rt()">Remove Plan</button></div>`,
          )
          .join("") || I.empty("No session plans saved yet.")
      }</section></div>`,
    );
  IN.notifications = () =>
    I.shell(
      "studio",
      `${I.top("Notifications")}<div class="iu-content"><h1>Instructor Notifications</h1><section class="iu-panel"><h2>Account Status</h2><p>${I.profile.approved ? "Your instructor account is approved." : "Your application is awaiting administrator approval."}</p><a class="btn out" href="#/onboard/1">View Profile</a></section><section class="iu-panel"><h2>Teaching Activity</h2><p>Student learning activity appears on your dashboard. Review and session previews do not send notifications.</p><a href="#/studio">Return to Dashboard →</a></section></div>`,
    );
  I.studentMessage = (id) =>
    I.dialog(
      "Draft Student Message",
      `<p>To: ${esc(I.studentDetail?.student?.name || "Student")}</p><label>Message<textarea name="message" rows="6" required maxlength="6000" placeholder="Write your message..."></textarea></label><p>Message preview: this draft stays on your browser and is not delivered.</p>`,
      async (f) => {
        I.store("message-" + id, { message: f.get("message"), at: Date.now() });
        toast("Message draft saved locally");
      },
    );
  I.studentReport = () => {
    const d = I.studentDetail;
    if (!d) return;
    StudentUI.downloadBlob(
      `EartoKeysMusic Learning Report\nStudent: ${d.student.name}\nLevel: ${d.student.level || "Not set"}\nStarted lessons: ${d.student.started}\nCompleted lessons: ${d.student.completed}\nCompletion of started lessons: ${d.student.percent}%\nLast practice: ${new Date(d.student.lastActive).toISOString()}\n\nLearning history:\n${d.lessons.map((l) => `${l.title} — ${l.completed ? "Completed" : "In progress"}`).join("\n")}\n\nPrivate instructor notes:\n${d.note || "No notes saved."}\n`,
      "learning-report.txt",
      "text/plain",
    );
  };
  IN.student = () => {
    const d = I.studentDetail;
    if (!d)
      return I.shell(
        "studio/students",
        `${I.top()}<div class="iu-content"><h1>Student Not Found</h1><a href="#/studio/students">Back to Roster</a></div>`,
      );
    const s = d.student,
      courses = [...new Set(d.lessons.map((l) => l.course))],
      focus = I.local("focus-" + s.id, {});
    return I.shell(
      "studio/students",
      `${I.top()}<div class="iu-content"><a href="#/studio/students">← Back to Roster</a><section class="iu-panel iu-student-hero">${I.avatar(esc(s.name), false)}<div><h1>${esc(s.name)}</h1><p>${icon("check")}${s.completed} Lessons Completed</p><p>${icon("clock")}Last Practice: ${when(s.lastActive)}</p><p>${icon("courses")}${esc(s.level || "Piano Student")} · ${s.courses} ${s.courses === 1 ? "course" : "courses"}</p></div><div class="iu-student-actions"><button class="btn out" onclick="InstructorUI.studentMessage(${s.id})">Send Message</button><button class="btn" onclick="InstructorUI.planSession('1:1 Coaching')">Schedule 1:1</button></div></section><div class="iu-student-detail-grid"><section class="iu-panel iu-performance-history"><header><h2>Performance History</h2><a href="#/studio/students">View All →</a></header>${d.lessons.map((l) => `<article>${I.photo(I.courseImage(S.icourses.find((c) => c.title === l.course)))}<div><h3>${esc(l.title)}</h3><p>${esc(l.course)}</p><small>Last practised ${when(l.at)}</small></div>${I.badge(l.completed ? "Completed" : "In Progress", l.completed ? "green" : "")}</article>`).join("") || I.empty("No lesson activity recorded yet.")}</section><aside class="iu-panel iu-student-path"><h2>Learning Path</h2>${courses
        .map((title) => {
          const ls = d.lessons.filter((l) => l.course === title),
            pct = Math.round(
              (ls.filter((l) => l.completed).length / ls.length) * 100,
            );
          return `<article><span>${pct === 100 ? "Completed" : "In Progress"}</span><h3>${esc(title)}</h3><div class="iu-progress"><i style="width:${pct}%"></i></div><small>${pct}% of started lessons completed</small></article>`;
        })
        .join(
          "",
        )}<div class="iu-rule"></div><h3>Learning Summary</h3><p>${s.started} lessons started<br>${s.completed} lessons completed</p><div class="iu-progress"><i style="width:${s.percent}%"></i></div></aside></div><div class="iu-two iu-student-bottom"><section class="iu-panel"><header><h2>Pedagogy Notes</h2>${privacyIcon("edit")}</header><textarea id="iu-student-note" rows="6" maxlength="6000" placeholder="Add private teaching observations...">${esc(d.note)}</textarea><button class="btn out w" onclick="InstructorUI.saveStudentNote(${s.id})">Save Private Notes</button><h4>Focus Areas for Next Session</h4>${d.lessons
        .slice(0, 3)
        .map(
          (l) =>
            `<label class="iu-check"><input type="checkbox" ${focus[l.id] ? "checked" : ""} onchange="const focus=InstructorUI.local('focus-'+${s.id},{});focus[${l.id}]=this.checked;InstructorUI.store('focus-'+${s.id},focus)">${esc(l.title)}</label>`,
        )
        .join(
          "",
        )}<small>Session focus choices stay on this browser.</small></section><section class="iu-panel iu-student-insights"><h2>Instructor Assistant Insights</h2><article><h3>Progress Snapshot</h3><p>${esc(s.name)} has completed ${s.completed} of ${s.started} started lessons in your courses. Use your teaching observations to plan the next session.</p><small>Based on recorded progress. No automated skill prediction has been generated.</small></article><div class="iu-two"><article><small>Completion</small><h2>${s.percent}%</h2></article><article><small>Courses</small><h2>${s.courses}</h2></article></div><button class="btn out w" onclick="InstructorUI.studentReport()">Generate Learning Report</button></section></div></div>`,
    );
  };
  const onboardingScreen = V.onboard;
  V.onboard = (step) => {
    if (+step !== 4 || !I.profile.approved) return onboardingScreen(step);
    return `<div class="iu-onboard iu-faculty-welcome"><header class="iu-onboard-header">${I.logo()}<a href="#/studio">${icon("community")}</a></header><main><div class="iu-welcome-heading"><div class="iu-welcome-line"><span>01</span><span>02</span><span>03</span></div><small>Final Step: Confirmation</small><h1>Welcome to the EartoKeys Faculty, <em>${S.user.name.split(" ")[0]}</em></h1><p>${I.profile.completedAt ? "Your profile is saved. Your artistic journey as an instructor begins here." : "Your account is approved. Complete your profile to introduce your teaching practice."}</p></div><div class="iu-welcome-cards">${[
      [
        "Start Your First Session",
        "Plan your next live masterclass, studio recording, or personal coaching session.",
        "studio/sessions",
        "video",
      ],
      [
        "Build Your Curriculum",
        "Structure your teaching approach and build your first learning modules.",
        "studio/courses",
        "courses",
      ],
      [
        "Browse Student Work",
        "Review performance previews and plan helpful feedback.",
        "studio/reviews",
        "community",
      ],
    ]
      .map(
        ([title, copy, href, x]) =>
          `<a class="iu-panel" href="#/${href}"><span class="iu-square-icon">${icon(x)}</span><h2>${title}</h2><p>${copy}</p></a>`,
      )
      .join(
        "",
      )}</div><div class="iu-welcome-enter"><a class="btn" href="#/studio">Enter Instructor Portal</a><p>${S.user.verified ? "Email Verified" : "Email Verification Required"} · Instructor Account Approved</p></div><section class="iu-welcome-story">${I.photo(imageFor("feature", "instructor-join") || imageFor("feature", "founder-studio"))}<div><h2>Ready to inspire?</h2><p>Your dashboard brings your courses, lessons, and student progress together. Share your teaching practice and help students build confidence at the piano.</p></div></section></main>${I.footer()}</div>`;
  };
  return I;
})();
