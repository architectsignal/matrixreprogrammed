const fs = require('fs');
const path = require('path');

const root = process.cwd();
function patch(file, transform) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) return false;
  const before = fs.readFileSync(target, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(target, after);
  return after !== before;
}

patch('sitemap.xml', xml => {
  let next = xml;
  for (const route of ['entity-registry.html','relationship-registry.html']) {
    if (!next.includes(`/${route}`)) next = next.replace('</urlset>', `<url><loc>https://matrixreprogrammed.com/${route}</loc></url></urlset>`);
  }
  return next;
});

patch('llms.txt', text => {
  let next = text;
  if (!next.includes('entity-registry.html')) next += '\n- Structured entity registry: https://matrixreprogrammed.com/entity-registry.html\n';
  if (!next.includes('relationship-registry.html')) next += '- Sourced relationship registry: https://matrixreprogrammed.com/relationship-registry.html\n';
  if (!next.includes('investigation-knowledge-graph.json')) next += '- Structured investigation graph JSON: https://matrixreprogrammed.com/data/investigation-knowledge-graph.json\n';
  return next;
});

for (const file of ['investigation-machine.html','investigation-source-ledger.html','daily-investigation-conclusions.html','weekly-investigation-report.html','evidence-network-map.html']) {
  patch(file, html => {
    if (html.includes('href="entity-registry.html"')) return html;
    const links = '<a class="btn alt" href="entity-registry.html">Entity Registry</a><a class="btn alt" href="relationship-registry.html">Relationship Registry</a>';
    if (html.includes('<div class="cta-row">')) return html.replace('<div class="cta-row">', `<div class="cta-row">${links}`);
    if (html.includes('</main>')) return html.replace('</main>', `<section class="section wrap"><div class="cta-row">${links}</div></section></main>`);
    return html;
  });
}

console.log('Structured investigation routes wired into sitemap, machine-readable guidance and public investigation navigation.');
