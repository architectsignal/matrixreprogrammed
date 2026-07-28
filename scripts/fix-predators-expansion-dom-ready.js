'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [path.join(root, 'predators-in-power.html'), path.join(root, '_site', 'predators-in-power.html')];
let patched = 0;
for (const file of targets) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before.replace(
    '<script id="pip-expansion-runtime">(()=>{const map=',
    '<script id="pip-expansion-runtime">document.addEventListener(\'DOMContentLoaded\',()=>{const map='
  );
  after = after.replace(
    'apply();})();</script><!-- predators-in-power-expansion:end -->',
    'apply();});</script><!-- predators-in-power-expansion:end -->'
  );
  if (after !== before) {
    fs.writeFileSync(file, after);
    patched++;
  }
  if (after.includes('<script id="pip-expansion-runtime">') && !after.includes("document.addEventListener('DOMContentLoaded'")) {
    throw new Error(`${path.relative(root, file)} Predators expansion runtime is not DOM-ready`);
  }
}
console.log(`Predators expansion DOM-ready runtime verified across ${targets.filter(file => fs.existsSync(file)).length} target(s); ${patched} patched.`);
