const fs = require('fs');
const path = require('path');

const root = process.cwd();
const route = 'power-entities.html';
const page = path.join(root, route);
if (!fs.existsSync(page)) throw new Error(`${route} is missing`);

const changes = [];
const sitemapPath = path.join(root, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  if (!xml.includes('/power-entities.html</loc>')) {
    xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/power-entities.html</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>0.93</priority></url>\n</urlset>`);
    fs.writeFileSync(sitemapPath, xml);
    changes.push('sitemap.xml');
  }
}

const llmsPath = path.join(root, 'llms.txt');
if (fs.existsSync(llmsPath)) {
  let text = fs.readFileSync(llmsPath, 'utf8');
  if (!text.includes('/power-entities.html')) {
    text += `\n\nPower Entities:\n- /power-entities.html: source-led gateway to people, institutions, organisations, relationship records, geographic scope and evidence boundaries.\n`;
    fs.writeFileSync(llmsPath, text);
    changes.push('llms.txt');
  }
}

const indexPath = path.join(root, 'search-index.json');
if (fs.existsSync(indexPath)) {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (Array.isArray(index) && !index.some(item => item && item.url === route)) {
    index.push({
      key: 'power-entities',
      title: 'Power Entities',
      subtitle: 'People, institutions and sourced relationships',
      category: 'Elite Networks',
      layer: 'elite-networks',
      url: route,
      description: 'Source-led gateway to the entity registry, relationship registry, evidence network, geographic atlas and daily power conclusions.',
      keywords: ['power entities', 'people', 'institutions', 'companies', 'agencies', 'contractors', 'entity registry', 'relationship registry', 'evidence network'],
      priority: 93,
      sourceType: 'mission-route'
    });
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    changes.push('search-index.json');
  }
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'power-entities-route-report.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  route,
  changes,
  boundary: 'The route maps public-record entities and relationships. Inclusion does not establish control, coordination, intent or wrongdoing.'
}, null, 2));
console.log(`Power Entities route registered. Updated: ${changes.join(', ') || 'already current'}.`);
