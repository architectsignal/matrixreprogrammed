'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const runtimeSource = path.join(root, 'public-consequence-contracts.js');
if (!fs.existsSync(runtimeSource)) throw new Error('public-consequence-contracts.js is required');

for (const base of roots) {
  const page = path.join(base, 'public-consequence-contracts.html');
  if (!fs.existsSync(page)) throw new Error(`${path.relative(root, page)} is required`);
  let html = fs.readFileSync(page, 'utf8');
  html = html.replace('<script src="accountability-home.js"></script>', '<script src="public-consequence-contracts.js"></script>');
  if (!html.includes('public-consequence-contracts.js')) html = html.replace('</body>', '<script src="public-consequence-contracts.js"></script></body>');
  fs.writeFileSync(page, html);
  if (base !== root) fs.copyFileSync(runtimeSource, path.join(base, 'public-consequence-contracts.js'));
}

console.log('Public Consequence Contract follow runtime finalized for source and Cloudflare output.');
