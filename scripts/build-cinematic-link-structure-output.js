const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, '_site');
if (!fs.existsSync(outputRoot)) {
  console.log('Cloudflare output is not present; cinematic output link pass skipped.');
  process.exit(0);
}
const stylesheet = path.join(projectRoot, 'cinematic-pathways.css');
if (!fs.existsSync(stylesheet)) throw new Error(`Missing cinematic pathway stylesheet: ${stylesheet}`);
fs.copyFileSync(stylesheet, path.join(outputRoot, 'cinematic-pathways.css'));
process.chdir(outputRoot);
require(path.join(projectRoot, 'scripts', 'run-cinematic-link-structure.js'));

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', '_site'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (entry.isFile() && entry.name.endsWith('.html')) output.push(full);
  }
  return output;
}
let aliasesUpdated = 0;
for (const htmlFile of walk(outputRoot)) {
  const alias = htmlFile.slice(0, -'.html'.length);
  if (fs.existsSync(alias) && fs.statSync(alias).isFile()) {
    fs.copyFileSync(htmlFile, alias);
    aliasesUpdated += 1;
  }
}
const mapHtml = path.join(outputRoot, 'investigation-pathways.html');
if (fs.existsSync(mapHtml)) {
  fs.copyFileSync(mapHtml, path.join(outputRoot, 'investigation-pathways'));
  aliasesUpdated += 1;
}
console.log(`Cinematic Cloudflare aliases synchronized: ${aliasesUpdated}.`);
