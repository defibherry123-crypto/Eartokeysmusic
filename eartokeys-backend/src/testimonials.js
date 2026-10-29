'use strict';
const TESTIMONIALS = { cindy: 'Cindy E.', haifeng: 'Haifeng Xue', nayelie: 'Nayelie' };
const videoRow = (ctx, target) => ctx.db.prepare('SELECT * FROM testimonial_videos WHERE target=?').get(target);
function videoUrl(ctx, target) {
  if (!Object.hasOwn(TESTIMONIALS, target)) return null;
  const row = videoRow(ctx, target);
  return row ? `/api/testimonials/${target}/video?v=${encodeURIComponent(row.file_name)}` : null;
}
module.exports = { TESTIMONIALS, videoRow, videoUrl };
