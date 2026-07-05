const path = require('path');
const fs = require('fs');
const root = process.cwd();
function run(script){
  const p = path.join(root,'scripts',script);
  if (!fs.existsSync(p)) return;
  require(p);
}
run('build-control-brain-v2.js');
console.log('Advanced site brain runner complete.');
