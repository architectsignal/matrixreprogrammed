const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'member-login.html');
if (!fs.existsSync(file)) throw new Error('member-login.html is missing');

let html = fs.readFileSync(file, 'utf8');
const before = html;
const canonicalGuard = `  const MEMBER_CANONICAL_ORIGIN = 'https://matrixreprogrammed.com';
  if (location.hostname === 'www.matrixreprogrammed.com') {
    location.replace(MEMBER_CANONICAL_ORIGIN + location.pathname + location.search + location.hash);
    return;
  }
`;
if (!html.includes('MEMBER_CANONICAL_ORIGIN')) {
  const anchor = `(() => {
  const form = document.getElementById('login-form');`;
  if (!html.includes(anchor)) throw new Error('member login script anchor is missing');
  html = html.replace(anchor, `(() => {
${canonicalGuard}  const form = document.getElementById('login-form');`);
}
html = html.replace("fetch('https://matrixreprogrammed.com/api/auth/request-link', {", "fetch('/api/auth/request-link', {");
html = html.replace("method:'POST', headers:{'content-type':'application/json'},", "method:'POST', credentials:'include', cache:'no-store', headers:{'content-type':'application/json','cache-control':'no-cache'},");
if (!html.includes('forum-login-canonical-api')) {
  html = html.replace('</head>', '<!-- forum-login-canonical-api: https://matrixreprogrammed.com/api/auth/request-link; browser request remains same-origin after canonical redirect -->\n</head>');
}

if (!html.includes("location.hostname === 'www.matrixreprogrammed.com'")) throw new Error('canonical member-login redirect is missing');
if (!html.includes("fetch('/api/auth/request-link', {")) throw new Error('member login request is not same-origin');
if (!html.includes("credentials:'include'")) throw new Error('member login request does not include credentials');
if (!html.includes('forum-login-canonical-api')) throw new Error('canonical member-login contract marker is missing');

if (html !== before) fs.writeFileSync(file, html);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'forum-login-canonical-repair.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: html !== before,
  canonicalOrigin: 'https://matrixreprogrammed.com',
  requestMode: 'same-origin with credentials include',
  boundary: 'The www login page moves to the canonical origin before requesting a magic link, preventing split sessions and CORS failures.'
}, null, 2));
console.log(`Forum login canonical repair ${html !== before ? 'applied' : 'already current'}.`);
