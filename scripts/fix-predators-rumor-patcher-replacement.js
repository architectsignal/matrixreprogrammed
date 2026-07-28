'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const target = path.join(root, 'scripts', 'patch-predators-rumor-ledger.js');
if (!fs.existsSync(target)) throw new Error('Missing scripts/patch-predators-rumor-ledger.js');

const before = fs.readFileSync(target, 'utf8');
const unsafe = 'source = source.replace(pattern, replacement);';
const safe = 'source = source.replace(pattern, () => replacement);';
let after = before;

if (after.includes(unsafe)) after = after.replace(unsafe, safe);
if (!after.includes(safe)) throw new Error('Rumour-ledger replacement callback contract missing');

if (after !== before) fs.writeFileSync(target, after);
const check = spawnSync(process.execPath, ['--check', target], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 10 * 1024 * 1024
});
if (check.stdout) process.stdout.write(check.stdout);
if (check.stderr) process.stderr.write(check.stderr);
if (check.status !== 0) {
  if (after !== before) fs.writeFileSync(target, before);
  throw new Error('Hardened rumour-ledger patcher failed syntax validation');
}

console.log(`Rumour-ledger replacement callback ${after === before ? 'already safe' : 'installed'}; patcher syntax valid.`);
