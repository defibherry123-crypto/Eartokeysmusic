/*  EarToKeysMusic API client. Served by the backend at /etk-api.js and used by public/index.html.
 *  <script src="/etk-api.js"></script>   then use window.ETK
 *
 *  Same-site hosting (website served by this server, or on a sub-domain with ALLOWED_ORIGINS set):
 *      ETK.init({ base: '' })                       // cookie session, nothing else to do
 *  Different domain / mobile app:
 *      ETK.init({ base: 'https://api.eartokeys.com', bearer: true })   // token kept in sessionStorage
 */
(function () {
  let BASE = '', BEARER = false, token = null;
  try { token = sessionStorage.getItem('etk_token'); } catch (e) {}

  async function call(method, path, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (BEARER) { headers['X-Auth-Mode'] = 'bearer'; if (token) headers.Authorization = 'Bearer ' + token; }
    const res = await fetch(BASE + path, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error((data.error && data.error.message) || 'Request failed');
      e.status = res.status; e.code = data.error && data.error.code; throw e;   // e.code e.g. 'plan_too_low', 'subscription_expired'
    }
    if (data.token) { token = data.token; try { sessionStorage.setItem('etk_token', token); } catch (e) {} }
    return data;
  }
  const q = (o) => { const s = new URLSearchParams(Object.entries(o || {}).filter(([, v]) => v)).toString(); return s ? '?' + s : ''; };

  window.ETK = {
    init(o) { BASE = (o && o.base) || ''; BEARER = !!(o && o.bearer); },

    // accounts   (replaces login(), signup(), the 6-digit verify screen, reset screen)
    signup: (name, email, password) => call('POST', '/api/auth/signup', { name, email, password }),
    instructorSignup: (name, email, password, specialty) => call('POST', '/api/auth/instructor-signup', { name, email, password, specialty }),
    login: (email, password) => call('POST', '/api/auth/login', { email, password }),
    logout: async () => { await call('POST', '/api/auth/logout'); token = null; try { sessionStorage.removeItem('etk_token'); } catch (e) {} },
    verifyEmail: (code) => call('POST', '/api/auth/verify-email', { code }),
    resendCode: () => call('POST', '/api/auth/resend-code'),
    forgotPassword: (email) => call('POST', '/api/auth/forgot-password', { email }),
    resetPassword: (token, password) => call('POST', '/api/auth/reset-password', { token, password }),
    changePassword: (currentPassword, newPassword) => call('POST', '/api/auth/change-password', { currentPassword, newPassword }),
    me: () => call('GET', '/api/me'),                       // { user, access:{state,plan,graceDaysLeft,...} } -> drives the banner
    updateMe: (patch) => call('PATCH', '/api/me', patch),   // { level:'Beginner' } from the "Tell us about your journey" screen

    // public pages
    plans: () => call('GET', '/api/plans'),
    courses: (o) => call('GET', '/api/courses' + q(o)),     // { level, q, sort:'price' }
    course: (slug) => call('GET', '/api/courses/' + slug),
    resources: (o) => call('GET', '/api/resources' + q(o)),
    /** Downloads through fetch so the page stays put and errors (not subscribed, plan too low) can be shown. */
    async downloadResource(id) {
      const headers = {};
      if (BEARER && token) headers.Authorization = 'Bearer ' + token;
      const res = await fetch(BASE + '/api/resources/' + id + '/download', { credentials: 'include', headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const e = new Error((data.error && data.error.message) || 'Download failed');
        e.status = res.status; e.code = data.error && data.error.code; throw e;
      }
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = m ? m[1] : 'download'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
    contact: (name, email, subject, message) => call('POST', '/api/support', { name, email, subject, message }),

    // lessons
    lessons: (o) => call('GET', '/api/lessons' + q(o)),
    lesson: (id) => call('GET', '/api/lessons/' + id),
    progress: () => call('GET', '/api/progress'),
    saveProgress: (id, position, completed) => call('PUT', '/api/lessons/' + id + '/progress', { position, completed }),
    /** Attach a lesson to a <video> element. Refreshes the signed link before it expires. */
    async play(id, videoEl, onError) {
      try {
        const s = await call('POST', '/api/lessons/' + id + '/stream-url');
        videoEl.src = s.url;
        videoEl.controlsList = 'nodownload'; videoEl.disablePictureInPicture = true;
        videoEl.oncontextmenu = (e) => e.preventDefault();
        videoEl.addEventListener('loadedmetadata', () => { if (s.resumeAt) videoEl.currentTime = s.resumeAt; }, { once: true });
        const self = this;
        const timer = setTimeout(() => { const t = videoEl.currentTime, was = !videoEl.paused; self.play(id, videoEl, onError).then(() => { videoEl.currentTime = t; if (was) videoEl.play(); }); }, Math.max(10000, s.expiresAt - Date.now() - 120000));
        videoEl.addEventListener('emptied', () => clearTimeout(timer), { once: true });
        let last = 0;
        videoEl.addEventListener('timeupdate', () => { if (Date.now() - last > 15000) { last = Date.now(); self.saveProgress(id, Math.floor(videoEl.currentTime)).catch(() => {}); } });
        videoEl.addEventListener('ended', () => self.saveProgress(id, Math.floor(videoEl.currentTime), true).catch(() => {}));
        return s; // s.watermark = the viewer's email: draw it over the video
      } catch (e) { if (onError) onError(e); else throw e; }
    },

    // payments   (replaces pay(), paid(), the "securing" screen)
    checkout: (plan, billing, method) => call('POST', '/api/billing/checkout', { plan, billing, method }), // then: location = res.authorizationUrl
    paymentStatus: (ref) => call('GET', '/api/billing/payments/' + encodeURIComponent(ref)),               // poll from #/securing?reference=...
    billingHistory: () => call('GET', '/api/billing/history'),

    // generic JSON call for instructor / admin screens, e.g. ETK.call('GET', '/api/studio/courses')
    call,

    /** Upload a file as the raw request body (lesson videos, resources) with progress. contentType defaults to file.type. */
    upload(path, file, onProgress, contentType) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', BASE + path);
        xhr.withCredentials = true;
        xhr.setRequestHeader('Content-Type', contentType || file.type);
        if (BEARER && token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((100 * e.loaded) / e.total)); };
        xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
        xhr.onload = () => {
          let data = {};
          try { data = JSON.parse(xhr.responseText); } catch (e) {}
          if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
          const err = new Error((data.error && data.error.message) || 'Upload failed');
          err.status = xhr.status; err.code = data.error && data.error.code; reject(err);
        };
        xhr.send(file);
      });
    },
  };
})();
