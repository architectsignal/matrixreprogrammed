const fs = require('fs');
const path = require('path');
const root = process.cwd();
const fp = relative => path.join(root, relative);
const readJson = relative => JSON.parse(fs.readFileSync(fp(relative), 'utf8'));
const issues = [];
const review = [];
function fail(message) { issues.push(message); }
function exists(relative) { return Boolean(relative) && fs.existsSync(fp(relative)); }

for (const required of ['data/card-art-registry.json', 'data/card-download-manifest.json', 'downloads/card-art-registry.md', 'card-art-inbox/README.md']) {
  if (!exists(required)) fail(`Missing card-art system output: ${required}`);
}

if (!issues.length) {
  const registry = readJson('data/card-art-registry.json');
  const manifest = readJson('data/card-download-manifest.json');
  const byKey = registry.byKey || {};
  if (!Number.isFinite(Number(registry.totalCards)) || Number(registry.totalCards) < 1) fail('Card-art registry has no cards.');
  if (Number(registry.realArtCount || 0) < 1) fail('No real stored card image was resolved; repository images are still disconnected from the deck.');
  if (Number(registry.realArtCount || 0) + Number(registry.placeholderCount || 0) !== Number(registry.totalCards || 0)) fail('Real-art and placeholder counts do not equal total cards.');
  for (const deck of manifest.decks || []) {
    for (const card of deck.cards || []) {
      const key = `${deck.id}:${card.id}`;
      const record = byKey[key];
      if (!record) { fail(`Manifest card missing from art registry: ${key}`); continue; }
      if (card.asset !== record.asset) fail(`Manifest and registry disagree for ${key}: ${card.asset} versus ${record.asset}`);
      if (!exists(record.asset)) fail(`Resolved artwork file does not exist for ${key}: ${record.asset}`);
      const extension = path.extname(record.asset).toLowerCase();
      if (record.realArt && !['.webp', '.png', '.jpg', '.jpeg', '.avif', '.svg'].includes(extension)) fail(`Unsupported real-art extension for ${key}: ${extension}`);
      if (record.placeholder) {
        if (extension !== '.svg') fail(`Placeholder is not an SVG for ${key}: ${record.asset}`);
        else {
          const content = fs.readFileSync(fp(record.asset), 'utf8');
          if (!/VISUAL CARD PLACEHOLDER|ARTWORK PENDING|GENERATED CARD ART LAYER|CARD SCORE|OVERALL INFLUENCE SCORE/i.test(content)) fail(`Placeholder status is not visibly marked inside ${record.asset}`);
        }
      }
      if (record.realArt && record.placeholder) fail(`Card cannot be both real art and placeholder: ${key}`);
    }
  }
  for (const relative of registry.unmatchedRasterCandidates || []) review.push(`Unmatched stored image: ${relative}`);
  const report = {
    ok: issues.length === 0,
    testedAt: new Date().toISOString(),
    totalCards: Number(registry.totalCards || 0),
    realArtCount: Number(registry.realArtCount || 0),
    placeholderCount: Number(registry.placeholderCount || 0),
    matchedStoredImageCount: Number(registry.matchedStoredImageCount || 0),
    unmatchedStoredImageCount: (registry.unmatchedRasterCandidates || []).length,
    issues,
    review,
    rules: {
      realImagesPreferred: true,
      placeholdersClearlyMarked: true,
      manifestRegistryAgreementRequired: true,
      uploadInboxEnabled: true
    }
  };
  fs.mkdirSync(fp('downloads'), { recursive: true });
  fs.writeFileSync(fp('downloads/card-art-resolution-test.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(fp('downloads/card-art-resolution-test.md'), `# Card Art Resolution Test\n\nTested: ${report.testedAt}\n\nReal artwork: ${report.realArtCount}\n\nPlaceholders: ${report.placeholderCount}\n\nMatched stored images: ${report.matchedStoredImageCount}\n\nUnmatched stored images: ${report.unmatchedStoredImageCount}\n\n## Issues\n\n${issues.map(issue => `- ${issue}`).join('\n') || '- None'}\n\n## Review\n\n${review.map(item => `- ${item}`).join('\n') || '- None'}\n`);
}

if (issues.length) {
  console.error('\nCARD ART RESOLUTION TEST FAILED\n');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('CARD ART RESOLUTION TEST PASSED');
