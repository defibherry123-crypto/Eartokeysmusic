# EarToKeysMusic: backend + website, running together

The website (`public/index.html`, your prototype) is now wired to the backend. One server serves both, so there is nothing else to configure.

## Run it in VS Code (3 steps)

Needs **Node 22.13 or newer** (`node -v`). No `npm install` is needed: there are zero dependencies.

1. Open this folder in VS Code (File > Open Folder).
2. In the terminal (Ctrl+`): `npm run setup` (creates the database, courses, demo accounts, sample videos).
3. `npm start`, then open **http://localhost:3000** in your browser.

Open it through that address, not by double-clicking the HTML file or using Live Server. The login cookie only works on the same address as the API.
You can also press F5 (Run > "EarToKeys: run server"). `npm run dev` restarts the server when you edit backend files. Refresh the browser after editing `public/index.html`.
`npm run reset` wipes the data so you can start fresh, then `npm run setup` again.

### Accounts to try (password for all demo accounts: `Demo-Pass-123`)

| Email | What it shows |
|---|---|
| `active@demo.test` | Intermediate plan, active. Advanced lessons are locked (plan too low). |
| `grace@demo.test` | Plan ended 3 days ago: 7-day grace period, banner counts the days left. |
| `expired@demo.test` | Grace over: only the free course plays. |
| `new@demo.test` | Never subscribed: try the payment flow (fake Paystack page, no money). |
| `instructor@demo.test` | Approved instructor. Sign in at `#/instlogin`. |
| `admin@eartokeys.local` | Admin. Password is `ADMIN_PASSWORD` in `.env` (`Admin-Local-Pass-123`). |

Sign up with a brand-new email to test verification: the 6-digit code is printed in the terminal where the server runs.

### What now talks to the backend

Sign up / sign in / email code / reset password, skill level, plans and prices, checkout and the "Securing your seat" screen, subscription banner (active, grace, expired), course catalogue and course pages, lesson library, the real video player (signed link, seeking, email watermark, saved position), progress, resource downloads, support form, settings and change password. Instructor studio: create courses, upload lesson videos, publish. Admin: overview, users (grant access, approve instructors, disable), videos, payments, resources, support inbox.

Still prototype-only (kept in the browser's localStorage, no backend yet): Community, Book a session, Performance reviews, student uploads, instructor student roster, blog, newsletter.

---

## Admin image uploads

Sign in as an admin and open **Product images** in the dashboard (`#/admin/images`). Upload or replace JPG, PNG, or WebP pictures up to 5 MB for course covers, resource cards, and the three featured library panels. The gallery shows previews and a remove option. Uploaded course covers appear on the landing page, course listing, and course details; resource and featured images appear in the library after refreshing or navigating to it.

**Legal pages:** choose this filter in Product images to upload the piano image for the Terms of Use page (`#/terms`).

**Founder page:** choose this filter in Product images to upload the wide founder banner, piano-practice image, and teaching-studio image used at `#/founder`. These are separate slots so changing the banner does not overwrite the team portrait. The existing local `public/assets/founder.png` is a fallback when a banner has not been uploaded.

**About & team:** choose this filter in Product images to upload the About page piano picture and portraits for Joshua Rapheal, Elina Chris, Marcus Ubon, and Unwana Berry. Portraits are displayed in black and white to match the About design. Until pictures are uploaded, team cards show initials; the founder can also use the existing local `public/assets/founder.png` as a fallback.

**Testimonials:** in Product images, choose the Testimonials filter to upload a picture and a performance video for Cindy E., Haifeng Xue, or Nayelie. Videos support MP4, WebM, and MOV up to 100 MB. Preview, replace, or remove videos from the same card. The public Testimonials page plays uploaded performances in a dialog with video controls. Original student media is not included; until uploaded, the play button shows a missing-video message. Videos are stored in `storage/testimonials/` and recorded in SQLite.

Pictures and downloadable resources are separate: use **Resources** to add a resource and upload its PDF, MIDI, or ZIP file; use **Product images** for its picture. Add new courses through the existing course-management workflow; they then appear in the image gallery. Featured download files use the matching titles shown on the library page.

Images are stored in `storage/images/`, with metadata in SQLite. Back up both `data/` and `storage/`; they must be on persistent storage in production. The image table is created automatically on startup, preserving existing accounts, courses, and files. Admin access is required to upload or remove images; public thumbnail access is limited to published courses/resources and the featured panels.

## Backend reference

Accounts, Paystack subscriptions with a **7-day grace period**, and **protected video streaming** for the EarToKeysMusic platform.
Zero npm dependencies: it uses Node 22's built-in SQLite, crypto and HTTP, so there is nothing to install.

## Run it (5 minutes)

Requires **Node 22.13 or newer** (`node -v`).

```bash
cp .env.example .env        # then edit it (see below)
# the npm scripts read .env automatically (on live hosting, set the variables in the host's dashboard)
npm run seed                # creates 8 courses, 22 lessons, 4 resources and your admin account
npm start                   # http://localhost:3000
npm test                    # 23 tests: should all pass
```

With no `PAYSTACK_SECRET_KEY`, the server uses a **fake payment page** (`/api/dev/mock-pay`) so you can click through the whole
flow with no money. Verification emails are printed in the terminal and saved in the `outbox` table.

## Going live checklist

1. `NODE_ENV=production`, `APP_SECRET` (48+ random chars), `PAYSTACK_SECRET_KEY` (`sk_live_...`). The server refuses to start without them.
2. `BASE_URL` = public URL of this API, `FRONTEND_URL` = the website, `ALLOWED_ORIGINS` = the website origin(s). Serve over **HTTPS**.
3. Paystack Dashboard > Settings > API Keys & Webhooks: set the **Webhook URL** to `https://YOUR-API/api/webhooks/paystack`.
   (The callback URL is sent automatically with every payment: `https://YOUR-API/api/billing/callback`.)
4. Put `data/` (the database) and `storage/` (videos, resources) on a **persistent disk**, and back them up. `DB_PATH` / `STORAGE_DIR` set the locations.
5. If you are behind a proxy/load balancer, set `TRUST_PROXY=1`. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` (12+ chars) once, run `npm run seed`, then remove the password from the env.
6. Replace the mailer (`src/mailer.js`) with a real provider (see "Not done yet"). Until then, **users will not receive verification or reset emails.**

## The rules, as implemented

| Rule | Where |
|---|---|
| Prices live on the server (₦5,900 / 7,900 / 9,900 a month; annual = 9.6 x monthly, i.e. 20% off). The browser only says which plan. | `src/plans.js` |
| Access is **derived** from paid periods + the clock: `active` -> `grace` (7 days, `GRACE_DAYS`) -> `expired`. Nothing can drift out of date. | `src/access.js` |
| Grace = full access plus a banner (`access.graceDaysLeft`). After day 7 only free lessons remain open. | `canWatch()` |
| Plan levels: Beginner < Intermediate < Advanced. A plan watches its own level and below. Courses flagged free ("Piano for Complete Beginners") need only an account. Instructors/admins can watch everything. | `canWatch()` |
| Renew early: new period starts when the current one ends (no lost days). Renew after a lapse: starts now. Paying for a *different* plan while active takes effect at the next period (matches your FAQ). | `grantPeriod()` |
| Money is only trusted after Paystack confirms it: we call Paystack's verify API, check amount + currency match the order, and apply it in one DB transaction. The webhook, the redirect and the "verify" button can all fire in any order; the customer still gets exactly one period. A wrong amount never grants access (and is logged). | `src/payments.js` |
| Webhook signature (HMAC-SHA512 of the raw body) is checked before anything else. | `routes/billing.js` |
| Video: `POST /api/lessons/:id/stream-url` checks the subscription and returns a signed link valid 1 hour (`STREAM_TTL_SECONDS`) tied to that user + lesson. The stream endpoint **re-checks the subscription on every request**, so a lapsed account is cut off mid-video. Supports seeking (HTTP Range). The response includes `watermark` (viewer's email) for your overlay. | `src/media.js` |
| Reminders (hourly job, each sent once per period): 3 days before expiry, grace started, 24h before lock, access paused. | `src/jobs.js` |

## API reference

All bodies are JSON. Errors look like `{ "error": { "code": "plan_too_low", "message": "..." } }`.
Auth is an HttpOnly cookie, or send header `X-Auth-Mode: bearer` on login/signup to also get a `token` for `Authorization: Bearer`.

**Accounts** `POST /api/auth/signup` `instructor-signup` `login` `logout` `verify-email` `resend-code` `forgot-password` `reset-password` `change-password` · `GET/PATCH /api/me` (name, level)

**Public** `GET /api/plans` · `GET /api/courses?level=&q=&sort=price` · `GET /api/courses/:slug` · `GET /api/resources?category=&q=` · `POST /api/support`

**Student** `GET /api/lessons?level=&q=&course=` · `GET /api/lessons/:id` · `POST /api/lessons/:id/stream-url` · `GET /api/stream/:token` · `PUT /api/lessons/:id/progress` `{position, completed}` · `GET /api/progress` · `GET /api/resources/:id/download`

**Billing** `POST /api/billing/checkout` `{plan, billing:'monthly'|'annual', method:'card'|'paystack'|'bank_transfer'}` -> `{authorizationUrl}` · `POST /api/billing/verify` · `GET /api/billing/payments/:reference` · `GET /api/billing/history` · `GET /api/billing/callback` · `POST /api/webhooks/paystack`

**Instructor** (approved instructors; admins see everything) `GET/POST/PATCH /api/studio/courses` · `GET/POST/PATCH/DELETE /api/studio/lessons` · `PUT /api/studio/lessons/:id/file` (raw video body, `Content-Type: video/mp4|webm|quicktime`)

**Admin** `GET /api/admin/overview` `users?q=` `payments` `support` · `POST /api/admin/users/:id/grant` (manual access, e.g. a confirmed bank transfer) `…/disable` · `POST /api/admin/instructors/:id/approve` · `POST /api/admin/resources` · `PUT /api/admin/resources/:id/file`

Upload a video with curl:
```bash
curl -X PUT "$API/api/studio/lessons/5/file" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: video/mp4" --data-binary @lesson.mp4
```

## Connecting the prototype

Done: `public/index.html` loads `public/etk-api.js` (`window.ETK`) and calls it for everything listed at the top. To host the website on a different domain later, use `ETK.init({ base: 'https://api...', bearer: true })` and add the site to `ALLOWED_ORIGINS`.

## Honest limits

* **"Streaming only" is deterrence, not DRM.** Signed short-lived links, per-request subscription checks, no download button and a visible email watermark stop casual sharing and make leaks traceable. A determined person can still screen-record. For stronger protection (encrypted HLS, DRM) put videos on Cloudflare Stream, Mux or Bunny Stream and have `stream-url` return their signed playback URL; the access rules stay exactly the same.
* Single server: SQLite and the in-memory rate limiter are perfect for one VPS/Render/Railway instance. For several servers, move to Postgres and Redis.
* Back up `data/` and `storage/`.

## Not done yet

* **Real email sending** (verification, reset, reminders): needs a provider such as Resend, Brevo or SendGrid. One function in `src/mailer.js`.
* **Automatic card renewal.** Today each period is paid manually (matches your grace-period/"Renew" design). Charging saved cards needs Paystack's `authorization_code` flow.
* Prototype features with no backend yet: Community, Book a session, Performance reviews, student uploads, instructor student lists, blog articles.
* Prices are in `src/plans.js`, so changing them is a one-file edit. Confirm the **refund policy** with your client before launch; the FAQ/Terms wording is a placeholder.
