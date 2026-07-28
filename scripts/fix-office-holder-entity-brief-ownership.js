'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const builderPath = path.join(root, 'scripts', 'build-current-office-holder-intelligence.js');
const testPath = path.join(root, 'scripts', 'generated-machine-pages-test.js');
for (const file of [builderPath, testPath]) if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(root, file)}`);

function syntaxCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${path.relative(root, file)} failed syntax validation`);
}

function patchBuilder() {
  const before = fs.readFileSync(builderPath, 'utf8');
  const skipLine = "  if (matchedNames.has(normalize(person.name))) continue;\n";
  let after = before;
  if (after.includes(skipLine)) after = after.replace(skipLine, '');
  if (!after.includes('const matchedNames = new Set(dossierMatches.map(item => normalize(item.name)));')) {
    throw new Error('Office-holder matched-name inventory anchor missing');
  }
  if (!after.includes('const relative = `entity-briefs/${slug(person.name)}.html`;')) {
    throw new Error('Office-holder entity-brief route anchor missing');
  }
  if (after !== before) fs.writeFileSync(builderPath, after);
  try {
    syntaxCheck(builderPath);
  } catch (error) {
    if (after !== before) fs.writeFileSync(builderPath, before);
    throw error;
  }
  return after !== before;
}

function patchOwnershipTest() {
  const before = fs.readFileSync(testPath, 'utf8');
  const oldSlug = `function slug(value = '') {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\\s+/g, '-').replace(/^-+|-+$/g, '') || 'unknown-office-holder';
}`;
  const newSlug = `function slug(value = '') {
  const normalized = String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized ? normalized.replace(/\\s+/g, '-').replace(/^-+|-+$/g, '') : '';
}`;
  let after = before;
  if (after.includes(oldSlug)) after = after.replace(oldSlug, newSlug);
  if (!after.includes("return normalized ? normalized.replace(/\\s+/g, '-').replace(/^-+|-+$/g, '') : '';")) {
    throw new Error('Office-holder empty-name slug guard missing');
  }
  if (after !== before) fs.writeFileSync(testPath, after);
  try {
    syntaxCheck(testPath);
  } catch (error) {
    if (after !== before) fs.writeFileSync(testPath, before);
    throw error;
  }
  return after !== before;
}

const builderChanged = patchBuilder();
const testChanged = patchOwnershipTest();
console.log(`Office-holder canonical entity-brief ownership ${builderChanged || testChanged ? 'installed' : 'already current'}; builder and ownership test syntax valid.`);
