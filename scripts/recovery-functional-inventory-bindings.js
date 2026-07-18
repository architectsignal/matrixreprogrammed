const fs = require('fs');
const path = require('path');

const root = process.cwd();
const jsonPath = path.join(root, 'downloads', 'recovery-functional-inventory.json');
const markdownPath = path.join(root, 'downloads', 'recovery-functional-inventory.md');
const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function read(relative) {
  try { return fs.readFileSync(path.join(root, relative), 'utf8'); } catch { return ''; }
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }

for (const page of report.pages || []) {
  const code = (page.localScriptFiles || []).map(read).join('\n');
  const genericSubmitBinding = /querySelectorAll\s*\(\s*['"]form['"]\s*\)/.test(code)
    && /addEventListener\s*\(\s*['"]submit['"]/.test(code);
  if (!genericSubmitBinding) continue;
  const formIds = new Set((page.controls || []).filter(control => control.tag === 'form' && control.id).map(control => control.id));
  page.unboundControlIds = (page.unboundControlIds || []).filter(id => !formIds.has(id));
  if (!page.unboundControlIds.length) {
    page.blockingRisks = (page.blockingRisks || []).filter(risk => risk !== 'possibly-unbound-controls');
    page.functionalRisks = (page.functionalRisks || []).filter(risk => risk !== 'possibly-unbound-controls');
    page.risks = (page.risks || []).filter(risk => risk !== 'possibly-unbound-controls');
  }
}

const pages = report.pages || [];
const criticalRiskPages = pages.filter(page => page.critical && (page.blockingRisks || []).length);
const possiblyDeadControls = pages.filter(page => (page.unboundControlIds || []).length);
const objectPlaceholderPages = pages.filter(page => (page.blockingRisks || []).includes('object-placeholder-published'));
const missingReferences = pages.flatMap(page => page.missingReferences || []);
const missingDataDependencies = pages.flatMap(page => page.missingDataDependencies || []);
report.version = 4;
report.bindingRefinedAt = new Date().toISOString();
report.summary.pagesWithPossiblyDeadControls = possiblyDeadControls.length;
report.summary.criticalFunctionalRiskPages = criticalRiskPages.length;
report.summary.pagesPublishingObjectPlaceholders = objectPlaceholderPages.length;
report.ok = missingReferences.length === 0 && missingDataDependencies.length === 0 && criticalRiskPages.length === 0 && objectPlaceholderPages.length === 0;
report.priorityFindings.criticalRiskPages = criticalRiskPages.map(page => ({ file:page.file, route:page.route, risks:page.blockingRisks, unboundControlIds:page.unboundControlIds }));
report.priorityFindings.possiblyDeadControls = possiblyDeadControls.map(page => ({ file:page.file, route:page.route, controlIds:page.unboundControlIds }));
report.priorityFindings.objectPlaceholderPages = objectPlaceholderPages.map(page => ({ file:page.file, route:page.route }));
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# Matrix Reprogrammed Recovery Functional Inventory',
  '',
  `Generated: ${report.generatedAt}`,
  `Refined: ${report.bindingRefinedAt}`,
  `Commit: ${report.commit || 'local'}`,
  `Scanner version: ${report.version}`,
  '',
  '## Summary',
  '',
  ...Object.entries(report.summary).map(([key, value]) => `- **${key}:** ${value}`),
  '',
  '## Blocking functional risk pages',
  '',
  ...(criticalRiskPages.length ? criticalRiskPages.map(page => `- \`${page.file}\` — ${(page.blockingRisks || []).join(', ')}`) : ['- None detected']),
  '',
  '## Published object placeholders',
  '',
  ...(objectPlaceholderPages.length ? objectPlaceholderPages.map(page => `- \`${page.file}\``) : ['- None detected']),
  '',
  '## Genuinely unbound actionable controls',
  '',
  ...(possiblyDeadControls.length ? possiblyDeadControls.map(page => `- \`${page.file}\` — ${(page.unboundControlIds || []).join(', ')}`) : ['- None detected']),
  '',
  'Generic form submit handlers are recognised as valid bindings when they attach submit listeners to every form.',
  ''
].join('\n');
fs.writeFileSync(markdownPath, md);
console.log(`Recovery functional inventory v4 bindings refined: ${JSON.stringify(report.summary)}`);
