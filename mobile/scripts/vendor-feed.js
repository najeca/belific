'use strict';
// Copies the pure modules the calendar feed needs from mobile/lib into the Edge
// Function's vendor folder (build plan phase 8). The Supabase bundler only
// reaches files under supabase/, so the function cannot import lib/ directly.
// The copies are byte for byte; lib/calendarFeedFunction.test.ts fails if they
// ever drift, so run this after changing any of them:
//   node scripts/vendor-feed.js
const fs = require('node:fs');
const path = require('node:path');

const LIB = path.join(__dirname, '..', 'lib');
const VENDOR = path.join(__dirname, '..', 'supabase', 'functions', 'belific-calendar-feed', 'vendor');
const FILES = ['icsFeed.ts', 'series.ts', 'repeat.ts', 'recurrence.ts', 'kanban.ts', 'duration.ts', 'subtasks.ts', 'types.ts'];

fs.mkdirSync(VENDOR, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(LIB, f), path.join(VENDOR, f));
console.log(`copied ${FILES.length} files to ${path.relative(process.cwd(), VENDOR)}`);

