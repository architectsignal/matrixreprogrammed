'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const target = path.join(root, 'scripts', 'repair-release-audit-hard-issues.js');
if (!fs.existsSync(target)) throw new Error('Missing repair-release-audit-hard-issues.js');

function checkSyntax() {
  const result = spawnSync(process.execPath, ['--check', target], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error('Collision-safe release-audit patch failed syntax validation');
}

const before = fs.readFileSync(target, 'utf8');
const oldBlock = `function dedupeIds(html) {
  const seen = new Map();
  return outsideScripts(html, segment => segment.replace(/\\bid\\s*=\\s*(["'])([^"']+)\\1/gi, (match, quote, id) => {
    const count = (seen.get(id) || 0) + 1;
    seen.set(id, count);
    return count === 1 ? match : \`id=\${quote}\${id}--dedup-\${count}\${quote}\`;
  }));
}`;

const newBlock = `function dedupeIds(html) {
  const allIds = [];
  outsideScripts(html, segment => {
    for (const match of segment.matchAll(/\\bid\\s*=\\s*(["'])([^"']+)\\1/gi)) allIds.push(match[2]);
    return segment;
  });
  const reserved = new Set(allIds);
  const seen = new Map();
  const emitted = new Set();
  return outsideScripts(html, segment => segment.replace(/\\bid\\s*=\\s*(["'])([^"']+)\\1/gi, (match, quote, id) => {
    const occurrence = (seen.get(id) || 0) + 1;
    seen.set(id, occurrence);
    if (occurrence === 1 && !emitted.has(id)) {
      emitted.add(id);
      return match;
    }
    let serial = 2;
    let candidate = '';
    do {
      candidate = \`\${id}--dedup-\${serial}\`;
      serial++;
    } while (reserved.has(candidate) || emitted.has(candidate));
    reserved.add(candidate);
    emitted.add(candidate);
    return \`id=\${quote}\${candidate}\${quote}\`;
  }));
}`;

if (before.includes('const reserved = new Set(allIds);')) {
  checkSyntax();
  console.log('Release-audit duplicate-ID allocator already collision-safe.');
  process.exit(0);
}
if (!before.includes(oldBlock)) throw new Error('Legacy dedupeIds anchor not found');
const after = before.replace(oldBlock, () => newBlock);
fs.writeFileSync(target, after);
try {
  checkSyntax();
} catch (error) {
  fs.writeFileSync(target, before);
  throw error;
}
console.log('Release-audit duplicate-ID allocator patched with two-pass global collision protection.');
