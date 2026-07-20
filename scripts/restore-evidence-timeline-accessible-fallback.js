const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [
  path.join(root, 'evidence-timeline.js'),
  path.join(root, '_site', 'evidence-timeline.js')
];

const replacements = [
  ['The searchable event list remains fully usable.', 'The accessible event list remains fully usable.'],
  ['The searchable event list is ready now.', 'The accessible event list is ready now.'],
  ['The searchable event list remains fully usable.', 'The accessible event list remains fully usable.']
];

let changed = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let source = fs.readFileSync(file, 'utf8');
  const before = source;
  for (const [from, to] of replacements) source = source.split(from).join(to);
  if (!source.includes('The accessible event list remains fully usable.')) {
    source = source.replace(
      "elements.stage.innerHTML = '<p>The interactive timeline is unavailable.",
      "elements.stage.innerHTML = '<p>The interactive timeline is unavailable. The accessible event list remains fully usable.</p>'; // accessibility fallback\n      return;\n    }\n\n    /*"
    );
  }
  if (source !== before) {
    fs.writeFileSync(file, source);
    changed += 1;
  }
}

console.log(`Evidence timeline accessible fallback restored in ${changed} file(s).`);
