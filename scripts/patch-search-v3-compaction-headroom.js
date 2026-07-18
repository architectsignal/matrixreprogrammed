const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runtimePath = path.join(root, 'scripts', 'build-search-v3-runtime.js');
const reportPath = path.join(root, 'downloads', 'search-v3-compaction-headroom-patch.json');

if (!fs.existsSync(runtimePath)) throw new Error('scripts/build-search-v3-runtime.js is missing');

const before = fs.readFileSync(runtimePath, 'utf8');
let after = before;
let changed = false;

const legacyProfiles = `const compactionProfiles = [
  { id: 'balanced', title: 180, description: 160, listItems: 8, listChars: 64, scalar: 96 },
  { id: 'compact', title: 160, description: 120, listItems: 6, listChars: 48, scalar: 80 },
  { id: 'tight', title: 144, description: 96, listItems: 5, listChars: 40, scalar: 72 },
  { id: 'minimum-safe', title: 128, description: 72, listItems: 4, listChars: 32, scalar: 64 }
];`;
const currentProfiles = `const compactionProfiles = [
  { id: 'balanced', title: 180, description: 160, listItems: 8, listChars: 64, scalar: 96 },
  { id: 'compact', title: 160, description: 120, listItems: 6, listChars: 48, scalar: 80 },
  { id: 'tight', title: 144, description: 96, listItems: 5, listChars: 40, scalar: 72 },
  { id: 'minimum-safe', title: 128, description: 72, listItems: 4, listChars: 32, scalar: 64 },
  { id: 'deploy-safe', title: 112, description: 56, listItems: 3, listChars: 28, scalar: 56 },
  { id: 'deployment-floor', title: 96, description: 44, listItems: 3, listChars: 24, scalar: 48 }
];`;
const productionProfiles = `const compactionProfiles = [
  { id: 'balanced', title: 180, description: 160, listItems: 8, listChars: 64, scalar: 96, sourceUrl: 700 },
  { id: 'compact', title: 160, description: 120, listItems: 6, listChars: 48, scalar: 80, sourceUrl: 500 },
  { id: 'tight', title: 144, description: 96, listItems: 5, listChars: 40, scalar: 72, sourceUrl: 360 },
  { id: 'minimum-safe', title: 128, description: 72, listItems: 4, listChars: 32, scalar: 64, sourceUrl: 280 },
  { id: 'deploy-safe', title: 112, description: 56, listItems: 3, listChars: 28, scalar: 56, sourceUrl: 200 },
  { id: 'deployment-floor', title: 96, description: 44, listItems: 3, listChars: 24, scalar: 48, sourceUrl: 140 },
  { id: 'route-floor', title: 88, description: 32, listItems: 2, listChars: 20, scalar: 44, sourceUrl: 120 },
  { id: 'emergency-route-floor', title: 80, description: 24, listItems: 2, listChars: 18, scalar: 40, sourceUrl: 100 }
];`;
const fallbackProfiles = `const compactionProfiles = [
  { id: 'balanced', title: 180, description: 160, listItems: 8, listChars: 64, scalar: 96, sourceUrl: 700 },
  { id: 'compact', title: 160, description: 120, listItems: 6, listChars: 48, scalar: 80, sourceUrl: 500 },
  { id: 'tight', title: 144, description: 96, listItems: 5, listChars: 40, scalar: 72, sourceUrl: 360 },
  { id: 'minimum-safe', title: 128, description: 72, listItems: 4, listChars: 32, scalar: 64, sourceUrl: 280 },
  { id: 'ultra-safe', title: 116, description: 48, listItems: 3, listChars: 24, scalar: 52, sourceUrl: 220 },
  { id: 'minimum-route-safe', title: 104, description: 24, listItems: 2, listChars: 20, scalar: 44, sourceUrl: 180 }
];`;

let profileFamily = 'unknown';
if (after.includes(productionProfiles)) {
  profileFamily = 'production-headroom';
} else if (after.includes(currentProfiles)) {
  after = after.replace(currentProfiles, productionProfiles);
  changed = true;
  profileFamily = 'production-headroom-installed';
} else if (after.includes("id: 'ultra-safe'") && after.includes("id: 'minimum-route-safe'")) {
  profileFamily = 'legacy-headroom';
} else if (after.includes(legacyProfiles)) {
  after = after.replace(legacyProfiles, fallbackProfiles);
  changed = true;
  profileFamily = 'fallback-headroom-installed';
} else {
  throw new Error('Search V3 compaction profile block not found or incomplete');
}

const oldSourceUrl = "if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, 1000);";
const currentDistinctSourceUrl = "if (/^https?:/i.test(sourceUrl) && comparableUrl(sourceUrl) !== comparableUrl(url)) output.sourceUrl = sourceUrl.slice(0, 1000);";
const cappedDistinctSourceUrl = "if (/^https?:/i.test(sourceUrl) && comparableUrl(sourceUrl) !== comparableUrl(url)) output.sourceUrl = sourceUrl.slice(0, Number(profile.sourceUrl || 320));";
const cappedLegacySourceUrl = "if (/^https?:/i.test(sourceUrl)) output.sourceUrl = sourceUrl.slice(0, Number(profile.sourceUrl || 320));";

if (!after.includes(cappedDistinctSourceUrl) && !after.includes(cappedLegacySourceUrl)) {
  if (after.includes(currentDistinctSourceUrl)) {
    after = after.replace(currentDistinctSourceUrl, cappedDistinctSourceUrl);
  } else if (after.includes(oldSourceUrl)) {
    after = after.replace(oldSourceUrl, cappedLegacySourceUrl);
  } else {
    throw new Error('Search V3 source URL compaction target not found');
  }
  changed = true;
}

const hasHeadroomProfiles = (
  after.includes("id: 'deployment-floor'") && after.includes("id: 'emergency-route-floor'")
) || (
  after.includes("id: 'ultra-safe'") && after.includes("id: 'minimum-route-safe'")
);
if (!hasHeadroomProfiles) throw new Error('Search V3 deployment headroom profiles are missing');
if (!after.includes('sourceUrl.slice(0, Number(profile.sourceUrl || 320))')) throw new Error('Search V3 bounded source URL marker is missing');

if (changed) fs.writeFileSync(runtimePath, after);
require('./patch-search-v3-adjudicated-ranking.js');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  runtime: 'scripts/build-search-v3-runtime.js',
  acceptedProfileFamily: profileFamily,
  deepestProfile: after.includes("id: 'emergency-route-floor'") ? 'emergency-route-floor' : 'minimum-route-safe',
  adjudicatedRankingApplied: true,
  preservesEverySearchableUrl: true,
  duplicateSameRouteSourceUrlsOmitted: after.includes('comparableUrl(sourceUrl) !== comparableUrl(url)'),
  boundary: 'Growing Search V3 data is compacted by bounding display metadata and distinct long source URLs. No searchable route is removed; conviction and judgment queries prioritize court, investigation and established records over generic relationship rows.'
}, null, 2)}\n`);
console.log(`Search V3 compaction headroom ${changed ? 'installed' : 'already current'}; ${profileFamily}, URL-preserving route floors and adjudicated ranking applied.`);
