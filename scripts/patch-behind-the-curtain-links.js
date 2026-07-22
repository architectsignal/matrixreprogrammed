const fs = require('fs');
const path = require('path');

const root = process.cwd();
const start = '<!-- behind-the-curtain-entry:start -->';
const end = '<!-- behind-the-curtain-entry:end -->';
const pattern = /<!-- behind-the-curtain-entry:start -->[\s\S]*?<!-- behind-the-curtain-entry:end -->/g;
const block = `${start}<section id="behind-the-curtain-entry" class="section wrap"><div class="eyebrow">Master Structural Power Analysis</div><h2>BEHIND THE CURTAIN.</h2><p class="lead">Follow ownership, appointments, capital, infrastructure, law, information and institutional continuity beyond the public faces.</p><div class="cta-row"><a class="btn" href="behind-the-curtain.html">Open Structural Power Intelligence</a><a class="btn alt" href="control-structure.html">Control Structure</a><a class="btn alt" href="follow-the-money.html">Follow the Money</a></div><p><strong>Evidence boundary:</strong> the ranking is provisional, source-led and red-teamed. Association is not control, benefit is not causation, and speculation remains visibly separate.</p></section>${end}`;

function patchFile(relative, strategy) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return false;
  const before = fs.readFileSync(file, 'utf8');
  let next = before.replace(pattern, '');
  if (strategy === 'after-header' && /<\/header>/i.test(next)) next = next.replace(/<\/header>/i, `</header>${block}`);
  else if (/<\/main>/i.test(next)) next = next.replace(/<\/main>/i, `${block}</main>`);
  else if (/<\/body>/i.test(next)) next = next.replace(/<\/body>/i, `${block}</body>`);
  else next += block;
  const count = (next.match(/id=["']behind-the-curtain-entry["']/g) || []).length;
  if (count !== 1) throw new Error(`${relative} must contain exactly one Behind the Curtain entry`);
  if (next !== before) fs.writeFileSync(file, next);
  return next !== before;
}

const changed = [
  ['index.html', 'after-header'],
  ['control-structure.html', 'before-main-end'],
  ['power-atlas.html', 'before-main-end'],
  ['follow-the-money.html', 'before-main-end']
].filter(([file, strategy]) => patchFile(file, strategy)).map(([file]) => file);

console.log(`Behind the Curtain route links ${changed.length ? `updated: ${changed.join(', ')}` : 'already current or unavailable'}.`);
