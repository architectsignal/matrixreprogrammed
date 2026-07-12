const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
if (!fs.existsSync(indexPath)) throw new Error('index.html not found for primary safety navigation patch.');

let html = fs.readFileSync(indexPath, 'utf8');
const navMatch = html.match(/<div class="nav-primary">([\s\S]*?)<\/div>/i);
if (!navMatch) throw new Error('Primary navigation container not found.');

let links = navMatch[1];
links = links.replace(/<a href="security-privacy\.html">Security Tools<\/a>/gi, '');
links = links.replace(/<a href="dark-web-safety\.html">Dark Web Safety<\/a>/gi, '');
const promoted = '<a href="security-privacy.html">Security Tools</a><a href="dark-web-safety.html">Dark Web Safety</a>';
if (/<a href="search\.html">Search<\/a>/i.test(links)) {
  links = links.replace(/<a href="search\.html">Search<\/a>/i, `${promoted}<a href="search.html">Search</a>`);
} else {
  links += promoted;
}
html = html.replace(navMatch[0], `<div class="nav-primary">${links}</div>`);
fs.writeFileSync(indexPath, html);

const count = value => (html.match(new RegExp(`href="${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || []).length;
if (!/<div class="nav-primary">[\s\S]*href="security-privacy\.html"[\s\S]*href="dark-web-safety\.html"[\s\S]*<\/div>/i.test(html)) {
  throw new Error('Safety links were not promoted into primary navigation.');
}
if (count('security-privacy.html') < 1 || count('dark-web-safety.html') < 1) {
  throw new Error('Safety navigation targets are missing.');
}
console.log('Primary navigation now exposes Security Tools and Dark Web Safety.');
