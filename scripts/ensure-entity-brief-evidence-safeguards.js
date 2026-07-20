'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const directory = path.join(root, 'entity-briefs');
const start = '<!-- entity-evidence-safeguard:start -->';
const end = '<!-- entity-evidence-safeguard:end -->';
const markerPattern = /<!-- entity-evidence-safeguard:start -->[\s\S]*?<!-- entity-evidence-safeguard:end -->/g;
const block = `${start}<section id="entity-evidence-gap-safeguard" class="section wrap" style="display:block"><div class="eyebrow">Evidence Gap / Next Verification</div><h2>Missing Records</h2><p>Open and verify the primary page, complete filing, PDF, docket, contract, award notice, ownership record or registry entry before upgrading the assessment. Record provenance, publication date, completeness, redactions and any contradictory source.</p><h2>Watch Next</h2><p>Monitor new official releases, court filings, corrections, contracts, ownership records and authenticated correspondence. Reassess the conclusion whenever evidence confirms, weakens or replaces the current inference.</p><p><strong>Boundary:</strong> A missing record is a research requirement, not proof of concealment, guilt, coordination or intent.</p></section>${end}`;

if (!fs.existsSync(directory)) {
  console.log('Entity brief evidence safeguard skipped: entity-briefs directory is absent.');
  process.exit(0);
}

let changed = 0;
let checked = 0;
for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.html'))) {
  const file = path.join(directory, name);
  const before = fs.readFileSync(file, 'utf8');
  let html = before.replace(markerPattern, '');
  html = html.includes('</main>') ? html.replace('</main>', `${block}</main>`) : `${html}${block}`;
  if (!/<h2>Missing Records<\/h2>/i.test(html) || !/<h2>Watch Next<\/h2>/i.test(html)) {
    throw new Error(`Entity evidence safeguard failed for ${name}`);
  }
  if (html !== before) {
    fs.writeFileSync(file, html);
    changed += 1;
  }
  checked += 1;
}

console.log(`Entity evidence safeguards verified across ${checked} brief(s); ${changed} file(s) updated.`);
