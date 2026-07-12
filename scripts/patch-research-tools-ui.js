const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const toolsPath = path.join(root, 'research-tools.html');
const templatePath = path.join(root, 'scripts', 'templates', 'research-tools-member.txt');
const visibilityPath = path.join(root, 'scripts', 'hide-internal-public-controls.js');
if (!fs.existsSync(indexPath)) throw new Error('index.html not found');
if (!fs.existsSync(templatePath)) throw new Error('canonical Research Tools template not found');

const canonicalTools = fs.readFileSync(templatePath, 'utf8');
fs.writeFileSync(toolsPath, canonicalTools);

let index = fs.readFileSync(indexPath, 'utf8');
const start = '<!-- osint-tools-home:start -->';
const end = '<!-- osint-tools-home:end -->';
const card = `${start}<section id="osint-tools-home" class="section wrap"><div class="eyebrow">Member Research Tools</div><h2>EMAIL & DIGITAL FOOTPRINT RESEARCH.</h2><p class="lead">Verified members can submit controlled, single-email checks through Holehe and passive SpiderFoot. The breach-exposure tool is restricted to authenticated administrators.</p><p><strong>Boundary:</strong> account, footprint and breach signals are leads—not proof of identity, ownership, current use, wrongdoing or criminal conduct.</p><div class="cta-row"><a class="btn" href="research-tools.html">Open Research Tools</a><a class="btn alt" href="member-login.html">Member Login</a><a class="btn alt" href="https://emailosint.org/" target="_blank" rel="noopener noreferrer nofollow">External Email OSINT ↗</a></div></section>${end}`;
if (index.includes(start) && index.includes(end)) {
  index = index.replace(new RegExp(`${start}[\s\S]*?${end}`), card);
} else if (index.includes('<!-- power-deck-home-link:start -->')) {
  index = index.replace('<!-- power-deck-home-link:start -->', `${card}<!-- power-deck-home-link:start -->`);
} else {
  index = index.replace('</main>', `${card}</main>`);
}
fs.writeFileSync(indexPath, index);

let visibilityPatched = false;
if (fs.existsSync(visibilityPath)) {
  const before = fs.readFileSync(visibilityPath, 'utf8');
  let after = before.replace(/\n\s*'Research Tools',?/g, '');
  if (!after.includes("ensurePhraseVisible(html, 'EMAIL & DIGITAL FOOTPRINT RESEARCH.')")) {
    after = after.replace(
      "html = ensurePhraseVisible(html, 'Join Weekly Signal');",
      "html = ensurePhraseVisible(html, 'Join Weekly Signal');\n  html = ensurePhraseVisible(html, 'EMAIL & DIGITAL FOOTPRINT RESEARCH.');"
    );
  }
  if (after !== before) {
    fs.writeFileSync(visibilityPath, after);
    visibilityPatched = true;
  }
}

const sitemapPath = path.join(root, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  if (!sitemap.includes('/research-tools.html')) sitemap = sitemap.replace('</urlset>', '<url><loc>https://matrixreprogrammed.com/research-tools.html</loc></url></urlset>');
  fs.writeFileSync(sitemapPath, sitemap);
}
const llmsPath = path.join(root, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let llms = fs.readFileSync(llmsPath, 'utf8');
  if (!llms.includes('research-tools.html')) llms += '\n- Member research tools: https://matrixreprogrammed.com/research-tools.html\n';
  fs.writeFileSync(llmsPath, llms);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'research-tools-ui-patch.json'), JSON.stringify({
  ok: canonicalTools.includes('data-tool-form="holehe"') && canonicalTools.includes('data-tool-form="spiderfoot"') && canonicalTools.includes('data-tool-form="h8mail"') && index.includes(start) && index.includes('href="research-tools.html"') && index.includes('https://emailosint.org/'),
  generatedAt: new Date().toISOString(),
  homepageRoute: 'research-tools.html',
  externalRoute: 'https://emailosint.org/',
  canonicalTemplate: path.relative(root, templatePath).replace(/\\/g, '/'),
  visibilityPatched
}, null, 2));
console.log('Canonical Research Tools page, homepage route and visibility policy applied.');

// Phase 10 must run after the canonical Research Tools template is restored.
require('./build-geographic-power-atlas.js');
require('./prepare-geographic-power-atlas-output.js');
require('./patch-main-navigation-safety-links.js');
for (const report of ['geographic-power-atlas-build.json','geographic-power-atlas-test.json','geographic-power-atlas-output-test.json']) {
  fs.rmSync(path.join(root,'downloads',report), { force:true });
}
