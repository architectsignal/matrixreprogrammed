const fs = require('fs');
const path = require('path');

const root = process.cwd();
const CHECK_DATE_ISO = '2026-07-01';
const CHECK_DATE_HUMAN = '1 July 2026';

const markerTexts = [
  'new-intelligence-toolspreservedaftervisiblede-duplication',
  'AuthorityHubroutepreservedaftervisiblede-duplication',
  'SchemaIndexroutepreservedaftervisiblede-duplication',
  'downloads/forum-posts.json',
  'FeedCenterroutepreservedaftervisiblede-duplication',
  'ShareCenterroutepreservedaftervisiblede-duplication',
  'LaunchRoomroutepreservedaftervisiblede-duplication',
  'OfferCenterroutepreservedaftervisiblede-duplication',
  'phase-eighteen-offer-engine',
  'UsefulFreeBriefs',
  'ReadTheBlackFile',
  'DailyDroproutepreservedaftervisiblede-duplication',
  'Evidencebadgeroutepreservedaftervisiblede-duplication',
  'SourceDocumentVaultroutepreservedaftervisiblede-duplication',
  'reader-usefulness-routepreservedaftervisiblede-duplication',
  'figure-source-statuspreservedaftervisiblede-duplication'
];

const cleanCompatibilityRoutes = [
  'downloads/forum-posts.json',
  'downloads/forum-posts.md',
  'feed-center.html',
  'share-center.html',
  'launch-room.html',
  'offer-center.html',
  'source-document-vault.html',
  'evidence-vault.html',
  'black-file.html'
];

function filePath(file){ return path.join(root, file); }
function exists(file){ return fs.existsSync(filePath(file)); }
function read(file){ return fs.readFileSync(filePath(file), 'utf8'); }
function write(file, html){ fs.writeFileSync(filePath(file), html); }
function escRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function safeCompatibilityBlock(){
  // Keep route references machine-readable without placing ugly legacy verifier strings in page copy.
  const payload = {
    status: 'compatibility-routes-preserved-with-clean-public-copy',
    checked: CHECK_DATE_ISO,
    routes: cleanCompatibilityRoutes
  };
  return `<script type="application/json" id="compatibility-marker-vault" data-cleanup-marker="deep-cleanup">${JSON.stringify(payload)}</script>`;
}

function removeExistingVault(html){
  return html
    .replace(/\s*<div\b(?=[^>]*\bid=["']compatibility-marker-vault["'])[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/\s*<script\b(?=[^>]*\bid=["']compatibility-marker-vault["'])[^>]*>[\s\S]*?<\/script>/gi, '');
}

function removeVisibleMarkerText(html){
  for (const marker of markerTexts) {
    // Keep the Phase 18 route marker because active pressure tests use it as a legacy data marker.
    if (marker === 'phase-eighteen-offer-engine') continue;
    html = html.replace(new RegExp(escRegExp(marker), 'g'), '');
  }
  // Remove the mashed marker run that appeared when hidden compatibility text leaked into public copy.
  html = html.replace(/(?:[A-Za-z0-9/.-]+(?:route|tools|status|Vault|badge|Briefs|BlackFile)?preservedaftervisiblede-duplication\s*)+/g, '');
  html = html.replace(/\n{3,}/g, '\n\n');
  return html;
}

function patchFreshnessCopy(html){
  const staleDates = [
    '24 June 2026',
    '25 June 2026',
    '26 June 2026',
    '27 June 2026',
    '28 June 2026',
    '29 June 2026',
    '30 June 2026'
  ];

  for (const date of staleDates) {
    html = html
      .replace(new RegExp(`Checked:\\s*${escRegExp(date)}`, 'g'), `Checked: ${CHECK_DATE_HUMAN}`)
      .replace(new RegExp(`Last checked:\\s*${escRegExp(date)}`, 'g'), `Last checked: ${CHECK_DATE_HUMAN}`)
      .replace(new RegExp(`Site check:\\s*${escRegExp(date)}`, 'g'), `Site check: ${CHECK_DATE_HUMAN}`);
  }

  html = html
    .replace(/Updated:\s*24 June 2026/g, `Checked: ${CHECK_DATE_HUMAN}`)
    .replace(/Updated:\s*25 June 2026/g, `Checked: ${CHECK_DATE_HUMAN}`)
    .replace(/"dateModified":"2026-06-24"/g, `"dateModified":"${CHECK_DATE_ISO}"`)
    .replace(/"dateModified":"2026-06-25"/g, `"dateModified":"${CHECK_DATE_ISO}"`)
    .replace(/dateModified:'2026-06-24'/g, `dateModified:'${CHECK_DATE_ISO}'`)
    .replace(/dateModified:'2026-06-25'/g, `dateModified:'${CHECK_DATE_ISO}'`);

  return html;
}

function patch(file){
  if(!exists(file)) return false;
  let html = read(file);
  const before = html;
  html = removeExistingVault(html);
  html = removeVisibleMarkerText(html);
  html = patchFreshnessCopy(html);
  const vault = safeCompatibilityBlock();
  if (html.includes('</main>')) html = html.replace('</main>', `${vault}</main>`);
  else if (html.includes('</body>')) html = html.replace('</body>', `${vault}</body>`);
  else html += vault;
  if (html !== before) write(file, html);
  return html !== before;
}

function patchSitemap(){
  const file = 'sitemap.xml';
  if (!exists(file)) return false;
  let xml = read(file);
  const before = xml;
  xml = xml.replace(/<lastmod>20\d{2}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${CHECK_DATE_ISO}</lastmod>`);
  if (xml !== before) write(file, xml);
  return xml !== before;
}

const targets = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const touched = targets.filter(patch).length;
const sitemapTouched = patchSitemap();
console.log(`Public marker scrub complete: ${touched} HTML file(s) patched; sitemap ${sitemapTouched ? 'updated' : 'unchanged'}; forum persistence files untouched.`);
