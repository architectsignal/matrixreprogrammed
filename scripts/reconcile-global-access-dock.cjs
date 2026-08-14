'use strict';

const fs = require('fs');
const path = require('path');
const { auditGlobalAccessDock, injectGlobalAccessDock } = require('./global-access-dock-contract.cjs');

const root = process.cwd();
const site = path.join(root, '_site');
const assetNames = ['matrix-access-dock.css', 'matrix-access-dock.js'];

if (!fs.existsSync(site)) {
  console.error('Global access dock reconciliation failed: _site does not exist.');
  process.exit(1);
}

for (const asset of assetNames) {
  const source = path.join(root, asset);
  if (!fs.existsSync(source)) {
    console.error(`Global access dock reconciliation failed: ${asset} is missing.`);
    process.exit(1);
  }
  fs.copyFileSync(source, path.join(site, asset));
}

let documents = 0;
let changed = 0;
const failures = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (extension !== '.html' && extension !== '') continue;
    const before = fs.readFileSync(file, 'utf8');
    if (extension === '' && !/<(?:!doctype\s+html|html\b)/i.test(before.slice(0, 500))) continue;
    documents += 1;
    const after = injectGlobalAccessDock(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed += 1;
    }
    const audit = auditGlobalAccessDock(after);
    if (!audit.ok) failures.push({ file: path.relative(site, file), ...audit });
  }
}

walk(site);

if (documents < 3000 || failures.length > 0) {
  console.error(JSON.stringify({ ok: false, documents, changed, failures: failures.slice(0, 20) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  documents,
  changed,
  assets: assetNames,
  failures: 0
}, null, 2));
