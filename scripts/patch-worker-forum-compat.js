const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'worker.js');
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, 'utf8');
const before = s;

if (!s.includes('function inferBoardFromPost')) {
  const anchor = "function normalizeBoard(value = '') { const raw = cleanText(value, 80).toLowerCase().replace(/_/g, '-'); if (['speculation','dark-speculation','dark-speculation-board','dark-lab'].includes(raw)) return 'speculation'; if (['epstein-alive','epstein-sighting','epstein-sightings','sighting-watch','epstein-alive-board'].includes(raw)) return 'epstein-alive'; return 'main'; }";
  if (!s.includes(anchor)) {
    console.error('worker forum compat patch: normalizeBoard anchor missing');
    process.exit(1);
  }
  s = s.replace(anchor, anchor + "\nfunction inferBoardFromPost(post = {}) { return normalizeBoard(post.board || post.boardId || post.type || post.category || 'main'); }");
}

if (s !== before) fs.writeFileSync(file, s);
console.log('Worker forum compatibility patch complete.');
