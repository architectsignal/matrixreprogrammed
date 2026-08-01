const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, '_site');
if (!fs.existsSync(outputRoot)) {
  console.log('Cloudflare output is not present; maintenance marker output pass skipped.');
  process.exit(0);
}
process.chdir(outputRoot);
require(path.join(projectRoot, 'scripts', 'remove-visible-maintenance-markers.js'));
