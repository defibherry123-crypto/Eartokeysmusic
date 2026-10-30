/* Student screens follow the supplied references. Preview bookings/community never grant access. */
const StudentUI = (() => {
  const U = {
    profile: { bio: "", preferences: {} },
    category: "All Courses",
    courseQuery: "",
    resourceFilter: "All Resources",
    resourceQuery: "",
    resourcePage: 1,
    coursePage: 1,
    settingsTab: "Profile",
    lessonTab: "Overview",
    sort: "recent",
    recording: null,
    recordingUrl: null,
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    date: "",
    slot: "10:30 AM",
    sessionType: 0,
    instructor: 0,
    booking: null,
  };
  const paths = {
    dashboard: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
    courses: '<path d="m2 8 10-5 10 5-10 5Zm4 2v7l6 4 6-4v-7M22 8v9"/>',
    resources: '<path d="M8 3h13v15H8zM3 8v14h14M12 7v7m0-5 5-1v5"/>',
    community:
      '<circle cx="12" cy="6" r="3"/><path d="M6 21v-4c0-6 12-6 12 0v4M2 20v-4m20 4v-4"/><circle cx="3" cy="10" r="2"/><circle cx="21" cy="10" r="2"/>',
    uploads: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
    settings:
      '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
    support:
      '<circle cx="12" cy="12" r="10"/><path d="M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 4h.01"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
    bell: '<path d="M5 17h14l-2-3V8a5 5 0 0 0-10 0v6Zm5 4h4M12 1v2"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18M8 15h3v3H8z"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 3"/>',
    eye: '<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    video:
      '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-4v12l-6-4"/>',
    comment: '<path d="M3 3h18v14H8l-5 5Z"/>',
    heart:
      '<path d="M12 21S1 14 2 7c1-6 8-6 10-1 2-5 9-5 10 1 1 7-10 14-10 14Z"/>',
    arrow: '<path d="M3 12h18m-7-7 7 7-7 7"/>',
    card: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M5 16h5"/>',
    bank: '<path d="m2 7 10-5 10 5ZM4 11v7m5-7v7m6-7v7m5-7v7M2 22h20"/>',
    lock: '<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3"/>',
  };
  U.icon = (name) =>
    `<svg class="su-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.resources}</svg>`;
  const I = U.icon;
  U.logo = () =>
    `<a class="su-logo" href="#/home"><b>&#119070;</b> EartoKeysMusic</a>`;
  U.avatar = (name = S.user?.name || "", own = true) =>
    U.profile.avatarUrl && own
      ? `<img class="su-avatar" src="${esc(U.profile.avatarUrl)}" alt="Your profile picture">`
      : `<span class="su-avatar su-initial" aria-label="${name}">${name.slice(0, 1)}</span>`;
  U.top = (title, search = "") =>
    `<header class="su-top"><h1>${title}</h1>${search ? `<label class="su-search">${I("search")}<input aria-label="${search}" placeholder="${search}" oninput="StudentUI.search(this.value)"></label>` : ""}<button class="su-icon-button" aria-label="Notifications" onclick="StudentUI.notifications()">${I("bell")}</button><a href="#/app/settings" aria-label="Account settings">${U.avatar()}</a></header>`;
  U.notifications = () =>
    toast(
      "No new account notifications. Payment history is available under Subscription & Billing.",
    );
  rt = function (keep) {
    const active = document.activeElement,
      id = active?.id,
      start = active?.selectionStart,
      end = active?.selectionEnd;
    render();
    if (keep && id) {
      const input = document.getElementById(id);
      if (input) {
        input.focus();
        if (start !== null && typeof input.setSelectionRange === "function")
          try {
            input.setSelectionRange(start, end);
          } catch {}
      }
    }
  };
  const oldShell = shell;
  shell = function (role, on, html) {
    if (role !== "s") return oldShell(role, on, html);
    const links = [
      ["dash", "Dashboard", "dashboard"],
      ["courses", "Courses", "courses"],
      ["resources", "Resources", "resources"],
      ["community", "Community", "community"],
      ["uploads", "Uploads", "uploads"],
    ];
    return `<div class="student-shell"><aside class="student-sidebar">${U.logo()}<nav aria-label="Student navigation">${links.map(([r, t, i]) => `<a href="#/app/${r}" class="${on === "app/" + r ? "active" : ""}" ${on === "app/" + r ? 'aria-current="page"' : ""}>${I(i)}${t}</a>`).join("")}</nav><div class="su-nav-bottom"><a href="#/app/settings" class="${on === "app/settings" ? "active" : ""}">${I("settings")}Settings</a><a href="#/support">${I("support")}Support</a><a class="su-book-link" href="#/app/book">${I("calendar")}Book a Session</a><button class="su-signout" onclick="signOut()">Sign out</button></div></aside><main class="student-main">${["app/dash", "app/progress", "app/account"].includes(on) ? '<div class="su-content">' + html + "</div>" : html}</main></div>`;
  };
  const oldPreload = preload;
  preload = async function (a, b, c) {
    await oldPreload(a, b, c);
    if (a === "app") {
      U.profile = await ETK.call("GET", "/api/profile");
      if (b === "courses") await loadCourses();
      if (b === "settings" || b === "transfer") await loadHist();
      if (b === "play") {
        try {
          U.lesson = await ETK.lesson(c);
          U.course = await ETK.course(U.lesson.course.slug);
        } catch (e) {
          U.lesson = null;
          U.course = null;
        }
      }
    }
    if (a === "success") await loadHist();
    if (a === "login" || a === "signup") await loadCatalogImages();
  };
  U.search = (v) => {
    const r = route();
    if (r.b === "resources") {
      U.resourceQuery = v;
      U.resourcePage = 1;
    } else U.courseQuery = v;
    rt(1);
  };
  U.categoryFor = (c) =>
    /improv|accompan/i.test(c[0])
      ? "Improvisation"
      : /jazz|chord|theory/i.test(c[0])
        ? "Theory"
        : /classical|worship|repertoire/i.test(c[0])
          ? "Repertoire"
          : "Technique";
  U.photo = (url, extra = "") =>
    `<div class="su-photo ${extra}" style="background-image:url('/assets/piano-hero.png')">${uploadedPhoto(url)}</div>`;
  U.empty = (message) => `<p class="su-empty">${message}</p>`;
  U.pages = (page, total, kind) =>
    total > 1
      ? `<div class="su-pagination" aria-label="Pagination">${Array.from({ length: total }, (_, i) => `<button class="${page === i + 1 ? "active" : ""}" aria-label="Page ${i + 1}" onclick="StudentUI.${kind}Page=${i + 1};rt()">${i + 1}</button>`).join("")}</div>`
      : "";
  A.courses = () => {
    const all = CS.filter(
        (c) =>
          (U.category === "All Courses" || U.categoryFor(c) === U.category) &&
          c[0].toLowerCase().includes(U.courseQuery.toLowerCase()),
      ),
      total = Math.ceil(all.length / 5);
    U.coursePage = Math.min(U.coursePage, total || 1);
    const start = (U.coursePage - 1) * 5,
      list = all.slice(start, start + 5);
    return shell(
      "s",
      "app/courses",
      `<div class="su-content"><div class="su-heading"><div><h1>Courses Library</h1><p>Refine your mastery with world-class piano curriculum.</p></div><label class="su-search">${I("search")}<input id="su-course-search" type="search" placeholder="Search lessons, styles, or maestros..." aria-label="Search courses" value="${esc(U.courseQuery)}" oninput="StudentUI.courseQuery=this.value;StudentUI.coursePage=1;rt(1)"></label></div><div class="su-filters">${["All Courses", "Technique", "Theory", "Repertoire", "Improvisation"].map((x) => `<button class="${U.category === x ? "active dark" : ""}" aria-pressed="${U.category === x}" onclick="StudentUI.category='${x}';StudentUI.coursePage=1;rt()">${x}</button>`).join("")}</div><div class="su-course-grid">${list.map((c, i) => `<a class="su-course ${i === 0 ? "featured" : ""}" href="#/course/${c[7]}">${U.photo((S.catalogImages || []).find((x) => x.kind === "course" && x.slug === c[7])?.imageUrl)}<span class="su-category">${U.categoryFor(c)}</span><div class="su-card-body"><h2>${c[0]}</h2><p>${c[6]}</p><div class="su-card-meta"><span>${I("courses")}${c[1]}</span><span>${I("clock")}${c[2]} hours</span></div></div></a>`).join("") || U.empty("No courses match your search.")}</div><div class="su-list-foot"><p>Showing ${all.length ? start + 1 : 0}–${Math.min(start + 5, all.length)} of ${all.length} courses.</p>${U.pages(U.coursePage, total, "course")}</div></div>`,
    );
  };
  U.download = async (id) => {
    try {
      await ETK.downloadResource(id);
      let list = U.local("downloads", []);
      list.unshift({
        id,
        title: S.pubres.find((x) => x.id === id)?.title || "Resource",
        at: Date.now(),
      });
      U.write("downloads", list.slice(0, 10));
      toast("Download started");
      rt();
    } catch (e) {
      fail(e);
    }
  };
  U.local = (key, fallback) => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("etk-student-" + S.user.id + "-" + key),
        ) || fallback
      );
    } catch {
      return fallback;
    }
  };
  U.write = (key, value) =>
    localStorage.setItem(
      "etk-student-" + S.user.id + "-" + key,
      JSON.stringify(value),
    );
  U.resourceType = (r) =>
    r.kind === "MIDI"
      ? "Practice Tracks"
      : r.kind === "DOC"
        ? "Theory Guides"
        : "Sheet Music";
  A.resources = () => {
    const all = (S.pubres || []).filter(
      (r) =>
        (U.resourceFilter === "All Resources" ||
          U.resourceType(r) === U.resourceFilter) &&
        `${r.title} ${r.subtitle}`
          .toLowerCase()
          .includes(U.resourceQuery.toLowerCase()),
    );
    if (U.sort === "title") all.sort((a, b) => a.title.localeCompare(b.title));
    else all.sort((a, b) => b.id - a.id);
    const pages = Math.ceil(all.length / 6);
    U.resourcePage = Math.min(U.resourcePage, pages || 1);
    const recent = U.local("downloads", []);
    return shell(
      "s",
      "app/resources",
      `<div class="su-resource-layout"><section><header class="su-resource-top"><label class="su-search">${I("search")}<input id="su-resource-search" aria-label="Search resource library" type="search" placeholder="Search sheet music, tracks, or guides..." value="${esc(U.resourceQuery)}" oninput="StudentUI.resourceQuery=this.value;StudentUI.resourcePage=1;rt(1)"></label><button class="su-icon-button" aria-label="Notifications" onclick="StudentUI.notifications()">${I("bell")}</button></header><div class="su-resource-body"><div class="su-library-hero"><h1>Elevate Your Artistry with<br>Our <em>Resource Library</em></h1><p>Discover a curated collection of master-level sheet music, cinematic practice tracks, and comprehensive theory guides meticulously designed to accelerate your musical mastery.</p></div><div class="su-filters">${["All Resources", "Sheet Music", "Practice Tracks", "Theory Guides", "Masterclasses"].map((x) => `<button class="${U.resourceFilter === x ? "active" : ""}" aria-pressed="${U.resourceFilter === x}" onclick="StudentUI.resourceFilter='${x}';StudentUI.resourcePage=1;rt()">${x}</button>`).join("")}<label class="su-sort">Sort by: <select aria-label="Sort resources" onchange="StudentUI.sort=this.value;rt()"><option value="recent" ${U.sort === "recent" ? "selected" : ""}>Most Recent</option><option value="title" ${U.sort === "title" ? "selected" : ""}>Title</option></select></label></div><div class="su-resource-grid">${
        all
          .slice((U.resourcePage - 1) * 6, U.resourcePage * 6)
          .map(
            (r) =>
              `<article class="su-resource-card">${U.photo(imageFor("resource", r.id))}<span class="su-category">${esc(r.kind)}</span><div class="su-card-body"><button class="su-download" aria-label="Download ${esc(r.title)}" onclick="StudentUI.download(${r.id})">${I("download")}</button><h2>${esc(r.title)}</h2><p>${esc(r.subtitle)}</p><div class="su-card-meta"><span>${I("resources")}${esc(r.category)}</span><span>${r.available ? "File available" : "File not uploaded"}</span></div></div></article>`,
          )
          .join("") || U.empty("No resources match this filter yet.")
      }</div>${U.pages(U.resourcePage, pages, "resource")}<div class="su-request"><div><h2>Can’t find what<br>you’re looking for?</h2><p>Suggest a piece or a guide, and we’ll prioritize it for our next release.</p></div><a href="#/support" class="btn">Request a Resource</a></div></div></section><aside class="su-resource-rail"><h4>Recent Activity</h4>${recent.map((r) => `<div class="su-activity">${I("download")}<div><b>${esc(r.title)}</b><small>Downloaded ${esc(new Date(r.at).toLocaleDateString())}</small></div></div>`).join("") || "<p>No downloads yet. Your downloads on this browser appear here.</p>"}<div class="su-tip"><h3>Pro Tip</h3><p>Use the Practice Tracks filter to find MIDI files for your practice sessions.</p></div></aside></div>`,
    );
  };
  U.saveProfile = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector("[type=submit]");
    b.disabled = true;
    try {
      const d = await ETK.updateMe({
        name: document.querySelector("#sn").value.trim(),
        level: document.querySelector("#sl").value,
      });
      S.user.name = esc(d.user.name);
      S.level = d.user.level;
      U.profile = await ETK.call("PATCH", "/api/profile", {
        bio: document.querySelector("#su-bio").value,
      });
      toast("Profile saved");
      rt();
    } catch (err) {
      toast(err.message);
    } finally {
      b.disabled = false;
    }
  };
  U.uploadAvatar = async (file) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1048576
    )
      return toast("Choose a JPG, PNG or WebP image under 5 MB.");
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || "Upload failed");
      U.profile = d;
      toast("Profile picture saved");
      rt();
    } catch (e) {
      toast(e.message);
    }
  };
  U.removeAvatar = async () => {
    try {
      U.profile = await ETK.call("DELETE", "/api/profile/avatar");
      rt();
      toast("Profile picture removed");
    } catch (e) {
      toast(e.message);
    }
  };
  U.savePreferences = async (e) => {
    e.preventDefault();
    try {
      U.profile = await ETK.call("PATCH", "/api/profile", {
        preferences: {
          lessonUpdates: e.target.lessonUpdates.checked,
          communityReplies: e.target.communityReplies.checked,
        },
      });
      toast(
        "Preferences saved. Email delivery depends on the configured mail service.",
      );
    } catch (err) {
      toast(err.message);
    }
  };
  A.settings = () => {
    let panel = "";
    if (U.settingsTab === "Profile")
      panel = `<form class="su-panel su-profile" onsubmit="StudentUI.saveProfile(event)"><div class="su-profile-photo">${U.avatar()}<div><h2>Profile Picture</h2><p>Upload a high-resolution portrait. This helps teachers and fellow students identify you in the community.</p><label class="btn su-file-label">Upload New<input type="file" accept="image/png,image/jpeg,image/webp" onchange="StudentUI.uploadAvatar(this.files[0])"></label><button class="btn out" type="button" onclick="StudentUI.removeAvatar()">Remove</button><small>JPG, PNG or WebP · up to 5 MB</small></div></div><div class="su-profile-fields"><label>Display Name<input id="sn" required maxlength="100" value="${S.user.name}"></label><label>Piano Proficiency Level<select id="sl">${L.map((l) => `<option ${S.level === l ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="su-full">Student Bio<textarea id="su-bio" maxlength="500" rows="4" oninput="document.querySelector('#su-count').textContent=this.value.length">${esc(U.profile.bio || "")}</textarea><small>Character count: <span id="su-count">${(U.profile.bio || "").length}</span>/500</small></label></div><div class="su-form-actions"><button type="button" class="btn out" onclick="rt()">Discard Changes</button><button type="submit" class="btn">Save Profile Settings</button></div></form><div class="su-profile-bottom"><div class="su-panel"><h2>Your Progress</h2><p>Track completed lessons and continue your learning journey.</p><a href="#/app/progress">View progress →</a></div><div class="su-panel"><h2>${S.plan ? esc(S.plan) + " Student Status" : "Student Status"}</h2><p>${S.access?.periodEnd ? "Your current period ends " + when(S.access.periodEnd) + "." : "Choose a plan to start your learning journey."}</p><a class="btn out" href="#/plans">Manage Plan</a></div></div>`;
    else if (U.settingsTab === "Security")
      panel = `<form class="su-panel su-security" onsubmit="event.preventDefault();changePw()"><h2>Change Password</h2><label>Current Password<input type="password" id="cp" required autocomplete="current-password"></label><label>New Password<input type="password" id="np" minlength="8" required autocomplete="new-password" placeholder="Min. 8 characters"></label><button class="btn">Update Password</button></form>`;
    else if (U.settingsTab === "Notifications")
      panel = `<form class="su-panel su-security" onsubmit="StudentUI.savePreferences(event)"><h2>Notification Preferences</h2><label class="su-check"><input name="lessonUpdates" type="checkbox" ${U.profile.preferences.lessonUpdates ? "checked" : ""}>Lesson updates</label><label class="su-check"><input name="communityReplies" type="checkbox" ${U.profile.preferences.communityReplies ? "checked" : ""}>Community replies</label><p>Save your preferences here. Community delivery is not connected yet.</p><button class="btn">Save Preferences</button></form>`;
    else
      panel = `<div class="su-panel"><h2>Subscription & Billing</h2><p>${S.plan ? esc(S.plan) + " plan · " + esc(S.sub) : "No active plan."}</p><a class="btn" href="#/plans">Manage Plan</a><h3>Payment History</h3>${(S.hist || []).map((p) => `<div class="row"><span>${esc(p.plan)} · ${when(p.createdAt)}</span><b>${naira(p.amount)} · ${esc(p.status)}</b></div>`).join("") || "<p>No payments yet.</p>"}</div>`;
    return shell(
      "s",
      "app/settings",
      `${U.top("Account Settings")}<div class="su-content"><span class="su-eyebrow">General Settings</span><h1>Customize your learning experience</h1><div class="su-settings-tabs">${["Profile", "Subscription & Billing", "Notifications", "Security"].map((t) => `<button class="${U.settingsTab === t ? "active" : ""}" onclick="StudentUI.settingsTab='${t}';rt()">${t}</button>`).join("")}</div>${panel}</div>`,
    );
  };
  U.selectRecording = (file) => {
    if (!file) return;
    if (
      !["video/mp4", "video/quicktime", "video/webm"].includes(file.type) ||
      file.size > 500 * 1048576
    )
      return toast("Choose an MP4, MOV or WebM recording up to 500 MB.");
    if (U.recordingUrl) URL.revokeObjectURL(U.recordingUrl);
    U.recording = file;
    U.recordingUrl = URL.createObjectURL(file);
    const title = document.querySelector("#ut")?.value,
      notes = document.querySelector("#su-notes")?.value;
    U.uploadTitle = title || U.uploadTitle;
    U.uploadNotes = notes || U.uploadNotes;
    rt();
  };
  U.dropRecording = (e) => {
    e.preventDefault();
    U.selectRecording(e.dataTransfer.files[0]);
  };
  U.submitRecording = (e) => {
    e.preventDefault();
    if (!U.recording) return toast("Select a recording first.");
    const list = U.local("submissions", []);
    list.unshift({
      title: document.querySelector("#ut").value,
      fileName: U.recording.name,
      course: document.querySelector("#su-upload-course").value,
      notes: document.querySelector("#su-notes").value,
      at: Date.now(),
    });
    U.write("submissions", list);
    toast(
      "Preview saved on this browser. No recording has been sent to an instructor.",
    );
    U.uploadTitle = "";
    U.uploadNotes = "";
    U.recording = null;
    if (U.recordingUrl) URL.revokeObjectURL(U.recordingUrl);
    U.recordingUrl = null;
    rt();
  };
  A.uploads = () =>
    shell(
      "s",
      "app/uploads",
      `${U.top("Submit Performance")}<div class="su-content"><p class="su-subheading">Share your progress and get detailed feedback from your mentor.</p><p class="su-preview">Preview: select and preview a real recording. Submissions are saved on this browser; instructor delivery is not connected.</p><div class="su-upload-grid"><section><div class="su-dropzone" ondragover="event.preventDefault()" ondrop="StudentUI.dropRecording(event)"><span class="su-round-icon">${I("video")}</span><h2>${U.recording ? esc(U.recording.name) : "Drag and drop your recording"}</h2><p>MP4, MOV, or WEBM up to 500MB. High-quality audio preferred for technical feedback.</p><label class="btn su-file-label">Select File from Computer<input type="file" accept="video/mp4,video/quicktime,video/webm" onchange="StudentUI.selectRecording(this.files[0])"></label></div><div class="su-panel su-recording-tips"><h4>Recording Tips</h4><p>${I("eye")}Position the camera to show both your hands and posture clearly.</p><p>${I("music")}Ensure the room is quiet and the piano sound isn’t clipping.</p><p>${I("video")}Well-lit keys help the instructor analyze finger technique.</p></div></section><section><form class="su-panel su-upload-form" onsubmit="StudentUI.submitRecording(event)"><label>Performance Title<textarea id="ut" required maxlength="150" rows="2" placeholder="e.g., Chopin Nocturne in Eb Major – Week 4 Progress">${esc(U.uploadTitle || "")}</textarea></label><label>Course / Piece<select id="su-upload-course" required><option value="">Select a current project...</option>${CS.map((c) => `<option>${c[0]}</option>`).join("")}</select></label><label>Notes for Instructor<textarea id="su-notes" rows="6" maxlength="2000" placeholder="What specific areas would you like feedback on?">${esc(U.uploadNotes || "")}</textarea></label><button class="btn w">${I("arrow")}Submit for Review</button><small>Preview only — no review turnaround is scheduled.</small></form>${U.recordingUrl ? `<video class="su-recording-preview" src="${esc(U.recordingUrl)}" controls preload="metadata"></video>` : U.photo(imageFor("feature", "founder-practice"), "su-preview-thumbnail")}</section></div><h2>Your Preview Submissions</h2>${
        U.local("submissions", [])
          .map(
            (r) =>
              `<div class="su-panel su-submission"><b>${esc(r.title)}</b><span>${esc(r.fileName)} · ${new Date(r.at).toLocaleDateString()} · Local preview</span></div>`,
          )
          .join("") || U.empty("Nothing submitted yet.")
      }</div>`,
    );
  U.comment = (index) => {
    const input = document.querySelector("#su-comment-" + index);
    if (!input?.value.trim()) return;
    const list = U.local("comments", {});
    (list[index] ||= []).push({ name: S.user.name, text: input.value.trim() });
    U.write("comments", list);
    rt();
  };
  U.bookmark = (index) => {
    const list = U.local("bookmarks", []);
    const at = list.indexOf(index);
    if (at < 0) list.push(index);
    else list.splice(at, 1);
    U.write("bookmarks", list);
    rt();
  };
  U.share = async (index) => {
    const text = S.posts[index]?.t || "";
    try {
      await navigator.clipboard.writeText(text);
      toast("Post text copied");
    } catch {
      toast("Select the post text to copy and share it.");
    }
  };
  A.community = () => {
    const comments = U.local("comments", {}),
      bookmarks = U.local("bookmarks", []);
    return shell(
      "s",
      "app/community",
      `${U.top("Community Feed")}<div class="su-content su-community-layout"><div><p class="su-preview">Community preview: sample posts and your interactions are stored on this browser.</p><form class="su-panel su-composer" onsubmit="event.preventDefault();post()">${U.avatar()}<textarea id="pt" required maxlength="3000" placeholder="Share your latest practice session or ask a question..."></textarea><div class="su-composer-actions"><a class="btn out" href="#/app/uploads">${I("video")}Performance</a><a class="btn out" href="#/app/uploads">${I("resources")}Recordings</a><button class="btn out" type="button" onclick="document.querySelector('#pt').focus()">${I("support")}Ask Question</button><button class="btn">Post</button></div></form>${S.posts.map((p, i) => `<article class="su-panel su-post"><header>${U.avatar(p.a, p.a === S.user.name)}<div><b>${p.a}</b><small>${p.q ? "General Question" : "Practice session"} · Preview post</small></div><button class="su-icon-button" aria-label="${bookmarks.includes(i) ? "Unsave" : "Save"} post" onclick="StudentUI.bookmark(${i})">${I("resources")}</button></header>${p.q ? '<h2 class="su-orange">Advice for small hands on 10th intervals?</h2>' : ""}<p>${esc(p.t)}</p>${i === 0 && !p.q ? `<button class="su-community-video" aria-label="Preview performance" onclick="toast('This sample post has no performance video. Add your own from Uploads.')">${I("play")}</button>` : ""}<div class="su-post-actions"><button onclick="S.posts[${i}].c++;save();rt()">${I("heart")}${p.c} Claps</button><button onclick="document.querySelector('#su-comment-${i}').focus()">${I("comment")}${(comments[i] || []).length + (p.m || 0)} Comments</button><button onclick="StudentUI.share(${i})">${I("arrow")}Share</button>${bookmarks.includes(i) ? "<small>Saved</small>" : ""}</div><div class="su-comments">${(comments[i] || []).map((c) => `<div><b>${c.name}</b><p>${esc(c.text)}</p></div>`).join("")}<form onsubmit="event.preventDefault();StudentUI.comment(${i})"><input id="su-comment-${i}" aria-label="Comment on post" maxlength="2000" required placeholder="Write a comment..."><button class="btn sm">Reply</button></form></div></article>`).join("")}</div><aside class="su-community-rail"><div class="su-panel su-spotlight"><h2>Student Spotlight</h2><p>Celebrate your progress and share your latest achievement with the community.</p><button class="btn" onclick="document.querySelector('#pt').focus()">Share Achievement</button></div><div class="su-panel"><h2>Trending Topics</h2><h4>Pedal Technique</h4><p>Mastering the Half-Pedal for Debussy</p><h4>Equipment</h4><p>Best Microphones for Acoustic Piano?</p><h4>Theory</h4><p>Circle of Fifths: Beyond the Basics</p><small>Sample discussion topics</small><button class="btn out w" onclick="document.querySelector('#pt').focus()">Start a Discussion</button></div><div class="su-panel"><h4>Practicing Now</h4><p>Live presence is not connected yet.</p></div></aside></div>`,
    );
  };
  A.play = (id) => {
    const v = S.vids.find((x) => x.id == id);
    if (!v) return shell("s", "app/courses", U.empty("Lesson not found."));
    if (!can(v))
      return shell(
        "s",
        "app/courses",
        `<div class="su-content"><h1>Playback Locked</h1><p>${lockMsg(v)}</p><a class="btn" href="#/plans">View Plans</a></div>`,
      );
    const siblings = S.vids.filter((x) => x.cid === v.cid),
      completed = siblings.filter((x) => S.prog[x.id]?.done).length,
      next = siblings[siblings.indexOf(v) + 1];
    const lesson = U.lesson?.lesson || {};
    return shell(
      "s",
      "app/courses",
      `<div class="su-content su-player-layout"><section><div class="vid" id="vid"><video id="pv" playsinline preload="metadata" controls controlsList="nodownload noplaybackrate" disablepictureinpicture poster="${esc(imageFor("course", v.cid) || "/assets/piano-hero.png")}"></video><span class="wm" id="wm">${S.user.email}</span><div class="pverr" id="pverr" hidden></div></div><p class="su-breadcrumb">Course: ${v.course} › ${v.mod}</p><div class="su-lesson-heading"><div><h1>${v.t}</h1><p>${esc(U.course?.course?.instructorName || "EartoKeysMusic")} · ${v.l} · ${v.d} min</p></div><button id="dn" class="btn" onclick="done(${v.id})">${I("check")}${S.prog[id]?.done ? "Completed" : "Mark as Complete"}</button></div><div class="su-settings-tabs">${["Overview", "Resources", "Discussion"].map((t) => `<button class="${U.lessonTab === t ? "active" : ""}" onclick="StudentUI.lessonTab='${t}';StudentUI.lessonPanel()">${t}</button>`).join("")}</div><div id="su-lesson-panel">${U.lessonPanelHTML(v, lesson)}</div></section><aside class="su-panel su-lesson-list"><header><h2>Lesson Content</h2><p>${completed} of ${siblings.length} steps completed</p><div class="bar"><i style="width:${siblings.length ? (completed / siblings.length) * 100 : 0}%"></i></div></header>${siblings.map((x, i) => `<a class="${x.id === v.id ? "active" : ""}" href="#/app/play/${x.id}"><span class="su-step">${S.prog[x.id]?.done ? "✓" : i + 1}</span><div>${x.t}<small>${x.d} min${x.id === v.id ? " · Currently Playing" : !can(x) ? " · Locked" : ""}</small></div>${!can(x) ? I("lock") : ""}</a>`).join("")}${next ? `<a class="su-next" href="#/app/play/${next.id}">Next Up: ${next.t}${I("arrow")}</a>` : ""}</aside></div>`,
    );
  };
  const originalDone = done;
  done = async function (id) {
    await originalDone(id);
    if (!S.prog[id]?.done) return;
    const v = S.vids.find((x) => x.id == id),
      siblings = S.vids.filter((x) => x.cid === v?.cid),
      completed = siblings.filter((x) => S.prog[x.id]?.done).length,
      list = document.querySelector(".su-lesson-list");
    if (list) {
      list.querySelector("header p").textContent =
        `${completed} of ${siblings.length} steps completed`;
      list.querySelector(".bar i").style.width =
        (siblings.length ? (completed / siblings.length) * 100 : 0) + "%";
      const step = list.querySelector("a.active .su-step");
      if (step) step.textContent = "✓";
    }
  };
  U.lessonPanelHTML = (v, lesson) =>
    U.lessonTab === "Overview"
      ? `<p class="su-lesson-description">${esc(lesson.description || U.course?.course?.description || "Watch this lesson and practise at your own pace. Your place is saved automatically.")}</p><div class="su-lesson-notes"><div class="su-panel"><h3>Practice Notes</h3><p>Pause and repeat sections as needed. Mark the lesson complete when you have finished.</p></div><div class="su-panel"><h3>Your Progress</h3><p>Your place is saved automatically while you watch.</p><a href="#/app/progress">View learning progress →</a></div></div>`
      : U.lessonTab === "Resources"
        ? `<p>Explore sheet music and practice materials in your resource library.</p><a class="btn out" href="#/app/resources">Open Resources</a>`
        : `<p>Ask questions and share your practice with the community preview.</p><a class="btn out" href="#/app/community">Open Community</a>`;
  U.lessonPanel = () => {
    const v = S.vids.find((x) => x.id == route().c);
    document.querySelector("#su-lesson-panel").innerHTML = U.lessonPanelHTML(
      v,
      U.lesson?.lesson || {},
    );
    document
      .querySelectorAll(".su-settings-tabs button")
      .forEach((b) =>
        b.classList.toggle("active", b.textContent === U.lessonTab),
      );
  };
  U.changeMonth = (delta) => {
    U.month = new Date(U.month.getFullYear(), U.month.getMonth() + delta, 1);
    rt();
  };
  U.calendar = () => {
    const year = U.month.getFullYear(),
      month = U.month.getMonth(),
      offset = (new Date(year, month, 1).getDay() + 6) % 7,
      days = new Date(year, month + 1, 0).getDate(),
      today = new Date();
    today.setHours(0, 0, 0, 0);
    return `<div class="su-calendar-heading"><h3>${U.month.toLocaleString("en", { month: "long", year: "numeric" })}</h3><button aria-label="Previous month" onclick="StudentUI.changeMonth(-1)">‹</button><button aria-label="Next month" onclick="StudentUI.changeMonth(1)">›</button></div><div class="su-calendar">${["MO", "TU", "WE", "TH", "FR", "SA", "SU"].map((d) => `<small>${d}</small>`).join("")}${Array.from({ length: offset }, () => "<span></span>").join("")}${Array.from(
      { length: days },
      (_, i) => {
        const date = new Date(year, month, i + 1),
          key = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
          past = date < today;
        return `<button ${past ? "disabled" : ""} class="${U.date === key ? "active" : ""}" aria-label="${key}" aria-pressed="${U.date === key}" onclick="StudentUI.date='${key}';rt()">${i + 1}</button>`;
      },
    ).join("")}</div>`;
  };
  U.reserve = () => {
    if (!U.date) return toast("Choose a date from the calendar.");
    const date = new Date(U.date + "T00:00:00");
    if (date < new Date(new Date().setHours(0, 0, 0, 0)))
      return toast("Choose today or a future date.");
    U.booking = {
      id: crypto.randomUUID(),
      type: BT[U.sessionType][0],
      minutes: [60, 45, 30][U.sessionType],
      instructor: BI[U.instructor][0],
      price: U.instructor === 1 ? 95 : BT[U.sessionType][2],
      date: U.date,
      slot: U.slot,
    };
    const all = U.local("bookings", []);
    all.push(U.booking);
    U.write("bookings", all);
    go("#/app/booking-confirm");
  };
  U.bookingCard = (b) =>
    `<div class="su-confirm-details"><div><small>Session Type</small><h2>${esc(b.type)}</h2></div><div><small>Instructor</small><b>${esc(b.instructor)}</b></div><div class="su-full">${I("calendar")}<div><small>Date & Time</small><b>${esc(b.date)} · ${esc(b.slot)}</b></div><small>Africa/Lagos<br>${b.minutes} Minute Session</small></div></div>`;
  U.calendarDownload = () => {
    const b = U.booking || U.local("bookings", []).at(-1);
    if (!b) return toast("No preview booking found.");
    const [hour, minute, period] = b.slot
      .match(/(\d+):(\d+)\s*(AM|PM)/)
      .slice(1);
    let h = (+hour % 12) + (period === "PM" ? 12 : 0);
    const start = new Date(
        `${b.date}T${String(h).padStart(2, "0")}:${minute}:00+01:00`,
      ),
      end = new Date(start.getTime() + b.minutes * 60000),
      stamp = (d) =>
        d
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z$/, "Z");
    U.downloadBlob(
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//EartoKeysMusic//Preview//EN\r\nBEGIN:VEVENT\r\nUID:${b.id}@eartokeysmusic\r\nDTSTAMP:${stamp(new Date())}\r\nDTSTART:${stamp(start)}\r\nDTEND:${stamp(end)}\r\nSUMMARY:Preview - ${b.type}\r\nDESCRIPTION:Local preview only. This is not a confirmed instructor booking.\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,
      "session-preview.ics",
      "text/calendar",
    );
  };
  U.downloadBlob = (text, name, type) => {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  A.book = () =>
    shell(
      "s",
      "app/book",
      `<div class="su-content"><h1 class="su-book-title">Reserve Your Studio Time</h1><p class="su-book-lead">Elevate your mastery through focused sessions with our world-class faculty.<br>Choose your focus, select a mentor, and secure your time.</p><p class="su-preview">Booking preview: sample instructors, prices and slots. No payment or reservation is sent.</p><div class="su-book-grid"><section><h2 class="su-number-title"><span>1</span>Select Session Type</h2>${BT.map((t, i) => `<button class="su-choice ${U.sessionType === i ? "selected" : ""}" aria-pressed="${U.sessionType === i}" onclick="StudentUI.sessionType=${i};rt()"><span class="su-round-icon">${I(["courses", "resources", "video"][i])}</span><div><h3>${t[0]}</h3><p>${t[1]} · ${["Deep dive into technique and interpretation", "Harmony, composition, and analysis", "Feedback on your recorded submissions"][i]}</p></div><span class="su-radio"></span></button>`).join("")}<h2 class="su-number-title"><span>2</span>Choose Your Instructor</h2>${BI.map((t, i) => `<button class="su-choice su-instructor ${U.instructor === i ? "selected" : ""}" aria-pressed="${U.instructor === i}" onclick="StudentUI.instructor=${i};rt()">${U.avatar(t[0], false)}<div><h3>${t[0]}</h3><p>${t[1]}</p><small>Sample instructor · Preview availability</small></div><strong>$${i === 0 ? 120 : 95}<small>per hour</small></strong></button>`).join("")}</section><aside class="su-panel su-schedule"><h2 class="su-number-title"><span>3</span>Schedule Time</h2>${U.calendar()}<h4>Available Slots · Preview</h4><div class="su-slots">${["09:00 AM", "10:30 AM", "01:00 PM", "03:30 PM"].map((t) => `<button class="${U.slot === t ? "active" : ""}" onclick="StudentUI.slot='${t}';rt()">${t}</button>`).join("")}</div><div class="su-book-summary"><h4>Booking Summary</h4><div class="row"><span>Session:</span><b>${BT[U.sessionType][0]}</b></div><div class="row"><span>Instructor:</span><b>${BI[U.instructor][0]}</b></div><div class="row"><span>Date & Time:</span><b>${U.date || "Choose a date"}, ${U.slot}</b></div><div class="row"><b>Total Investment</b><strong>$${(U.instructor === 1 ? 95 : BT[U.sessionType][2]).toFixed(2)}</strong></div></div><button class="btn w" onclick="StudentUI.reserve()">${I("calendar")}Complete Reservation</button><small>Creates a local preview only. No payment is taken.</small><a href="#/app/schedule">View My Schedule</a></aside></div></div>`,
    );
  A["booking-confirm"] = () => {
    const b = U.booking || U.local("bookings", []).at(-1);
    if (!b)
      return shell(
        "s",
        "app/book",
        `<div class="su-content"><h1>No Session Selected</h1><a class="btn" href="#/app/book">Book a Session</a></div>`,
      );
    return `<div class="su-confirm-page"><div class="su-confirm-card"><a class="su-close" href="#/app/book" aria-label="Close confirmation">×</a><span class="su-success-icon">${I("check")}</span><h1>Your Session Preview is Saved!</h1><p>This preview is saved on your browser. No invitation or confirmation email has been sent.</p>${U.bookingCard(b)}<div class="su-confirm-actions"><button class="btn" onclick="StudentUI.calendarDownload()">${I("calendar")}Add to Calendar</button><a class="btn out" href="#/app/schedule">${I("dashboard")}View My Schedule</a></div></div><p>Need to change the time? Create a new preview from <a href="#/app/book">Book a Session</a>.</p></div>`;
  };
  A.schedule = () =>
    shell(
      "s",
      "app/book",
      `${U.top("My Schedule")}<div class="su-content"><h1>Your Session Previews</h1><p class="su-preview">These are local previews, not confirmed instructor reservations.</p>${
        U.local("bookings", [])
          .map(
            (b) =>
              `<article class="su-panel">${U.bookingCard(b)}<button class="btn out" onclick="StudentUI.booking=StudentUI.local('bookings',[]).find(b=>b.id==='${b.id}');StudentUI.calendarDownload()">Add to Calendar</button><button class="btn out" onclick="StudentUI.write('bookings',StudentUI.local('bookings',[]).filter(b=>b.id!=='${b.id}'));rt()">Remove Preview</button></article>`,
          )
          .join("") || U.empty("No session previews yet.")
      }<a class="btn" href="#/app/book">Book a Session</a></div>`,
    );
  U.oauth = (provider) =>
    toast(
      `${provider} sign-in is not configured yet. Please use your email and password.`,
    );
  U.togglePassword = () => {
    const input = document.querySelector("#p");
    input.type = input.type === "password" ? "text" : "password";
    const button = document.querySelector("[data-password-toggle]");
    button.setAttribute(
      "aria-label",
      input.type === "password" ? "Show password" : "Hide password",
    );
    button.setAttribute("aria-pressed", input.type === "text");
  };
  U.auth = (signupPage) =>
    `<div class="su-auth ${signupPage ? "su-signup" : "su-login"}"><section class="su-auth-photo" style="background-image:linear-gradient(0deg,#0009,transparent 60%),url('${esc(imageFor("feature", signupPage ? "auth-signup" : "auth-login") || "/assets/piano-hero.png")}')">${signupPage ? "" : U.logo()}<div>${signupPage ? "<h2>The art of mastery.</h2><p>Join our global community of dedicated pianists and unlock the secrets of classical performance.</p>" : "<blockquote>“The piano as a medium for expression is a whole world unto itself.”</blockquote><small>Mastery begins with a single note</small>"}</div></section><section class="su-auth-form">${signupPage ? U.logo() : ""}<h1>${signupPage ? "Create Account" : "Welcome back"}</h1><p>${signupPage ? "Begin your journey to piano excellence." : "Continue your journey toward musical mastery."}</p><div class="su-oauth ${signupPage ? "horizontal" : ""}"><button class="btn out" onclick="StudentUI.oauth('Google')"><span class="su-google">G</span>${signupPage ? "Google" : "Sign in with Google"}</button><button class="btn out" onclick="StudentUI.oauth('${signupPage ? "Apple" : "GitHub"}')">${signupPage ? '<svg class="su-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 1c0 3-2 5-4 5 0-3 2-5 4-5ZM20 17c-1 3-3 6-5 6-1 0-2-1-3-1s-2 1-3 1c-3 0-6-6-6-10 0-4 3-7 6-7 1 0 3 1 4 1s2-1 4-1 4 1 5 3c-5 2-5 7-2 8Z"/></svg>' : '<svg class="su-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1a11 11 0 0 0-3.5 21.4v-2.1c-2.5.5-3-.9-3-.9-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 0 1.5 1 1.5 1 .9 1.4 2.3 1 2.9.8.1-.7.4-1.1.7-1.4-2.2-.3-4.6-1.1-4.6-5A4 4 0 0 1 6.2 10a4 4 0 0 1 .1-2.8s.9-.3 3 1a10 10 0 0 1 5.5 0c2.1-1.3 3-1 3-1a4 4 0 0 1 .1 2.8 4 4 0 0 1 1.1 2.8c0 4-2.4 4.8-4.7 5 .4.3.7 1 .7 2v2.6A11 11 0 0 0 12 1Z"/></svg>'}${signupPage ? "Apple" : "Sign in with GitHub"}</button></div><div class="su-divider">${signupPage ? "Or continue with email" : "Or sign in with email"}</div><form class="auth-form" onsubmit="event.preventDefault();${signupPage ? "signup()" : "StudentUI.login()"}"><p class="account-form-error" data-form-error role="alert" hidden></p>${signupPage ? '<label>Full Name<input id="n" name="name" autocomplete="name" required maxlength="100" placeholder="Julian Aria"></label>' : ""}<label>Email Address<input id="e" name="email" type="email" autocomplete="email" required placeholder="${signupPage ? "name@example.com" : "julian@gmail.com"}"></label><label><span class="su-label-row">Password ${signupPage ? "" : '<a href="#/reset">Forgot Password?</a>'}</span><span class="su-password"><input id="p" name="password" type="password" autocomplete="${signupPage ? "new-password" : "current-password"}" required ${signupPage ? 'minlength="8"' : ""} placeholder="${signupPage ? "Min. 8 characters" : "••••••••"}"><button type="button" class="su-icon-button" data-password-toggle aria-label="Show password" aria-pressed="false" onclick="StudentUI.togglePassword()">${I("eye")}</button></span></label>${signupPage ? "" : '<label class="su-check"><input id="su-remember" type="checkbox" checked>Remember me for 30 days</label>'}<button class="btn w" type="submit">${signupPage ? "Create Account" : "Sign In →"}</button></form><p class="su-auth-switch">${signupPage ? 'Already have an account? <a href="#/login">Sign In</a>' : 'Don’t have an account? <a href="#/signup">Join EartoKeysMusic</a>'}</p><footer>${signupPage ? 'By creating an account, you agree to our <a href="#/terms">Terms of Service</a> and <a href="#/privacy">Privacy Policy</a>.' : '<a href="#/privacy">Privacy Policy</a> · <a href="#/terms">Terms of Service</a> · <a href="#/support">Support</a><p>© 2026 EartoKeysMusic. The art of mastery.</p>'}</footer></section></div>`;
  U.login = () =>
    accountAction(async () => {
      setMe(
        await ETK.call("POST", "/api/auth/login", {
          email: document.querySelector("#e").value.trim(),
          password: document.querySelector("#p").value,
          remember: document.querySelector("#su-remember").checked,
        }),
      );
      afterAuth();
    });
  V.login = () => U.auth(false);
  V.signup = () => U.auth(true);
  U.footer = () =>
    `<footer class="su-footer"><h2>Eartokeysmusic</h2><p>The art of mastery.</p><nav>${[
      ["privacy", "Privacy Policy"],
      ["terms", "Terms of Service"],
      ["faq", "FAQ"],
      ["support", "Support"],
      ["blog", "Blog"],
    ]
      .map(([r, t]) => `<a href="#/${r}">${t}</a>`)
      .join(
        "",
      )}</nav>${librarySocialIcons()}<small>© 2026 Eartokeysmusic. All rights reserved.</small></footer>`;
  U.orderSummary = (record) => {
    const plan = record?.plan || S.pick,
      annual = record ? record.billing === "annual" : S.bill === "y",
      usd = annual ? Math.round(P0[plan][0] * 9.6) : P0[plan][0],
      ngn =
        record?.amount ??
        (annual
          ? Math.round(+P0[plan][1].replace(/,/g, "") * 9.6)
          : +P0[plan][1].replace(/,/g, ""));
    return `<h2>Order Summary</h2><div class="row"><span>${esc(plan)} ${annual ? "Annual" : "Monthly"} Plan<small>Access to your subscribed learning level</small></span><span>$${usd.toFixed(2)}<small>≈ ${naira(ngn)}</small></span></div><div class="row"><span>Subtotal</span><span>$${usd.toFixed(2)}</span></div><div class="row"><span>Tax</span><span>$0.00</span></div><div class="row"><b>Total</b><strong>${naira(ngn)}<small>/${annual ? "year" : "month"}</small></strong></div>`;
  };
  V.checkout = () =>
    `<div class="su-payment-page"><header class="su-payment-header">${U.logo()}</header><main class="su-payment-content"><h1>Select Payment Method</h1><div class="su-checkout-grid"><section><h2>How would you like to pay?</h2><p>Choose your preferred payment method to begin your musical journey.</p><div class="su-payment-methods">${[
      [
        "Credit or Debit Card",
        "Visa, MasterCard, American Express, and more.",
        "card",
      ],
      ["Paystack", "Bank Transfer, USSD, and Mobile Money.", "bank"],
    ]
      .map(
        ([title, desc, icon], i) =>
          `<label class="su-choice su-payment-choice"><span class="su-round-icon">${I(icon)}</span><span><b>${title}</b><small>${desc}</small></span><input type="radio" name="m" value="${i === 0 ? "card" : "paystack"}" ${i === 1 ? "checked" : ""}></label>`,
      )
      .join(
        "",
      )}</div><div class="su-trust"><span>${I("lock")}Secure Checkout</span><span>${I("check")}Server-Verified Payment</span></div></section><aside><div class="su-panel su-order-summary">${U.orderSummary()}<button class="btn w" id="pay" onclick="StudentUI.pay()">Continue to Checkout ${I("arrow")}</button><p class="su-terms">By continuing, you agree to our <a href="#/terms">Terms of Service</a> and <a href="#/privacy">Privacy Policy</a>.</p></div><div class="su-tip"><h3>The art of mastery.</h3><p>Choose a learning plan that grows with you.</p></div></aside></div></main>${U.footer()}</div>`;
  U.pay = async () => {
    const b = document.querySelector("#pay");
    if (b.disabled) return;
    b.disabled = true;
    try {
      const method =
        document.querySelector("input[name=m]:checked")?.value || "paystack";
      const checkout = await ETK.checkout(
        S.pick,
        S.bill === "y" ? "annual" : "monthly",
        method,
      );
      sessionStorage.setItem(
        "etk-checkout-" + S.user.id,
        JSON.stringify(checkout),
      );
      if (method === "paystack") go("#/app/transfer");
      else location.href = checkout.authorizationUrl;
    } catch (e) {
      if (e.code === "email_not_verified") go("#/verify");
      else fail(e);
    } finally {
      b.disabled = false;
    }
  };
  U.checkoutRecord = () => {
    try {
      return JSON.parse(sessionStorage.getItem("etk-checkout-" + S.user.id));
    } catch {
      return null;
    }
  };
  U.verifyTransfer = async () => {
    const record = U.checkoutRecord();
    if (!record)
      return toast("Start a checkout to obtain a payment reference.");
    try {
      const result = await ETK.call("POST", "/api/billing/verify", {
        reference: record.reference,
      });
      setAccess(result.access);
      if (result.payment.status === "success") go("#/success");
      else if (result.payment.status === "pending")
        toast(
          "Payment is still pending. Complete the transfer on the payment provider’s page.",
        );
      else go("#/failed");
    } catch (e) {
      fail(e);
    }
  };
  U.openCheckout = () => {
    const record = U.checkoutRecord();
    if (!record?.authorizationUrl) return go("#/checkout");
    let url;
    try {
      url = new URL(record.authorizationUrl, location.origin);
    } catch {
      return toast("Invalid checkout link. Start a new checkout.");
    }
    if (!["https:", "http:"].includes(url.protocol))
      return toast("Invalid checkout link.");
    location.href = url.href;
  };
  A.transfer = () => {
    const record = U.checkoutRecord();
    return `<div class="su-payment-page"><header class="su-payment-header">${U.logo()}<a href="#/plans">← Back to Plans</a></header><main class="su-payment-content su-transfer-grid"><section><h1 class="su-orange">Bank Transfer</h1><p>Please use your payment provider’s page to complete your transfer.</p><div class="su-panel su-transfer-card"><div class="row"><div><small>Amount to Pay</small><h1>${record ? naira(record.amount) : "Choose a plan"}</h1></div><span class="su-category">${record ? "Awaiting Payment" : "No Checkout Started"}</span></div><div class="su-transfer-details"><div><small>Bank Name</small><b>Provided at secure checkout</b></div><div><small>Account Number</small><b>Open Paystack for transfer details</b></div><div><small>Account Holder</small><b>Confirmed by your payment provider</b></div></div><div class="su-payment-warning"><b>Transfer details are issued by the payment provider</b><p>The provider has not returned a bank account or expiry time to this website. Open secure checkout to see the correct details. Access is granted only after the server verifies payment.</p></div>${record ? `<small>Reference: ${esc(record.reference)}</small>` : ""}</div><div class="su-confirm-actions"><button class="btn" onclick="StudentUI.verifyTransfer()">I have made the transfer</button><button class="btn out" onclick="StudentUI.openCheckout()">${record ? "Open Secure Checkout" : "Start Checkout"}</button></div><button class="su-refresh" onclick="StudentUI.verifyTransfer()">Refresh Payment Status</button></section><aside><div class="su-panel su-order-summary">${U.orderSummary(record)}<div class="su-tip">Payment processed by Paystack</div></div><a class="su-panel su-help" href="#/support">${I("support")}<span><b>Need help?</b><small>Chat with support</small></span>${I("arrow")}</a></aside></main>${U.footer()}</div>`;
  };
  U.receipt = () => {
    const p = (S.hist || []).find((p) => p.status === "success");
    if (!p)
      return toast("There is no successful payment to download a receipt for.");
    U.downloadBlob(
      `EartoKeysMusic Payment Receipt\nReference: ${p.reference}\nName: ${S.user.name}\nPlan: ${p.plan} ${p.billing}\nAmount: ${p.currency} ${p.amount}\nPaid: ${new Date(p.paidAt || p.createdAt).toISOString()}\nStatus: ${p.status}\n`,
      "payment-receipt.txt",
      "text/plain",
    );
  };
  V.success = () => {
    const active = S.sub === "active",
      payment = (S.hist || []).find((p) => p.status === "success");
    return `<div class="su-welcome"><header>${U.logo()}</header><span class="su-success-icon">${I(active ? "check" : "clock")}</span><h1>${active ? "Welcome to EartoKeysMusic" : "Your Payment Status"}</h1><p>${active ? "Your musical journey begins today. Your subscription is now active and you’ll have access to our courses tailored to meet your needs." : "Your subscription is not active yet. Complete checkout or review your payment history to continue."}</p><div class="su-panel su-welcome-plan"><div class="row"><h4>Plan Details</h4><span class="su-category">${active ? "Active Now" : "Not Active"}</span></div><div class="row"><div><h2>${esc(S.plan || S.pick)} ${S.access?.billing === "annual" ? "Annual" : "Monthly"} Plan</h2><small>${active ? "Access to your subscribed learning level" : "Payment verification required"}</small></div><b>${payment ? naira(payment.amount) : "—"}</b></div><div class="su-tip"><p>${I("calendar")}${S.access?.periodEnd ? "Current period ends: " + when(S.access.periodEnd) : "No billing period available."}</p><p>${I(active ? "check" : "clock")}${active ? "Payment verified by the server" : "Payment pending or not started"}</p></div></div><a class="btn w" href="#/app/dash">Go to My Dashboard</a><div class="su-welcome-links"><button onclick="StudentUI.receipt()">${I("download")}Download Receipt</button><a href="#/support">${I("support")}Contact Support</a></div></div>`;
  };
  return U;
})();
