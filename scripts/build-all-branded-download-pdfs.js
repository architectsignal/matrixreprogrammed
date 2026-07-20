const { execFileSync } = require('child_process');
const path = require('path');

// Public compatibility contract retained for the Source Document Vault pressure test
// and the download-center Flagship PDF Collection.
const flagshipOrder = [
  'subject-epstein-black-file',
  'lead-magnet-black-file-brief',
  'subject-intelligence-network',
  'source-document-vault',
  'dossier-pack-intelligence-network',
  'dossier-pack-trust-evidence',
  'share-kit-black-file-starter'
];
const flagshipSection = 'Flagship PDF Collection';
const run = script => execFileSync(process.execPath, [path.join(__dirname, script)], {
  cwd: process.cwd(),
  stdio: 'inherit'
});

// Migrate any legacy public manifests and switch the deep builder to its internal state directory before generation.
run('relocate-pdf-report-manifests.js');
run('build-deep-pdf-intelligence.mjs');
// Safety pass: no internal build manifest may remain under the public downloads tree.
run('relocate-pdf-report-manifests.js');
execFileSync(process.execPath, [path.join(__dirname, 'restore-branded-pdf-flagship-contract.js')], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, MATRIX_PDF_FLAGSHIP_ORDER: flagshipOrder.join(','), MATRIX_PDF_FLAGSHIP_SECTION: flagshipSection }
});
