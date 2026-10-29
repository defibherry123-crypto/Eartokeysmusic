'use strict';
const { slugify } = require('./util');
const { hashPassword } = require('./auth');

// Catalogue copied from the prototype: [title, level, hours, students, description, isFree]
const COURSES = [
  ['The Art of Classical Piano', 'Intermediate', 42, 12847, 'Master the timeless techniques of classical piano through Chopin, Bach and Beethoven.', 0],
  ['Worship Piano Mastery', 'Beginner', 42, 12847, 'Lead worship with confidence. From basic chords to full arrangements.', 0],
  ['Jazz Piano Fundamentals', 'Intermediate', 30, 10847, 'Jazz improvisation, voicings and swing feel from real standards.', 0],
  ['Piano for Complete Beginners', 'Beginner', 35, 120847, 'Start from zero. Note reading, basic technique and your first pieces in weeks.', 1],
  ['The Art of Improvisation', 'Advanced', 45, 120500, 'Break free from the sheet music with scales, motifs and harmonic intuition.', 0],
  ['Blues and Soul Piano', 'Intermediate', 28, 9200, 'Blues licks, soul progressions and the emotional vocabulary of American music.', 0],
  ['Chords by Ear', 'Beginner', 20, 34100, 'Hear a progression once and play it. The foundation of everything we teach.', 0],
  ['Contemporary Accompaniment', 'Advanced', 38, 7400, 'Accompany singers and bands in any key, by ear.', 0],
];
const mmss = (s) => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };

// [course title, module, [[lesson title, duration]]]  (lesson content from the prototype)
const LESSONS = [
  ['The Art of Classical Piano', 'Module 1: Foundation and Touch', [['Introduction to the Course', '8:20'], ['Hand Position and Posture', '18:30'], ['The Art of Touch and Tone', '12:45'], ['Five-Finger Exercises', '22:10']]],
  ['The Art of Classical Piano', 'Module 2: Scales and Arpeggios', [['Major Scales by Ear', '14:05'], ['Minor Scales', '16:40']]],
  ['The Art of Classical Piano', 'Module 3: Chopin Nocturnes', [['Nocturne Op. 9 No. 2', '24:30'], ['Pedaling and Phrasing', '19:15']]],
  ['Piano for Complete Beginners', 'Module 1: Getting Started', [['Welcome to the Piano', '6:10'], ['Finding Middle C', '9:40']]],
  ['Chords by Ear', 'Module 1: Hearing the Basics', [['Finding Your Home Key', '8:00'], ['Hearing Intervals', '11:00'], ['Triads by Ear', '14:00'], ['Rhythm Basics', '17:00']]],
  ['Jazz Piano Fundamentals', 'Module 1: Harmony', [['Chord Progressions 101', '20:00'], ['Left-Hand Patterns', '23:00'], ['Seventh Chords', '26:00'], ['Gospel Passing Chords', '29:00']]],
  ['The Art of Improvisation', 'Module 1: Advanced Harmony', [['Voicings & Inversions', '32:00'], ['Jazz ii-V-I', '35:00'], ['Reharmonization', '38:00'], ['Modal Interchange', '41:00']]],
];
const RESOURCES = [
  ['Debussy: Clair de Lune', 'Impressionist Archive, 12MB', 'PDF', 'Sheet Music', null, 1],
  ['Hanon: The Virtuoso Pianist', 'Exercises 1-20, MIDI bundle', 'MIDI', 'MIDI Files', null, 1],
  ['Beethoven: Moonlight Sonata', 'Original manuscript scan', 'PDF', 'Sheet Music', 'Beginner', 0],
  ['Pedal Mechanics Masterguide', 'Technique whitepaper', 'DOC', 'Sheet Music', 'Intermediate', 0],
];

/** Idempotent: safe to run again. Never overwrites anything that already exists. */
async function seed(ctx, { log = console.log } = {}) {
  const { db } = ctx;
  const now = ctx.now();
  const courseId = new Map();
  for (const [title, level, hours, students, description, free] of COURSES) {
    const slug = slugify(title);
    let row = db.prepare('SELECT id FROM courses WHERE slug=?').get(slug);
    if (!row) {
      const id = Number(db.prepare('INSERT INTO courses (slug,title,level,hours,students,rating,rating_count,description,is_free,published,created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
        .run(slug, title, level, hours, students, 4.9, 2341, description, free, now).lastInsertRowid);
      row = { id };
    }
    courseId.set(title, row.id);
  }
  for (const [course, module, items] of LESSONS) {
    const cid = courseId.get(course);
    if (db.prepare('SELECT 1 FROM lessons WHERE course_id=? AND module=?').get(cid, module)) continue;
    items.forEach(([title, dur], i) => {
      const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 p FROM lessons WHERE course_id=?').get(cid).p;
      db.prepare('INSERT INTO lessons (course_id,module,position,title,duration_sec,published,created_at) VALUES (?,?,?,?,?,1,?)').run(cid, module, pos, title, mmss(dur), now);
    });
  }
  for (const [title, subtitle, kind, category, minLevel, featured] of RESOURCES) {
    if (!db.prepare('SELECT 1 FROM resources WHERE title=?').get(title))
      db.prepare('INSERT INTO resources (title,subtitle,kind,category,min_level,featured) VALUES (?,?,?,?,?,?)').run(title, subtitle, kind, category, minLevel, featured);
  }
  log(`Catalogue ready: ${db.prepare('SELECT COUNT(*) n FROM courses').get().n} courses, ${db.prepare('SELECT COUNT(*) n FROM lessons').get().n} lessons, ${db.prepare('SELECT COUNT(*) n FROM resources').get().n} resources.`);

  const { adminEmail, adminPassword } = ctx.config;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    if (!db.prepare('SELECT 1 FROM users WHERE email=?').get(adminEmail.toLowerCase())) {
      db.prepare("INSERT INTO users (name,email,password_hash,role,email_verified,created_at) VALUES (?,?,?,'admin',1,?)")
        .run('Administrator', adminEmail.toLowerCase(), await hashPassword(adminPassword), now);
      log(`Admin account created: ${adminEmail}`);
    } else log('Admin account already exists.');
  } else log('No ADMIN_EMAIL / ADMIN_PASSWORD set, so no admin account was created.');
}
module.exports = { seed };
