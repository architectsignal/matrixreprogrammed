const fs = require('fs');
const path = require('path');

const root = process.cwd();

try {
  const expansionScript = path.join(root, 'scripts', 'build-dark-speculation-expansion.js');
  const expansionData = path.join(root, 'data', 'dark-speculation-expansion.json');
  const speculationPage = path.join(root, 'dark-speculation-lab.html');
  if (fs.existsSync(expansionScript) && fs.existsSync(expansionData) && fs.existsSync(speculationPage)) {
    require(expansionScript);
  }
} catch (error) {
  console.warn(`Deep speculation dossier render skipped: ${error.message}`);
}

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
