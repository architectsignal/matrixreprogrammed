const fs = require('fs');
const path = require('path');

const root = process.cwd();
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, html){ fs.writeFileSync(path.join(root, file), html); }

function removeBlock(html, id){
  return html.replace(new RegExp(`\\s*<div id=["']${id}["'][\\s\\S]*?<\\/div>`, 'gi'), '');
}

function patchHomepageEye(){
  const file = 'index.html';
  if(!exists(file)) return;
  let html = read(file);
  html = removeBlock(html, 'all-seeing-eye-gate');
  const eye = `\n<div id="all-seeing-eye-gate" aria-label="Hidden speculation gate" style="margin:28px auto 0;text-align:center;opacity:.72;letter-spacing:.12em;">\n  <a href="dark-speculation-lab.html" aria-label="Open the hidden speculation lab" title="Classified, not confirmed" style="display:inline-block;text-decoration:none;font-size:42px;line-height:1;color:inherit;filter:drop-shadow(0 0 12px rgba(255,255,255,.18));">𓂀</a>\n</div>`;
  if(html.includes('</footer>')) html = html.replace('</footer>', `${eye}</footer>`);
  else html += eye;
  write(file, html);
}

function removeObviousSpecNav(file){
  if(!exists(file)) return;
  let html = read(file);
  // Keep the pages usable, but remove obvious global navigation labels that advertise the hidden lab.
  html = html.replace(/<a\s+href=["']dark-speculation-lab\.html["']>Dark Lab<\/a>/gi, '');
  html = html.replace(/<a\s+href=["']dark-speculation-forum\.html["']>Drop Box<\/a>/gi, '');
  // The forum should not point back to the lab except through direct URL knowledge; the homepage eye is the public entry.
  if(file === 'dark-speculation-forum.html'){
    html = html.replace(/<a\s+class=["']btn alt["']\s+href=["']dark-speculation-lab\.html["']>Dark Lab<\/a>/gi, '');
  }
  write(file, html);
}

function removeCrawlerDiscovery(){
  if(exists('search-index.json')){
    try {
      const index = JSON.parse(read('search-index.json'));
      const filtered = index.filter(item => !['dark-speculation-lab.html','dark-speculation-forum.html'].includes(item.url));
      write('search-index.json', JSON.stringify(filtered, null, 2));
    } catch {}
  }
  if(exists('sitemap.xml')){
    let xml = read('sitemap.xml');
    xml = xml.replace(/\s*<url><loc>https:\/\/matrixreprogrammed\.com\/dark-speculation-lab\.html<\/loc>[\s\S]*?<\/url>/gi, '');
    xml = xml.replace(/\s*<url><loc>https:\/\/matrixreprogrammed\.com\/dark-speculation-forum\.html<\/loc>[\s\S]*?<\/url>/gi, '');
    write('sitemap.xml', xml);
  }
  if(exists('llms.txt')){
    let txt = read('llms.txt');
    txt = txt.replace(/\n\nDark Speculation Lab:\n- \/dark-speculation-lab\.html:[\s\S]*?(?=\n\n[A-Z][^\n]*:|$)/g, '');
    write('llms.txt', txt.trim() + '\n');
  }
}

patchHomepageEye();
removeObviousSpecNav('dark-speculation-lab.html');
removeObviousSpecNav('dark-speculation-forum.html');
removeCrawlerDiscovery();
console.log('Homepage speculation eye patched: only visible public entry is the all-seeing eye at the homepage footer.');
