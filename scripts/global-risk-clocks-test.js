const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function routeExists(route = '') {
  const clean = String(route).split('#')[0].split('?')[0];
  if (!clean || /^https?:\/\//i.test(clean)) return true;
  return exists(clean);
}

needFile('data/global-risk-clocks.json');
needFile('data/epstein-homepage-alerts.json');
needFile('timers.html');
needFile('scripts/patch-homepage-alerts.js');
needText('timers.html', 'GLOBAL RISK CLOCKS.');
needText('timers.html', 'RISK SIGNAL LANE');
needText('timers.html', 'Static page, not a live counter');
needText('timers.html', 'WWIII Escalation Clock');
needText('timers.html', 'AI Breakout Clock');
needText('timers.html', 'Surveillance State Clock');
needText('timers.html', 'Machine Convergence');
needText('timers.html', 'data/global-risk-clocks.json');
needText('timers.html', 'live-intel.html');
needText('timers.html', 'epstein-files.html');
needText('timers.html', 'evidence-vault.html');
needText('scripts/patch-homepage-alerts.js', 'Number(clock.score) >= 90');
needText('scripts/patch-homepage-alerts.js', 'expiresAt');

needFile('forum.html');
needFile('forum.js');
needFile('functions/forum-feed.js');
needFile('functions/submit-forum-post.js');
needFile('functions/report-forum-post.js');
needFile('data/forum-seed.json');
needText('forum.html', 'The Signal Board');
needText('forum.html', 'signal-board-feed');
needText('forum.html', 'signal-board-form');
needText('forum.html', 'forum.js');
needText('forum.js', 'data/forum-seed.json');
needText('forum.js', "FEED_ROUTE = '/forum-feed'");
needText('forum.js', "SUBMIT_ROUTE = '/submit-forum-post'");
needText('forum.js', "REPORT_ROUTE = '/report-forum-post'");
needText('forum.js', 'LOCAL_POSTS_KEY');
needText('forum.js', 'loadFallback');
needText('forum.js', 'Forum backend unavailable');
needText('functions/forum-feed.js', 'FORUM_POSTS');
needText('functions/submit-forum-post.js', 'FORUM_POSTS');
needText('functions/report-forum-post.js', 'FORUM_POSTS');
needText('functions/forum-feed.js', 'Access-Control-Allow-Origin');
needText('functions/submit-forum-post.js', "FORUM_POSTS.put('posts'");
needText('functions/report-forum-post.js', "FORUM_POSTS.put('reports'");

const data = exists('data/global-risk-clocks.json') ? JSON.parse(read('data/global-risk-clocks.json')) : {};
if (!Array.isArray(data.clocks) || data.clocks.length !== 12) issues.push('global risk clocks must contain 12 clocks');
for (const clock of data.clocks || []) {
  if (!clock.title || typeof clock.score !== 'number' || !clock.nextRoute) issues.push('clock missing title score or nextRoute');
  if (clock.nextRoute && !routeExists(clock.nextRoute)) issues.push(`${clock.title} route target missing: ${clock.nextRoute}`);
  if (clock.score >= 90 && clock.homepageEligible !== true) issues.push(`${clock.title} is 90+ but homepageEligible is not true`);
}
const epstein = exists('data/epstein-homepage-alerts.json') ? JSON.parse(read('data/epstein-homepage-alerts.json')) : {};
if (!Array.isArray(epstein.alerts)) issues.push('epstein homepage alerts must be an array');
const seed = exists('data/forum-seed.json') ? JSON.parse(read('data/forum-seed.json')) : {};
if (!Array.isArray(seed.posts) || seed.posts.length < 1) issues.push('forum seed needs at least one post');
if (issues.length) {
  console.error('GLOBAL RISK CLOCKS / FORUM CLOUDFLARE TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('GLOBAL RISK CLOCKS / FORUM CLOUDFLARE TEST PASSED');
