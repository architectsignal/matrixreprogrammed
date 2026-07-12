const fs = require('fs');
const path = require('path');

const root = process.cwd();
function patch(file, transform) {
  if (!fs.existsSync(file)) return false;
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(file, after);
  return after !== before;
}

const phase8Section = `<section class="section wrap" id="phase8-evidence-archive"><div class="eyebrow">Public and free · Phase 8</div><h2>EVIDENCE ARCHIVE & VERIFICATION</h2><p>Replay approved public web captures, verify SHA-256 integrity, inspect signed Sigstore manifests, compare recorded source changes and export professional citations.</p><div class="grid"><article class="card"><span class="label">ReplayWeb.page</span><h3>Replay preserved sources</h3><p>Open browser-generated WACZ captures without depending on the original website remaining unchanged or online.</p><a class="btn" href="evidence-archive.html">Open Evidence Archive</a></article><article class="card"><span class="label">Sigstore + SHA-256</span><h3>Verify publication integrity</h3><p>Inspect the signed evidence manifest and independently calculate archive hashes in your browser.</p><a class="btn alt" href="data/evidence-integrity-manifest.json">Integrity Manifest</a></article><article class="card"><span class="label">jsdiff + Citation.js</span><h3>Compare and cite</h3><p>Visualise recorded additions and removals, then export source-linked citations and bibliographies.</p><a class="btn alt" href="evidence-archive.html#source-change-diff">Compare Sources</a></article></div><p class="tool-lock"><strong>Boundary:</strong> preservation and integrity establish captured bytes, dates and provenance. They do not authenticate every statement or establish wrongdoing beyond the underlying record.</p></section>`;

patch(path.join(root, 'research-tools.html'), html => {
  if (html.includes('id="phase8-evidence-archive"')) return html;
  const marker = '<section class="section wrap"><div class="eyebrow">Private Results</div>';
  return html.includes(marker) ? html.replace(marker, `${phase8Section}${marker}`) : html.replace('</main>', `${phase8Section}</main>`);
});

patch(path.join(root, 'source-changes.html'), html => {
  let next = html;
  if (!next.includes('href="evidence-archive.html"')) {
    next = next.replace('<a class="btn" href="data/source-change-public.json">Public JSON</a>', '<a class="btn" href="data/source-change-public.json">Public JSON</a><a class="btn alt" href="evidence-archive.html#source-change-diff">Visual Diff & Replay</a>');
  }
  return next;
});

patch(path.join(root, 'sitemap.xml'), xml => {
  if (xml.includes('/evidence-archive.html')) return xml;
  const entry = '<url><loc>https://matrixreprogrammed.com/evidence-archive.html</loc></url>';
  return xml.includes('</urlset>') ? xml.replace('</urlset>', `${entry}</urlset>`) : xml;
});

patch(path.join(root, 'llms.txt'), text => {
  if (text.includes('Evidence Archive & Verification:')) return text;
  return `${text.trim()}\nEvidence Archive & Verification: https://matrixreprogrammed.com/evidence-archive.html\nIntegrity Manifest: https://matrixreprogrammed.com/data/evidence-integrity-manifest.json\n`;
});

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'phase8-wiring.json'), JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), route: 'evidence-archive.html', integrations: ['research-tools.html', 'source-changes.html', 'sitemap.xml', 'llms.txt'] }, null, 2));
console.log('Phase 8 evidence archive routes integrated.');
