const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changed = [];

function update(relative, transform) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing owner file: ${relative}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) return;
  fs.writeFileSync(file, after);
  changed.push(relative);
}

update('scripts/repair-forum-member-posting.js', source => {
  if (source.includes("require('./repair-forum-page-consistency.js');")) return source;
  const anchor = "fs.mkdirSync(at('downloads'), { recursive: true });";
  if (!source.includes(anchor)) throw new Error('Forum repair report anchor missing');
  return source.replace(anchor, "require('./repair-forum-page-consistency.js');\n\n" + anchor);
});

update('scripts/final-production-reconcile.js', source => {
  let output = source;
  if (!output.includes("run('scripts/repair-forum-page-consistency.js');")) {
    const anchor = "run('scripts/repair-forum-member-posting.js');";
    if (!output.includes(anchor)) throw new Error('Final reconcile forum owner anchor missing');
    output = output.replace(anchor, `${anchor}\nrun('scripts/repair-forum-page-consistency.js');`);
  }
  if (!output.includes("rejectMarker('dark-speculation-forum.html', 'paypal.me/njmgroup/1');")) {
    const anchor = "requireMarker('epstein-alive-board.html', 'forum.js?v=20260720-forum-member-posting-v3');";
    if (!output.includes(anchor)) throw new Error('Final reconcile board marker anchor missing');
    output = output.replace(anchor, `${anchor}\nrequireMarker('dark-speculation-forum.html', 'Verified Member Posting');\nrequireMarker('dark-speculation-forum.html', 'id=\"forum-member-status\"');\nrejectMarker('dark-speculation-forum.html', 'paypal.me/njmgroup/1');\nrejectMarker('dark-speculation-forum.html', 'unlock-signal-pass');`);
  }
  return output;
});

update('scripts/forum-member-posting-test.js', source => {
  if (source.includes('obsolete paid Signal Pass remains on speculation board')) return source;
  const anchor = "for (const relative of ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html']) {";
  if (!source.includes(anchor)) throw new Error('Forum posting test page loop anchor missing');
  const insertion = `const speculation = read('dark-speculation-forum.html');\ncheck('obsolete paid Signal Pass remains on speculation board', !speculation.includes('paypal.me/njmgroup/1') && !speculation.includes('unlock-signal-pass'));\ncheck('speculation board does not expose verified member status', speculation.includes('id=\"forum-member-status\"') && speculation.includes('Verified Member Posting'));\n\n`;
  return source.replace(anchor, insertion + anchor);
});

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'forum-page-consistency-owner.json'), `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  ownerChain: [
    'scripts/repair-forum-member-posting.js',
    'scripts/repair-forum-page-consistency.js',
    'scripts/final-production-reconcile.js',
    'scripts/forum-member-posting-test.js'
  ],
  boundary: 'Every full build and controlled production release removes obsolete paid posting controls and preserves verified-member D1 posting across all boards.'
}, null, 2)}\n`);
console.log(`Forum page consistency owner installed: ${changed.length ? changed.join(', ') : 'already current'}.`);
