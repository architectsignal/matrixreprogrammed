'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const pairs = [
  ['hit-list.html', 'hit-list'],
  ['cinematic-hit-list.html', 'cinematic-hit-list']
];
const written = [];

for (const [htmlRoute, cleanRoute] of pairs) {
  const source = path.join(root, htmlRoute);
  if (!fs.existsSync(source)) throw new Error(`Missing generated route ${htmlRoute}`);
  const content = fs.readFileSync(source, 'utf8');
  if (!content.includes('data-hit-card') || !content.includes('Investigative priority—not guilt')) throw new Error(`${htmlRoute} is not a valid Hit List page`);
  fs.writeFileSync(path.join(root, cleanRoute), content);
  written.push(cleanRoute);
  if (fs.existsSync(outputRoot)) {
    for (const relative of [htmlRoute, cleanRoute]) {
      const destination = path.join(outputRoot, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
      written.push(`_site/${relative}`);
    }
  }
}

for (const relative of written) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target) || fs.statSync(target).size < 1000) throw new Error(`Exposure clean route missing or too small: ${relative}`);
}
console.log(`Exposure clean routes finalized: ${written.join(', ')}`);
