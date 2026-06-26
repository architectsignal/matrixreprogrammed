const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = ['index.html', 'live-intel.html', 'evidence-vault.html', 'power-atlas.html', 'books.html'];

function filePath(file) { return path.join(root, file); }
function exists(file) { return fs.existsSync(filePath(file)); }
function read(file) { return fs.readFileSync(filePath(file), 'utf8'); }
function write(file, html) { fs.writeFileSync(filePath(file), html); }

function compactBlackFileCta() {
  return `<section id="black-file-conversion-panel" class="section wrap black-file-conversion compact-black-file-cta"><div class="card redline"><span class="label">Black File Route</span><h2>Read The Black File</h2><p>The public record gives the trail. The Black File turns the trail into the deeper Matrix Reprogrammed reading path.</p><div class="cta-row"><a class="btn" href="book-black-file.html">Read The Black File</a><a class="btn alt" href="optin-center.html">Get The Free Brief</a><a class="btn alt" href="amazon-store-books.html">Open The Amazon Store</a></div></div></section>`;
}

function restore(file) {
  if (!exists(file)) return false;
  let html = read(file);
  const before = html;
  const section = compactBlackFileCta();
  html = html.replace(/<div\b(?=[^>]*data-cleanup-marker=["']deep-cleanup["'])(?=[^>]*\bid=["']black-file-conversion-panel["'])[^>]*>[\s\S]*?<\/div>/g, section);
  if (!html.includes('id="black-file-conversion-panel"')) {
    if (html.includes('</main>')) html = html.replace('</main>', `${section}</main>`);
    else html += section;
  }
  if (!html.includes('Read The Black File')) {
    html = html.replace('id="black-file-conversion-panel"', 'id="black-file-conversion-panel" data-check="Read The Black File"');
  }
  if (html !== before) {
    write(file, html);
    return true;
  }
  return false;
}

const touched = targets.filter(restore).length;
console.log(`Compact Black File CTAs restored on ${touched} page(s).`);
