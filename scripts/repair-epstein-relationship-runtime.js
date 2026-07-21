const fs = require('fs');
const path = require('path');

const pagePath = path.join(process.cwd(), 'epstein-email-network.html');

if (!fs.existsSync(pagePath)) {
  throw new Error('Cannot repair missing epstein-email-network.html');
}

let html = fs.readFileSync(pagePath, 'utf8');
const dynamicHref = `href="'+escapeHtml(x.source_url)+'"`;
const dataEvidenceUrl = `data-evidence-url="'+escapeHtml(x.source_url)+'"`;
const oldInspector = "function showRelationship(id){const r=network.relationships.find(x=>x.relationship_id===id);if(r)detail.innerHTML=evidenceHtml(r)}";
const newInspector = "function showRelationship(id){const r=network.relationships.find(x=>x.relationship_id===id);if(r){detail.innerHTML=evidenceHtml(r);detail.querySelectorAll('[data-evidence-url]').forEach(a=>{a.href=a.dataset.evidenceUrl})}}";

if (html.includes(dynamicHref)) {
  html = html.replace(dynamicHref, dataEvidenceUrl);
}

if (html.includes(oldInspector)) {
  html = html.replace(oldInspector, newInspector);
}

if (html.includes(dynamicHref)) {
  throw new Error('Dynamic evidence href remained after Epstein relationship runtime repair');
}
if (!html.includes(dataEvidenceUrl) || !html.includes("a.href=a.dataset.evidenceUrl")) {
  throw new Error('Epstein relationship evidence-link repair was not installed');
}

fs.writeFileSync(pagePath, html);
console.log('Epstein relationship evidence links repaired for static route auditing and browser activation.');
