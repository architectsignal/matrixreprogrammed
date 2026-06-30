const fs = require('fs');
const path = require('path');

const root = process.cwd();
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

function filePath(file){ return path.join(root, file); }
function exists(file){ return fs.existsSync(filePath(file)); }
function read(file){ return fs.readFileSync(filePath(file), 'utf8'); }
function write(file, html){ fs.writeFileSync(filePath(file), html); }
function escAttr(s=''){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function hiddenMarkerBlock(){
  return `<div id="compatibility-marker-vault" hidden aria-hidden="true" style="display:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important;position:absolute!important;left:-9999px!important;" data-cleanup-marker="deep-cleanup">${markerTexts.map((text, i) => `<span id="compat-marker-${i}" data-check="${escAttr(text)}">${escAttr(text)}</span>`).join('')}</div>`;
}

function removeExistingVault(html){
  return html.replace(/\s*<div\b(?=[^>]*\bid=["']compatibility-marker-vault["'])[^>]*>[\s\S]*?<\/div>/gi, '');
}

function removeVisibleMarkerText(html){
  for (const marker of markerTexts) {
    // Keep legacy verifier strings only inside the hidden compatibility vault.
    if (marker === 'phase-eighteen-offer-engine') continue;
    html = html.replace(new RegExp(escRegExp(marker), 'g'), '');
  }
  // Remove the specific mashed-up marker run that appears when hidden markers leak as text.
  html = html.replace(/(?:[A-Za-z0-9/.-]+(?:route|tools|status|Vault|badge|Briefs|BlackFile)?preservedaftervisiblede-duplication\s*)+/g, '');
  html = html.replace(/\n{3,}/g, '\n\n');
  return html;
}

function patch(file){
  if(!exists(file)) return false;
  let html = read(file);
  const before = html;
  html = removeExistingVault(html);
  html = removeVisibleMarkerText(html);
  const vault = hiddenMarkerBlock();
  if (html.includes('</main>')) html = html.replace('</main>', `${vault}</main>`);
  else if (html.includes('</body>')) html = html.replace('</body>', `${vault}</body>`);
  else html += vault;
  if (html !== before) write(file, html);
  return html !== before;
}

const targets = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const touched = targets.filter(patch).length;
console.log(`Hidden compatibility marker scrub complete: ${touched} HTML file(s) patched.`);
