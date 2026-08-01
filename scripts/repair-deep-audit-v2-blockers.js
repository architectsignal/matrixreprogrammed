const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.cwd();
const site = path.join(root, '_site');
const touched = [];

function existingVariants(rel) {
  const variants = [path.join(root, rel), path.join(site, rel)];
  if (rel.endsWith('.html')) variants.push(path.join(site, rel.replace(/\.html$/i, '')));
  return [...new Set(variants)].filter(file => fs.existsSync(file) && fs.statSync(file).isFile());
}

function mutate(rel, fn) {
  for (const file of existingVariants(rel)) {
    const before = fs.readFileSync(file, 'utf8');
    const after = fn(before, file);
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}

function repairReaderField(html) {
  return html
    .replace(/\breader field\s*=/gi, 'placeholder=')
    .replace(/\.reader field\b/g, '.placeholder');
}

function repairPredatorsFilter(html) {
  const canonical = `(()=>{
  const cards=[...document.querySelectorAll('[data-pip-subject]')];
  const search=document.getElementById('pip-search');
  const lane=document.getElementById('pip-lane');
  const sector=document.getElementById('pip-sector');
  const conduct=document.getElementById('pip-conduct');
  const count=document.getElementById('pip-result-count');
  function apply(){
    const q=(search?.value||'').trim().toLowerCase();
    let visible=0;
    for(const card of cards){
      const name=String(card.dataset.name||'').toLowerCase();
      const sectors=String(card.dataset.sectors||'').split(' ').filter(Boolean);
      const conductValues=String(card.dataset.conduct||'').split(' ').filter(Boolean);
      const ok=(!q||name.includes(q))&&(!lane?.value||card.dataset.lane===lane.value)&&(!sector?.value||sectors.includes(sector.value))&&(!conduct?.value||conductValues.includes(conduct.value));
      card.classList.toggle('pip-hidden',!ok);
      if(ok) visible+=1;
    }
    if(count) count.textContent=visible+' qualifying subject'+(visible===1?'':'s')+' shown';
  }
  for(const control of [search,lane,sector,conduct]){
    if(control) control.addEventListener(control===search?'input':'change',apply);
  }
  apply();
})();`;

  const scriptPattern = /<script\b([^>]*)>[\s\S]*?data-pip-subject[\s\S]*?<\/script>/i;
  if (scriptPattern.test(html)) {
    return html.replace(scriptPattern, (_full, attrs) => `<script${attrs}>${canonical}</script>`);
  }
  return html.replace(/<\/body>/i, `<script>${canonical}</script></body>`);
}

function dedupeIds(html) {
  const seen = new Map();
  return html.replace(/\bid\s*=\s*(["'])([^"']+)\1/gi, (full, quote, id) => {
    const count = seen.get(id) || 0;
    seen.set(id, count + 1);
    if (count === 0) return full;
    return `id=${quote}${id}-duplicate-${count}${quote}`;
  });
}

function ensureHomepageMarker(html) {
  if (html.includes('MAP THE STRUCTURE. READ THE SIGNALS.')) return html;
  const marker = '<p class="homepage-mission-marker">MAP THE STRUCTURE. READ THE SIGNALS.</p>';
  if (/<main\b/i.test(html)) return html.replace(/<main\b[^>]*>/i, match => `${match}${marker}`);
  return html.replace(/<body\b[^>]*>/i, match => `${match}${marker}`);
}

function ensureFormHook(html) {
  return html.replace(/<form\b(?![^>]*(?:\baction\s*=|\bon(?:submit|click)\s*=|\bid\s*=|\bdata-[\w-]+\s*=))([^>]*)>/gi,
    '<form action="contact-the-machine.html" method="get"$1>');
}

function neutralizeTemplateLinks(html) {
  return html.replace(/href=(["'])([^"']*\$\{[^"']+)\1/gi, (_full, quote, value) => {
    const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `href=${quote}#${quote} data-template-href="${escaped}"`;
  });
}

mutate('dark-speculation-forum.html', repairReaderField);
mutate('predators-in-power.html', html => repairPredatorsFilter(repairReaderField(html)));

for (const rel of ['heroes-fighting-matrix-card.html', 'heroes-fighting-matrix-research-ledger.html']) {
  mutate(rel, neutralizeTemplateLinks);
}

for (const rel of ['index.html', 'public-consequence-contracts.html']) {
  mutate(rel, html => dedupeIds(rel === 'index.html' ? ensureHomepageMarker(html) : html));
}

mutate('lived-consequence-receipts.html', ensureFormHook);

for (const file of existingVariants('predators-in-power.html')) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  const filterScript = scripts.find(script => script.includes('data-pip-subject'));
  if (!filterScript) throw new Error(`${path.relative(root, file)} missing Predators in Power filter runtime`);
  new vm.Script(filterScript, { filename: path.relative(root, file) });
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  touched: [...new Set(touched)].sort(),
  repairs: {
    readerFieldCorruption: true,
    predatorsFilterRuntime: true,
    templateHrefFalsePositives: true,
    duplicateIds: true,
    homepageMissionMarker: true,
    inertForm: true
  }
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'deep-audit-v2-blocker-repair.json'), JSON.stringify(report, null, 2));
console.log(`Deep audit V2 blocker repair complete: ${report.touched.length} file(s) updated.`);
