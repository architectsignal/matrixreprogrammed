const fs = require('fs');
const path = require('path');

const root = process.cwd();
const bases = [root, path.join(root, '_site')].filter((value, index, all) => fs.existsSync(value) && all.indexOf(value) === index);
const ignored = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'netlify', 'browsertrix-output']);
const changed = [];
const stats = { files: 0, lang: 0, descriptions: 0, controlLabels: 0, imageAlt: 0, noopener: 0 };

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html') || (!path.extname(entry.name) && /<!doctype html|<html\b/i.test(fs.readFileSync(full, 'utf8')))) out.push(full);
  }
  return out;
}
function escapeAttr(value) { return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function strip(value) { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim(); }
function attr(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`, 'i'));
  return match ? match[2] : '';
}
function humanize(value) {
  return String(value || '').replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).replace(/\s+/g, ' ').trim();
}
function descriptionFor(html, file) {
  const title = strip((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || humanize(path.basename(file)) || 'Matrix Reprogrammed');
  return `${title}. Evidence, records, source routes, public research tools and clearly bounded conclusions from Matrix Reprogrammed.`.slice(0, 220);
}
function controlLabel(tag) {
  return humanize(attr(tag, 'placeholder') || attr(tag, 'name') || attr(tag, 'id') || attr(tag, 'type') || tag.match(/^<(input|select|textarea)/i)?.[1] || 'form control');
}
function imageLabel(tag) {
  const source = attr(tag, 'src');
  if (/pixel|spacer|tracking|transparent/i.test(source)) return '';
  return attr(tag, 'title') || humanize(source);
}
function patchHtml(html, file) {
  let next = html;
  if (/<html\b/i.test(next) && !/<html\b[^>]*\blang\s*=/i.test(next)) {
    next = next.replace(/<html\b([^>]*)>/i, '<html lang="en"$1>');
    stats.lang++;
  }
  if (!/<meta\b[^>]*name=["']description["']/i.test(next) && /<head\b/i.test(next)) {
    next = next.replace(/<\/head>/i, `<meta name="description" content="${escapeAttr(descriptionFor(next, file))}"></head>`);
    stats.descriptions++;
  }
  next = next.replace(/<(input|select|textarea)\b[^>]*>/gi, tag => {
    const type = (attr(tag, 'type') || '').toLowerCase();
    if (type === 'hidden' || /\baria-label(?:ledby)?\s*=|\btitle\s*=/i.test(tag)) return tag;
    const label = controlLabel(tag);
    if (!label) return tag;
    stats.controlLabels++;
    return tag.replace(/>$/, ` aria-label="${escapeAttr(label)}">`);
  });
  next = next.replace(/<img\b[^>]*>/gi, tag => {
    if (/\balt\s*=/i.test(tag)) return tag;
    stats.imageAlt++;
    return tag.replace(/>$/, ` alt="${escapeAttr(imageLabel(tag))}">`);
  });
  next = next.replace(/<a\b[^>]*target=["']_blank["'][^>]*>/gi, tag => {
    if (/\brel\s*=["'][^"']*(?:noopener|noreferrer)/i.test(tag)) return tag;
    stats.noopener++;
    if (/\brel\s*=/i.test(tag)) return tag.replace(/\brel\s*=\s*(["'])([^"']*)\1/i, (_match, quote, value) => `rel=${quote}${value} noopener noreferrer${quote}`);
    return tag.replace(/>$/, ' rel="noopener noreferrer">');
  });
  return next;
}

const seen = new Set();
for (const base of bases) {
  for (const file of walk(base)) {
    const absolute = path.resolve(file);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    stats.files++;
    const before = fs.readFileSync(file, 'utf8');
    const after = patchHtml(before, file);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  stats,
  changed: [...new Set(changed)],
  boundary: 'Final public HTML receives a language declaration, a useful description, accessible names for unlabeled controls, safe alternative text defaults and noopener/noreferrer protection. Existing explicit editorial labels and descriptions are preserved.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'deep-audit-accessibility-metadata-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Deep-audit accessibility and metadata repair completed across ${stats.files} HTML surfaces; ${changed.length} file(s) changed.`);
