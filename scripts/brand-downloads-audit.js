const fs = require('fs');
const path = require('path');
const root = process.cwd();
const downloadsDir = path.join(root, 'downloads');
const issues = [];
function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function needFile(name){ if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text){ if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function sizeOf(name){ try { return fs.statSync(path.join(root, name)).size; } catch { return 0; } }
needFile('download-center.html');
needFile('optin-center.html');
needFile('newsletter.html');
needFile('downloads/the-black-file-matrix-reprogrammed.pdf');
needFile('downloads/intel-drop-vault.json');
needFile('downloads/intel-drop-vault.md');
needText('download-center.html', 'MATRIX REPROGRAMMED');
needText('download-center.html', 'Black File');
needText('download-center.html', 'Evidence');
needText('optin-center.html', 'PDF Mini Book');
needText('newsletter.html', 'Weekly Signal');
needText('newsletter.html', 'data-newsletter-form');
if (exists('downloads/the-black-file-matrix-reprogrammed.pdf') && sizeOf('downloads/the-black-file-matrix-reprogrammed.pdf') < 10000) issues.push('the-black-file PDF is too small to be a useful branded download');
if (fs.existsSync(downloadsDir)) {
  const files = fs.readdirSync(downloadsDir).filter(file => /\.(pdf|json|md)$/i.test(file));
  const pdfs = files.filter(file => file.endsWith('.pdf'));
  if (pdfs.length < 3) issues.push('downloads should include at least three branded PDF assets');
  const leadMagnets = files.filter(file => file.includes('lead-magnet'));
  if (leadMagnets.length < 3) issues.push('lead magnet downloads are missing or too thin');
  const index = { generatedAt: new Date().toISOString(), brand: 'Matrix Reprogrammed', boundary: 'Downloads must be useful, branded, source-aware, and route readers toward evidence and books.', files: files.map(file => ({ file: `downloads/${file}`, bytes: sizeOf(`downloads/${file}`), type: path.extname(file).slice(1), brandedExpectation: 'Matrix Reprogrammed + evidence boundary + reader route' })) };
  fs.writeFileSync(path.join(downloadsDir, 'downloads-index.json'), JSON.stringify(index, null, 2));
  fs.writeFileSync(path.join(downloadsDir, 'downloads-index.md'), ['# Matrix Reprogrammed Download Index', '', `Generated: ${index.generatedAt}`, '', index.boundary, '', ...index.files.map(item => `- ${item.file} — ${item.bytes} bytes — ${item.type}`)].join('\n'));
}
if (issues.length) {
  console.error('BRANDED DOWNLOADS AUDIT FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('BRANDED DOWNLOADS AUDIT PASSED');
