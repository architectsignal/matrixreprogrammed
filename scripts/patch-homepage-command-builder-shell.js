const fs = require('fs');
const path = require('path');

const root = process.cwd();
const builderPath = path.join(root, 'scripts', 'build-homepage-command-surface.js');
const reportPath = path.join(root, 'downloads', 'homepage-command-builder-shell-patch.json');

if (!fs.existsSync(builderPath)) throw new Error('scripts/build-homepage-command-surface.js is missing');

const before = fs.readFileSync(builderPath, 'utf8');
const oldLine = "const mainMatch=homepage.match(/<main[^>]*>/i);if(!mainMatch)throw new Error('Homepage main element not found');homepage=homepage.replace(mainMatch[0],`${mainMatch[0]}${section}`);fs.writeFileSync(indexPath,homepage);";
const replacement = `function ensureHomepageMainShell(html){
  let next=String(html||'');
  if(/<main\\b[^>]*>/i.test(next))return next;
  const header=next.match(/<\\/header>/i);
  if(!header)throw new Error('Homepage shell recovery failed: closing header tag is missing');
  const openAt=Number(header.index||0)+header[0].length;
  const tail=next.slice(openAt);
  const footerOffset=tail.search(/<footer\\b/i);
  const bodyOffset=tail.search(/<\\/body>/i);
  const closeOffset=footerOffset>=0?footerOffset:bodyOffset;
  if(closeOffset<0)throw new Error('Homepage shell recovery failed: footer or closing body tag is missing');
  const closeAt=openAt+closeOffset;
  return \`${'${next.slice(0,openAt)}'}<main id="main-archive">${'${next.slice(openAt,closeAt)}'}</main>${'${next.slice(closeAt)}'}\`;
}
homepage=ensureHomepageMainShell(homepage);
const mainMatch=homepage.match(/<main[^>]*>/i);if(!mainMatch)throw new Error('Homepage main element unavailable after shell recovery');homepage=homepage.replace(mainMatch[0],\`${'${mainMatch[0]}'}${'${section}'}\`);fs.writeFileSync(indexPath,homepage);`;

let after = before;
let changed = false;
if (!after.includes('function ensureHomepageMainShell')) {
  if (!after.includes(oldLine)) throw new Error('Homepage command builder shell patch target not found');
  after = after.replace(oldLine, replacement);
  changed = true;
}

for (const marker of [
  'function ensureHomepageMainShell',
  'Homepage shell recovery failed: closing header tag is missing',
  'Homepage main element unavailable after shell recovery'
]) {
  if (!after.includes(marker)) throw new Error(`Homepage command builder shell patch missing marker: ${marker}`);
}

if (changed) fs.writeFileSync(builderPath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  builder: 'scripts/build-homepage-command-surface.js',
  boundary: 'Every direct homepage command-surface build repairs a missing main shell before inserting the current mission surface.'
}, null, 2)}\n`);

require('./patch-paypal-voluntary-support.js');
require('./patch-voluntary-support-store.js');
require('./patch-brevo-transactional-readiness.js');
console.log(`Homepage command builder shell recovery ${changed ? 'installed' : 'already present'}; €1–€5,000 voluntary support, free-evidence store cards, and Brevo transactional readiness applied.`);
