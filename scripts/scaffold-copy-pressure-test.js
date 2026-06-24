const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
const ignoredDirs = new Set(['.git', 'node_modules']);
const publicExceptions = new Set(['funnel-map.html']);
const banned = [
  /Use this page as a sales door/i,
  /sales door/i,
  /book sells the deep dive/i,
  /Database-driven archive/i,
  /Source:\s*data\//i,
  /Live generated pages/i,
  /generated pages/i,
  /Archive route/i,
  /Black File funnel/i,
  /Search index:\s*active/i,
  /Reader paths:\s*active/i,
  /Risk timers:\s*active/i,
  /THE Hegelian CRISIS DIALECTIC/,
  /following the The /,
  /pending functionality/i,
  /awaiting API/i,
  /setup guide/i,
  /author-facing/i,
  /ChatGPT/i,
  /TODO/i,
  /FIXME/i
];
function isInternalPage(rel, html) {
  return publicExceptions.has(rel) || /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) {
      const rel = path.relative(root, full).replace(/\\/g, '/');
      const html = fs.readFileSync(full, 'utf8');
      if (isInternalPage(rel, html)) continue;
      for (const pattern of banned) {
        if (pattern.test(html)) problems.push(`${rel}: scaffold copy matched ${pattern}`);
      }
    }
  }
}
walk(root);
const cleanup = fs.existsSync(path.join(root, 'scripts', 'cleanup-duplicates.js')) ? fs.readFileSync(path.join(root, 'scripts', 'cleanup-duplicates.js'), 'utf8') : '';
for (const expected of ['Database-driven archive', 'Source: data/books.json', 'Live generated pages', 'Black File funnel: active', 'Use this page as a sales door', 'THE Hegelian CRISIS DIALECTIC', 'following the The ']) {
  if (!cleanup.includes(expected)) problems.push(`cleanup-duplicates.js missing scrub rule for ${expected}`);
}
if (problems.length) {
  console.error('\nSCAFFOLD COPY PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('SCAFFOLD COPY PRESSURE TEST PASSED');
console.log('Checked public HTML for author-facing scaffold, generated-page language, raw data-source labels, sales-door copy, generated grammar errors, and broken title casing.');
