const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const startHerePath = path.join(root, 'start-here.html');
if (!fs.existsSync(indexPath)) throw new Error('index.html not found for primary safety navigation patch.');
if (!fs.existsSync(startHerePath)) throw new Error('start-here.html not found for safety route patch.');

const removeSafetyLinks = value => String(value)
  .replace(/<a href="security-privacy\.html">Security Tools<\/a>/gi, '')
  .replace(/<a href="dark-web-safety\.html">Dark Web Safety<\/a>/gi, '');

let html = fs.readFileSync(indexPath, 'utf8');
const navMatch = html.match(/<div class="nav-primary">([\s\S]*?)<\/div>/i);
if (!navMatch) throw new Error('Primary navigation container not found.');
let links = removeSafetyLinks(navMatch[1]);
const promoted = '<a href="security-privacy.html">Security Tools</a><a href="dark-web-safety.html">Dark Web Safety</a>';
if (/<a href="search\.html">Search<\/a>/i.test(links)) links = links.replace(/<a href="search\.html">Search<\/a>/i, `${promoted}<a href="search.html">Search</a>`);
else links += promoted;
html = html.replace(navMatch[0], `<div class="nav-primary">${links}</div>`);
fs.writeFileSync(indexPath, html);

let startHere = fs.readFileSync(startHerePath, 'utf8');
// Remove the obsolete second safety section. The canonical Start Here grid already contains both cards.
startHere = startHere.replace(/<!-- start-here-safety:start -->[\s\S]*?<!-- start-here-safety:end -->/gi, '');
startHere = startHere.replace(/<section class="section commercial-internal">/g, '<section class="section">');
const startNav = startHere.match(/(<nav\b[^>]*class=["'][^"']*\bnav\b[^"']*["'][^>]*>)([\s\S]*?)<\/nav>/i);
if (!startNav) throw new Error('Start Here navigation not found.');
let startLinks = removeSafetyLinks(startNav[2]);
if (/<a href="search\.html">Search<\/a>/i.test(startLinks)) startLinks = startLinks.replace(/<a href="search\.html">Search<\/a>/i, `${promoted}<a href="search.html">Search</a>`);
else startLinks += promoted;
startHere = startHere.replace(startNav[0], `${startNav[1]}${startLinks}</nav>`);
fs.writeFileSync(startHerePath, startHere);

const count = (text, value) => (text.match(new RegExp(`href="${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || []).length;
const countAnchors = value => (String(value).match(/<a\b[^>]*href=/gi) || []).length;
if (!/<div class="nav-primary">[\s\S]*href="security-privacy\.html"[\s\S]*href="dark-web-safety\.html"[\s\S]*<\/div>/i.test(html)) throw new Error('Safety links were not promoted into primary navigation.');
if (countAnchors(links) > 8) throw new Error(`Homepage primary navigation remains too dense: ${countAnchors(links)} links.`);
if (count(startHere, 'security-privacy.html') < 2 || count(startHere, 'dark-web-safety.html') < 2) throw new Error('Start Here navigation or safety cards are missing.');
if (/<!-- start-here-safety:start -->/i.test(startHere)) throw new Error('Obsolete duplicate Start Here safety block remains.');
console.log('Primary navigation and canonical Start Here cards expose Security Tools and Dark Web Safety.');
