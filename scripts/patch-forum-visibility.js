const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'worker.js');
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, 'utf8');
const before = s;

const marker = "function filterPostsByBoard(posts = [], board = 'main') { const normalized = normalizeBoard(board); return posts.filter(post => normalizeBoard(post.board) === normalized); }";
const add = marker + "\nfunction visibleForumPosts(posts = []) { return posts.filter(post => post && String(post.status || 'live').toLowerCase() === 'live' && !post.internal && !post.system && !post.qaOnly); }";
if (!s.includes('function visibleForumPosts(posts = [])')) s = s.replace(marker, add);

const oldBlock = "async function getPosts(env, board = 'all') {\n  const posts = await getForumIndex(env);\n  return board === 'all' ? posts : filterPostsByBoard(posts, board);\n}";
const newBlock = "async function getPosts(env, board = 'all') {\n  const posts = visibleForumPosts(await getForumIndex(env));\n  return board === 'all' ? posts : filterPostsByBoard(posts, board);\n}";
if (s.includes(oldBlock)) s = s.replace(oldBlock, newBlock);

if (s !== before) fs.writeFileSync(file, s);
console.log('Forum visibility patch complete.');
