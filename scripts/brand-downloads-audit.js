const fs = require('fs');
const path = require('path');

const root = process.cwd();
const downloadsDir = path.join(root, 'downloads');
const hardIssues = [];
const softIssues = [];
const warnings = [];

function exists(name){ return fs.existsSync(path.join(root, name)); }
function read(name){ return fs.readFileSync(path.join(root, name), 'utf8'); }
function sizeOf(name){ try { return fs.statSync(path.join(root, name)).size; } catch { return 0; } }
function needHardFile(name){ if (!exists(name)) hardIssues.push(`missing critical ${name}`); }
function needSoftFile(name){ if (!exists(name)) softIssues.push(`missing optional ${name}`); }
function needText(name, text, level = 'soft'){
  if (!exists(name)) return;
  const html = read(name);
  if (!html.includes(text)) {
    const message = `${name} missing ${text}`;
    if (level === 'hard') hardIssues.push(message);
    else softIssues.push(message);
  }
}
function needAnyText(name, labels, level = 'soft'){
  if (!exists(name)) return;
  const html = read(name);
  if (!labels.some(text => html.includes(text))) {
    const message = `${name} missing one of: ${labels.join(' | ')}`;
    if (level === 'hard') hardIssues.push(message);
    else softIssues.push(message);
  }
}
function writeIndex(files){
  if (!fs.existsSync(downloadsDir)) return;
  const index = {
    generatedAt: new Date().toISOString(),
    brand: 'Matrix Reprogrammed',
    ok: hardIssues.length === 0,
    hardIssues,
    softIssues,
    warnings,
    boundary: 'Downloads must be useful, branded, source-aware, and route readers toward evidence and books. Optional marketing assets should warn instead of blocking a valid production deploy.',
    files: files.map(file => ({
      file: `downloads/${file}`,
      bytes: sizeOf(`downloads/${file}`),
      type: path.extname(file).slice(1),
      brandedExpectation: 'Matrix Reprogrammed + evidence boundary + reader route'
    }))
  };
  fs.writeFileSync(path.join(downloadsDir, 'downloads-index.json'), JSON.stringify(index, null, 2));
  fs.writeFileSync(path.join(downloadsDir, 'downloads-index.md'), [
    '# Matrix Reprogrammed Download Index',
    '',
    `Generated: ${index.generatedAt}`,
    `Result: ${index.ok ? 'PASS' : 'FAIL'}`,
    '',
    index.boundary,
    '',
    hardIssues.length ? '## Hard Issues' : '',
    ...hardIssues.map(w => `- ${w}`),
    '',
    softIssues.length ? '## Soft Issues' : '',
    ...softIssues.map(w => `- ${w}`),
    '',
    warnings.length ? '## Warnings' : '',
    ...warnings.map(w => `- ${w}`),
    '',
    '## Files',
    ...index.files.map(item => `- ${item.file} — ${item.bytes} bytes — ${item.type}`)
  ].join('\n'));
}

needHardFile('download-center.html');
needHardFile('optin-center.html');
needHardFile('newsletter.html');
needHardFile('downloads');
needText('download-center.html', 'MATRIX REPROGRAMMED', 'hard');
needAnyText('download-center.html', ['Evidence', 'evidence'], 'hard');

// These are important offer/capture assets, but they should not block deployment if a generator renames
// or temporarily withholds one. The audit report records them for the next build improvement pass.
needSoftFile('downloads/the-black-file-matrix-reprogrammed.pdf');
needSoftFile('downloads/intel-drop-vault.json');
needSoftFile('downloads/intel-drop-vault.md');
needText('newsletter.html', 'data-newsletter-form', 'soft');
needAnyText('newsletter.html', ['Weekly Signal', 'WEEKLY SIGNAL', 'weekly signal'], 'soft');

let files = [];
if (fs.existsSync(downloadsDir)) {
  files = fs.readdirSync(downloadsDir).filter(file => /\.(pdf|json|md)$/i.test(file));
  const pdfs = files.filter(file => file.endsWith('.pdf'));
  const leadMagnets = files.filter(file => file.includes('lead-magnet'));
  if (pdfs.length < 3) warnings.push('fewer than three PDF downloads found; keep building branded lead magnets');
  if (leadMagnets.length < 3) warnings.push('fewer than three lead magnet assets found; keep expanding useful downloads');
  if (exists('downloads/the-black-file-matrix-reprogrammed.pdf') && sizeOf('downloads/the-black-file-matrix-reprogrammed.pdf') < 10000) warnings.push('the-black-file PDF is small; improve depth/formatting when possible');
} else {
  hardIssues.push('missing downloads directory');
}

writeIndex(files);

if (hardIssues.length) {
  console.error('BRANDED DOWNLOADS AUDIT FAILED');
  for (const issue of hardIssues) console.error(`- ${issue}`);
  if (softIssues.length) {
    console.error('Soft issues also recorded:');
    for (const issue of softIssues) console.error(`- ${issue}`);
  }
  process.exit(1);
}
for (const issue of softIssues) console.warn(`DOWNLOAD SOFT ISSUE: ${issue}`);
for (const warning of warnings) console.warn(`DOWNLOAD WARNING: ${warning}`);
console.log(`BRANDED DOWNLOADS AUDIT PASSED with ${files.length} indexed asset(s).`);
