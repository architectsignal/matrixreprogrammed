const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }

needFile('forum.html');
needFile('forum.js');
needFile('data/forum-seed.json');
needText('forum.html', 'The Signal Board');
needText('forum.html', 'signal-board-feed');
needText('forum.html', 'signal-board-form');
needText('forum.html', 'forum.js');
needText('forum.js', 'data/forum-seed.json');
needText('forum.js', 'Cloudflare static mode');
needText('forum.js', 'LOCAL_POSTS_KEY');
needText('forum.js', 'loadStaticFeed');
needText('forum.js', '/.netlify/functions/forum-feed');
needText('forum.js', '/.netlify/functions/submit-forum-post');
needText('forum.js', 'signal saved on this device');
const seed = exists('data/forum-seed.json') ? JSON.parse(read('data/forum-seed.json')) : {};
if (!Array.isArray(seed.posts) || seed.posts.length < 1) issues.push('forum seed needs at least one post');
if (issues.length) {
  console.error('FORUM CLOUDFLARE TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('FORUM CLOUDFLARE TEST PASSED');
