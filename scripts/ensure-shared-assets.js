const fs = require('fs');
const path = require('path');

const root = process.cwd();

function runOptional(label, script, requiredFiles = []) {
  try {
    const scriptPath = path.join(root, 'scripts', script);
    if (!fs.existsSync(scriptPath)) return;
    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(root, file))) return;
    }
    require(scriptPath);
  } catch (error) {
    console.warn(`${label} skipped: ${error.message}`);
  }
}

runOptional('Matrix Brain render', 'build-matrix-brain.js', ['data/site-intelligence-core.json']);
runOptional('Latest public drops render', 'build-latest-public-drops.js', ['data/latest-public-drops.json']);
runOptional('Intel Vault render', 'build-intel-vault.js', ['data/intel-vault.json']);
runOptional('Deep speculation dossier render', 'build-dark-speculation-expansion.js', ['data/dark-speculation-expansion.json', 'dark-speculation-lab.html']);

const files = fs.readdirSync(root).filter(file => file.endsWith('.html'));

function ensureStyles(html) {
  if (html.includes('rel="stylesheet" href="styles.css"')) return html;
  const tag = '  <link rel="stylesheet" href="styles.css" />';
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tag}\n</head>`);
  return `${tag}\n${html}`;
}

function ensureMatrix(html) {
  if (html.includes('<script src="matrix.js"></script>')) return html;
  const tag = '  <script src="matrix.js"></script>';
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}\n</body>`);
  return `${html}\n${tag}\n`;
}

let touched = 0;
for (const file of files) {
  if (file === 'index_v2.html') continue;
  const full = path.join(root, file);
  const before = fs.readFileSync(full, 'utf8');
  let after = ensureStyles(before);
  after = ensureMatrix(after);
  if (after !== before) {
    fs.writeFileSync(full, after);
    touched++;
  }
}

console.log(`Shared asset normalizer complete: ${touched} HTML file(s) patched.`);
