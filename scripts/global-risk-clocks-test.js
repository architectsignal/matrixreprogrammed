require('./build-mission-timers.js');

const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const forumWarnings = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function needNoText(name, text) { if (exists(name) && read(name).includes(text)) issues.push(`${name} still contains obsolete text: ${text}`); }
function warnFile(name) { if (!exists(name)) forumWarnings.push(`missing ${name}`); }
function warnText(name, text) { if (exists(name) && !read(name).includes(text)) forumWarnings.push(`${name} missing ${text}`); }
function warnNoText(name, text) { if (exists(name) && read(name).includes(text)) forumWarnings.push(`${name} should not show internal copy: ${text}`); }
function routeExists(route = '') {
  const clean = String(route).split('#')[0].split('?')[0].replace(/^\//, '');
  if (!clean || /^https?:\/\//i.test(clean)) return true;
  return exists(clean);
}

needFile('data/global-risk-clocks.json');
needFile('data/clock-wall.json');
needFile('data/reader-interpretation-standard.json');
needFile('downloads/timer-synthesis.md');
needFile('data/epstein-homepage-alerts.json');
needFile('timers.html');
needFile('scripts/build-mission-timers.js');
needFile('scripts/patch-homepage-alerts.js');
needText('timers.html', 'MISSION TIMERS.');
needText('timers.html', 'pressure indexes, not predictions');
needText('timers.html', 'What this means');
needText('timers.html', 'How it is calculated');
needText('timers.html', 'Control-system relevance');
needText('timers.html', 'What would raise it');
needText('timers.html', 'What would lower it');
needText('timers.html', 'Missing records');
needText('timers.html', 'Useful next actions');
needText('timers.html', 'one-world government');
needText('timers.html', 'data/clock-wall.json');
needText('timers.html', 'downloads/timer-synthesis.md');
needNoText('timers.html', 'Static page, not a live counter');
needNoText('timers.html', 'Speculative pressure score');
needText('scripts/patch-homepage-alerts.js', 'Number(clock.score) >= 90');
needText('scripts/patch-homepage-alerts.js', 'expiresAt');

warnFile('forum.html');
warnFile('dark-speculation-forum.html');
warnFile('epstein-alive-board.html');
warnFile('forum.js');
warnFile('data/forum-seed.json');
warnText('forum.html', 'data-board="main"');
warnText('dark-speculation-forum.html', 'data-board="speculation"');
warnText('epstein-alive-board.html', 'data-board="epstein-alive"');
warnText('forum.html', 'signal-board-feed');
warnText('forum.html', 'signal-board-form');
warnText('forum.html', 'forum.js');
warnText('forum.js', 'boardFromPath');
warnText('forum.js', 'lockFormToBoard');
warnText('forum.js', '/forum-feed-main');
warnText('forum.js', '/forum-feed-speculation');
warnText('forum.js', '/forum-feed-epstein-alive');
warnText('forum.js', '/submit-main-post');
warnText('forum.js', '/submit-speculation-post');
warnText('forum.js', '/submit-epstein-alive-post');
warnText('forum.js', 'LOCAL_POSTS_KEY');
warnText('forum.js', 'loadFallback');
warnText('forum.js', 'Signal Board is syncing');
warnText('forum.js', 'pending sync');
for (const phrase of ['backend unavailable', 'Backend detail', 'Cloudflare Static Forum Mode', 'saved on this device', 'Cloudflare test route']) warnNoText('forum.js', phrase);

const data = exists('data/global-risk-clocks.json') ? JSON.parse(read('data/global-risk-clocks.json')) : {};
const wall = exists('data/clock-wall.json') ? JSON.parse(read('data/clock-wall.json')) : {};
if (!Array.isArray(data.clocks) || data.clocks.length !== 12) issues.push('global risk clocks must contain 12 clocks');
if (!Array.isArray(wall.clocks) || wall.clocks.length !== 12) issues.push('clock wall must contain 12 clocks');
if (wall.scoreType !== 'pressureIndex') issues.push('clock wall must declare pressureIndex score type');
if (!wall.scoreDefinition || !/not the probability/i.test(wall.scoreDefinition)) issues.push('clock wall must explain that pressure index is not event probability');
if (!Number.isFinite(Number(wall.candidateSignalCount))) issues.push('clock wall must report candidate signal count');
if (!Number.isFinite(Number(wall.sourceFileCount))) issues.push('clock wall must report source file count');

for (const clock of wall.clocks || []) {
  if (!clock.title || typeof clock.score !== 'number' || !clock.nextRoute) issues.push('clock missing title, score or nextRoute');
  if (clock.nextRoute && !routeExists(clock.nextRoute)) issues.push(`${clock.title} route target missing: ${clock.nextRoute}`);
  if (clock.score >= 90 && clock.homepageEligible !== true) issues.push(`${clock.title} is 90+ but homepageEligible is not true`);
  for (const field of ['scoreBand', 'scoreMeaning', 'scoreDefinition', 'scoreMethod', 'calculationBasis', 'plainEnglishConclusion', 'controlSystemMeaning', 'lastMovement', 'boundary']) {
    if (!String(clock[field] || '').trim()) issues.push(`${clock.title} missing ${field}`);
  }
  for (const field of ['whatRaises', 'whatLowers', 'sourceRoutes', 'missingEvidence', 'usefulNextActions']) {
    if (!Array.isArray(clock[field]) || !clock[field].length) issues.push(`${clock.title} missing ${field}`);
  }
  if (!/not proof|does not by itself prove|not event probability/i.test(`${clock.controlSystemMeaning} ${clock.boundary}`)) issues.push(`${clock.title} lacks a clear claim boundary`);
  if (!/one-world government|one world government/i.test(`${clock.controlSystemMeaning} ${clock.boundary}`)) issues.push(`${clock.title} does not bound one-world-government interpretation`);
}

const epstein = exists('data/epstein-homepage-alerts.json') ? JSON.parse(read('data/epstein-homepage-alerts.json')) : {};
if (!Array.isArray(epstein.alerts)) issues.push('epstein homepage alerts must be an array');
const seed = exists('data/forum-seed.json') ? JSON.parse(read('data/forum-seed.json')) : {};
if (exists('data/forum-seed.json') && (!Array.isArray(seed.posts) || seed.posts.length < 1)) forumWarnings.push('forum seed needs at least one post');

if (forumWarnings.length) {
  console.warn('MISSION TIMERS / FORUM CLOUDFLARE WARNING');
  for (const warning of forumWarnings) console.warn(`- ${warning}`);
}

if (issues.length) {
  console.error('MISSION TIMERS TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`MISSION TIMERS TEST PASSED: ${wall.clocks.length} clocks, ${wall.candidateSignalCount} candidate signals, ${wall.sourceFileCount} source files.`);
