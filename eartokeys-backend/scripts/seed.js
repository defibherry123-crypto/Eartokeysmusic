'use strict';
const { createApp } = require('../src/app');
const { seed } = require('../src/seed');
const app = createApp();
seed(app.ctx).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
