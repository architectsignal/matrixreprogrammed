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
require(path.join(projectRoot, 'scripts', 'build-cinematic-link-structure.js'));
