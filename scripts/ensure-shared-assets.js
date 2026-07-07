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
runOptional('Deep speculation dossier render', 'build-dark-speculation-expansion.js', ['data/dark-speculation-lab.html']);
runOptional('Big Three Asset Manager Tracker', 'build-big-three-asset-managers.js', ['index.html']);
runOptional('Big Three Search Routes', 'patch-big-three-search-routes.js', ['big-three-asset-managers.html']);
runOptional('BlackRock Video Claim Audit', 'patch-blackrock-video-intel.js', ['big-three/blackrock.html']);
runOptional('Elite Family Tracker', 'build-elite-family-tracker.js', ['index.html']);
runOptional('Orders Tracker', 'build-secret-societies-tracker.js', ['index.html']);
runOptional('Elite Report Writer', 'build-elite-report-writer.js', ['index.html']);
runOptional('Advanced Site Brain', 'build-advanced-site-brain.js', ['index.html']);
runOptional('Tracker Page Completion', 'build-tracker-page-completion.js', ['data/billionaire-control-index.json']);
runOptional('Clock Wall', 'build-clock-wall.js', ['data/global-risk-clocks.json']);
runOptional('Site Relationship Map', 'build-site-relationship-map.js', ['index.html']);
runOptional('Deep Intel Feed Matrix', 'build-deep-intel-feed-matrix.js', ['index.html']);
runOptional('Mission Intelligence Ten', 'build-mission-intelligence-10.js', ['index.html']);
runOptional('Top 52 Power Deck', 'build-top-52-power-deck.js', ['data/evidence-weighted-relationship-graph.json']);
runOptional('Top 52 Influence Profiles', 'patch-top-52-influence-profiles.js', ['data/top-52-power-deck.json']);
runOptional('Top 52 Phase 3 Visuals', 'build-top-52-phase3-visuals.js', ['data/top-52-power-deck.json']);
runOptional('Top 52 Compatibility Marker', 'patch-top-52-compat-marker.js', ['top-52-power-deck.html']);
runOptional('Top 52 Phase 4 Art Studio', 'build-top-52-art-studio.js', ['data/top-52-power-deck.json']);
runOptional('Top 52 Batch 1 Art Queue', 'build-top-52-batch1-art-queue.js', ['data/top-52-power-deck.json']);
runOptional('Top 52 Generated Card Art Install', 'install-generated-card-art.js', ['data/top-52-power-deck.json']);
runOptional('Top 52 Art Link Repair', 'repair-top-52-art-links.js', ['top-52-power-deck.html']);
runOptional('Homepage Power Deck Link', 'patch-homepage-power-deck-link.js', ['index.html']);
runOptional('Readable User Briefs', 'patch-readable-user-briefs.js', ['daily-power-conclusions.html']);
runOptional('Convergence Control Lenses', 'patch-convergence-control-lenses.js', ['daily-power-conclusions.html']);
runOptional('Mission Source Priority Index', 'build-mission-source-priority-index.js', ['data/deep-intel-feed-matrix.json']);
runOptional('Deep Daily Briefs And Map', 'build-deep-daily-briefs-and-map.js', ['data/daily-power-conclusions.json']);
runOptional('Atlas Lane Dossiers', 'build-atlas-lane-dossiers.js', ['power-atlas.html']);
runOptional('Atlas Lane Populations', 'build-atlas-lane-populations.js', ['data/atlas-lane-dossiers.json']);
runOptional('Logo Symbolism Dossiers', 'build-logo-symbolism-dossiers.js', ['atlas-lanes/logos.html']);
runOptional('Atlas Lane Link Repair', 'repair-atlas-lane-population-links.js', ['data/atlas-lane-populations.json']);
runOptional('Reader Experience Governor', 'build-reader-experience-governor.js', ['index.html']);
runOptional('Top 52 Art Link Repair Final', 'repair-top-52-art-links.js', ['top-52-power-deck.html']);
runOptional('Homepage Power Deck Link Final', 'patch-homepage-power-deck-link.js', ['index.html']);

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

runOptional('Top 52 Art Link Repair Pre Audit', 'repair-top-52-art-links.js', ['top-52-power-deck.html']);
runOptional('Site Population Audit', 'site-population-audit.js', ['index.html']);
runOptional('BlackRock Video Briefs Test', 'blackrock-video-briefs-test.js', ['big-three/blackrock.html']);
runOptional('Convergence Control Lenses Test', 'convergence-control-lenses-test.js', ['daily-power-conclusions.html']);
runOptional('Top 52 Power Deck Test', 'top-52-power-deck-test.js', ['top-52-power-deck.html']);
runOptional('Top 52 People Only Test', 'top-52-people-only-test.js', ['data/top-52-power-deck.json']);
runOptional('Top 52 Phase 3 Visuals Test', 'top-52-phase3-visuals-test.js', ['top-52-power-deck.html']);
runOptional('Top 52 Phase 4 Art Studio Test', 'top-52-art-studio-test.js', ['top-52-art-studio.html']);
runOptional('Top 52 Batch 1 Art Queue Test', 'top-52-batch1-art-queue-test.js', ['top-52-batch1-art-queue.html']);
runOptional('Deep Daily Briefs And Map Test', 'deep-daily-briefs-and-map-test.js', ['daily-brief-master.html']);
runOptional('Mission Source Priority Index Test', 'mission-source-priority-test.js', ['mission-source-priority.html']);
runOptional('Atlas Lane Dossiers Test', 'atlas-lane-dossiers-test.js', ['data/atlas-lane-dossiers.json']);
runOptional('Atlas Lane Populations Test', 'atlas-lane-populations-test.js', ['data/atlas-lane-populations.json']);
runOptional('Logo Symbolism Dossiers Test', 'logo-symbolism-dossiers-test.js', ['data/logo-symbolism-dossiers.json']);

console.log(`Shared asset normalizer complete: ${touched} HTML file(s) patched.`);
