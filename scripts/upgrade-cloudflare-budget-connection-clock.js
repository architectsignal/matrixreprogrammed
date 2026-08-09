#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function upgradeSource(source) {
  const oldLine = "  const observedAt = Date.parse(`${observedOn}T00:00:00.000Z`);";
  const newLine = "  const observedAt = Date.parse(String(state.observedAt || `${observedOn}T00:00:00.000Z`));";
  if (source.includes(newLine)) return { changed: false, source };
  const occurrences = source.split(oldLine).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one legacy connection-proof clock anchor, found ${occurrences}.`);
  }
  return { changed: true, source: source.replace(oldLine, newLine) };
}

function upgradeFile(file = 'scripts/cloudflare-usage-budget-guard.js') {
  const resolved = path.resolve(file);
  const before = fs.readFileSync(resolved, 'utf8');
  const result = upgradeSource(before);
  if (result.changed) fs.writeFileSync(resolved, result.source);
  return result.changed;
}

if (require.main === module) {
  const changed = upgradeFile(process.argv[2]);
  console.log(`Cloudflare budget connection-proof clock ${changed ? 'upgraded to prefer precise live observedAt evidence' : 'already current'}.`);
}

module.exports = { upgradeSource, upgradeFile };
