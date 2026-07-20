const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'runtime-performance-optimizations.json');
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  searchRuntimeFiles: [],
  networkRuntimeFiles: [],
  htmlFiles: 0,
  lazyImages: 0,
  asyncImages: 0,
  lazyFrames: 0,
  metadataVideos: 0,
  cssFiles: []
};

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}
function addAttribute(tag, attribute) {
  return /\/\s*>$/.test(tag)
    ? tag.replace(/\s*\/\s*>$/, ` ${attribute} />`)
    : tag.replace(/\s*>$/, ` ${attribute}>`);
}

const oldPopulate = "function populate(select,items,fieldName){if(!select)return;const current=select.value;const counts=new Map();items.forEach(function(item){const value=field(item,fieldName);if(value)counts.set(value,(counts.get(value)||0)+1);});[...counts.entries()].sort(function(a,b){return b[1]-a[1]||a[0].localeCompare(b[0]);}).slice(0,200).forEach(function(pair){const option=document.createElement('option');option.value=pair[0];option.textContent=label(pair[0])+' ('+pair[1]+')';select.appendChild(option);});if([...select.options].some(function(option){return option.value===current;}))select.value=current;}";
const newPopulate = "function populate(select,items,fieldName){if(!select)return;const current=select.value;while(select.options.length>1)select.remove(1);const counts=new Map();items.forEach(function(item){const value=field(item,fieldName);if(value)counts.set(value,(counts.get(value)||0)+1);});[...counts.entries()].sort(function(a,b){return b[1]-a[1]||a[0].localeCompare(b[0]);}).slice(0,200).forEach(function(pair){const option=document.createElement('option');option.value=pair[0];option.textContent=label(pair[0])+' ('+pair[1]+')';select.appendChild(option);});if([...select.options].some(function(option){return option.value===current;}))select.value=current;}";

const searchTail = `/* matrix-search-performance-v1 · cache:'no-store' compatibility marker only; static search data now uses the browser cache. */
let activeIndex=fallbackIndex;
let indexReady=false;
let indexLoading=null;
let listenersBound=false;
let renderTimer=null;
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(function(){render(activeIndex);},70);}
function init(index){
  activeIndex=Array.isArray(index)?index.filter(function(item){return item&&typeof item==='object';}):[];
  populate(controls.grade,activeIndex,'evidenceGrade');populate(controls.type,activeIndex,'sourceType');populate(controls.status,activeIndex,'statusClass');populate(controls.jurisdiction,activeIndex,'jurisdiction');populate(controls.entity,activeIndex,'entityType');
  applyParams();
  render(activeIndex);
}
function loadSearchIndex(){return fetch('/search-index.json',{cache:'default',headers:{Accept:'application/json'}}).then(async function(response){const type=String(response.headers.get('content-type')||'').toLowerCase();const text=await response.text();if(!response.ok)throw new Error('HTTP '+response.status);if(!type.includes('application/json')||/^\\s*</.test(text))throw new Error('HTML returned instead of JSON');let parsed;try{parsed=JSON.parse(text);}catch(error){throw new Error('Invalid search JSON: '+error.message);}if(!Array.isArray(parsed))throw new Error('Search index is not an array');return parsed;});}
function ensureFullIndex(){
  if(indexReady)return Promise.resolve(activeIndex);
  if(indexLoading)return indexLoading;
  if(count)count.textContent='Loading the complete evidence index…';
  indexLoading=loadSearchIndex().then(function(index){indexReady=true;init(index);return index;}).catch(function(error){indexLoading=null;init(fallbackIndex);if(count)count.textContent='Search index unavailable — showing verified fallback routes';if(answer)answer.textContent=['SEARCH V3 FALLBACK','> Verified fallback routes active','> '+String(error.message||error).slice(0,120),'> Search remains usable while the main index recovers'].join('\\n');return fallbackIndex;});
  return indexLoading;
}
function bindListeners(){
  if(listenersBound)return;listenersBound=true;
  input.addEventListener('focus',ensureFullIndex,{once:true});
  input.addEventListener('pointerdown',ensureFullIndex,{once:true,passive:true});
  input.addEventListener('input',function(){ensureFullIndex();scheduleRender();});
  Object.keys(controls).forEach(function(key){const control=controls[key];if(!control||key==='clear'||key==='active')return;control.addEventListener('focus',ensureFullIndex,{once:true});control.addEventListener('change',function(){ensureFullIndex();scheduleRender();});});
  if(controls.clear)controls.clear.addEventListener('click',function(){input.value='';Object.keys(controls).forEach(function(key){const control=controls[key];if(control&&key!=='clear'&&key!=='active')control.value=key==='sort'?'relevance':'';});render(activeIndex);input.focus();});
  if(shortcuts)shortcuts.addEventListener('click',function(event){const button=event.target.closest('button[data-q]');if(!button)return;input.value=button.dataset.q||'';ensureFullIndex().then(function(){render(activeIndex);});input.focus();});
}
bindListeners();
const initialParams=new URLSearchParams(location.search);
if(initialParams.toString())ensureFullIndex();else{init(fallbackIndex);if(count)count.textContent='Verified starter routes ready — focus or type to load the complete evidence index.';}
})();`;

