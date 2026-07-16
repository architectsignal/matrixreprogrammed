'use strict';

const practical = require('./public-usefulness-clocks.js');
const speculative = require('./speculation-clocks.js');
const clocks = [...practical, ...speculative];
const seen = new Set();
const duplicates = [];
for (const clock of clocks) {
  const slug = String(clock && clock.slug || '').trim();
  if (!slug || seen.has(slug)) duplicates.push(slug || '(missing slug)');
  seen.add(slug);
}
if (duplicates.length) {
  throw new Error(`Duplicate reader clock slug(s): ${[...new Set(duplicates)].join(', ')}`);
}

module.exports = clocks;
