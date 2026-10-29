'use strict';
/**
 * Email is behind one tiny interface: send({ to, subject, text }).
 * This default implementation stores every email in the `outbox` table (and prints it in development)
 * so nothing is lost. To send real email, replace it with SMTP / Resend / SendGrid / Mailgun / Brevo.
 */
function createMailer(ctx) {
  return {
    async send({ to, subject, text }) {
      ctx.db.prepare('INSERT INTO outbox (to_email,subject,body,created_at) VALUES (?,?,?,?)').run(to, subject, text, ctx.now());
      if (!ctx.config.isProd && !ctx.quiet) console.log(`\n[mail] to=${to} | ${subject}\n${text}\n`);
    },
  };
}
module.exports = { createMailer };