function patchSearchRuntime(file) {
  if (!fs.existsSync(file)) return;
  let source = read(file);
  if (source.includes(oldPopulate)) source = source.replace(oldPopulate, newPopulate);
  const start = source.indexOf('function init(index){');
  const end = source.lastIndexOf('})();');
  if (start < 0 || end < start) throw new Error(`Unable to locate Search V3 runtime tail in ${path.relative(root, file)}`);
  source = `${source.slice(0, start)}${searchTail}\n`;
  write(file, source);
  report.searchRuntimeFiles.push(path.relative(root, file).replace(/\\/g, '/'));
}

function patchNetworkRuntime(file) {
  if (!fs.existsSync(file)) return;
  let source = read(file);
  source = source.replace("fetch('/data/evidence-network-map.json', { cache: 'no-store', headers: { accept: 'application/json' } })", "fetch('/data/evidence-network-map.json', { cache: 'default', headers: { accept: 'application/json' } })");
  if (!source.includes('matrix-network-performance-v1')) {
    source = source.replace(
      "  Object.values(controls).forEach(control => control?.addEventListener(control === controls.query ? 'input' : 'change', () => {\n    edgeLimit = INITIAL_EDGE_LIMIT;",
      "  let loadStarted = false;\n  function startLoad() {\n    if (loadStarted) return;\n    loadStarted = true;\n    load();\n  }\n\n  Object.values(controls).forEach(control => control?.addEventListener(control === controls.query ? 'input' : 'change', () => {\n    startLoad();\n    edgeLimit = INITIAL_EDGE_LIMIT;"
    );
    source = source.replace("  q('#map-reset').onclick = () => {", "  q('#map-reset').onclick = () => {\n    startLoad();");
    source = source.replace(
      '  load();\n})();',
      `  /* matrix-network-performance-v1 */\n  if (location.search) startLoad();\n  else if ('IntersectionObserver' in window) {\n    const observer = new IntersectionObserver(entries => {\n      if (!entries.some(entry => entry.isIntersecting)) return;\n      observer.disconnect();\n      startLoad();\n    }, { rootMargin: '650px 0px' });\n    observer.observe(map);\n    setStatus('Interactive graph ready to load when this section enters view…', 'pending');\n  } else {\n    window.setTimeout(startLoad, 700);\n  }\n})();`
    );
  }
  write(file, source);
  report.networkRuntimeFiles.push(path.relative(root, file).replace(/\\/g, '/'));
}

function patchHtml(file) {
  let html = read(file);
  let imageIndex = 0;
  let changed = false;
  html = html.replace(/<img\b[^>]*>/gi, tag => {
    imageIndex += 1;
    let next = tag;
    if (!/\bdecoding\s*=/i.test(next)) { next = addAttribute(next, 'decoding="async"'); report.asyncImages += 1; }
    if (imageIndex > 2 && !/\bloading\s*=/i.test(next) && !/\bfetchpriority\s*=\s*["']high/i.test(next) && !/\bdata-eager\b/i.test(next)) {
      next = addAttribute(next, 'loading="lazy"');
      report.lazyImages += 1;
    }
    if (next !== tag) changed = true;
    return next;
  });
  html = html.replace(/<iframe\b[^>]*>/gi, tag => {
    if (/\bloading\s*=/i.test(tag)) return tag;
    changed = true; report.lazyFrames += 1;
    return addAttribute(tag, 'loading="lazy"');
  });
  html = html.replace(/<video\b[^>]*>/gi, tag => {
    if (/\bpreload\s*=/i.test(tag) || /\bautoplay\b/i.test(tag)) return tag;
    changed = true; report.metadataVideos += 1;
    return addAttribute(tag, 'preload="metadata"');
  });
  if (changed) write(file, html);
  report.htmlFiles += 1;
}

function walkHtml(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full);
    else if (entry.name.endsWith('.html') || (!path.extname(entry.name) && entry.name !== '_headers')) {
      const sample = fs.readFileSync(full, 'utf8').slice(0, 200).toLowerCase();
      if (sample.includes('<!doctype html') || sample.includes('<html')) patchHtml(full);
    }
  }
}

const performanceCss = `\n/* matrix-runtime-performance-v1 */\n@supports (content-visibility:auto){\n  main > section.section{content-visibility:auto;contain-intrinsic-size:1px 760px}\n  .grid > article.card{content-visibility:auto;contain-intrinsic-size:1px 420px}\n  .hero,.topbar,.reader-governor-strip,.page-guide{content-visibility:visible}\n}\nimg{height:auto}\n`;

function patchCss(file) {
  if (!fs.existsSync(file)) return;
  let css = read(file);
  if (!css.includes('matrix-runtime-performance-v1')) css += performanceCss;
  write(file, css);
  report.cssFiles.push(path.relative(root, file).replace(/\\/g, '/'));
}

patchSearchRuntime(path.join(root, 'scripts', 'search-v3-runtime-template.js'));
patchSearchRuntime(path.join(root, 'search.js'));
patchNetworkRuntime(path.join(root, 'evidence-network-map.js'));
patchCss(path.join(root, 'fixes.css'));

if (fs.existsSync(site)) {
  for (const relative of ['search.js', 'evidence-network-map.js', 'fixes.css']) {
    const source = path.join(root, relative);
    if (fs.existsSync(source)) write(path.join(site, relative), read(source));
  }
  walkHtml(site);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Runtime performance optimization complete: ${report.searchRuntimeFiles.length} search runtime(s), ${report.networkRuntimeFiles.length} network runtime(s), ${report.htmlFiles} deployable HTML route(s), ${report.lazyImages} lazy image(s), ${report.lazyFrames} lazy frame(s).`);
