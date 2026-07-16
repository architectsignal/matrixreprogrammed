'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')]
  .filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const marker = 'id="ai-speculative-conclusion-integrity"';
const reviewed = new Date().toISOString().slice(0, 10);
const section = `<section id="ai-speculative-conclusion-integrity" class="section wrap evidence-integrity-card">
  <div class="eyebrow">Evidence discipline · reviewed ${reviewed}</div>
  <h2>Documented mechanism, implication and verification boundary</h2>
  <p><strong>Specific indicators:</strong> In 2026 this assessment watches dated changes in digital identity, payment access, platform governance, public procurement, emergency powers, data concentration and institutional enforcement. A signal counts only when a named source identifies the actor, action, date, authority, funding, implementation or restriction involved.</p>
  <p><strong>Mechanism:</strong> The scenarios operate through documented dependencies between identity systems, financial rails, information access, contractor infrastructure, legal mandates and institutional incentives. Repetition, symbolism or social association cannot establish a mechanism.</p>
  <p><strong>Why it matters:</strong> The implication is not that a predicted agenda is proven. The practical risk is that separately documented systems may converge in ways that reduce meaningful consent, local control, appeal rights, privacy, financial access or freedom of expression.</p>
  <p><strong>Evidence boundary and counterpoint:</strong> These are clearly labelled speculative conclusions, not proof of hidden coordination, criminal intent or a predetermined future. Legitimate fraud prevention, public safety, interoperability and administrative efficiency remain alternative explanations unless stronger records establish otherwise.</p>
  <p><strong>What to verify next:</strong> Monitor enacted law, court records, regulator decisions, procurement contracts, technical standards, budgets, enforcement notices, opt-out provisions, appeal mechanisms and official corrections. Lower or withdraw a conclusion when its mechanism fails, its date or identity is wrong, or a stronger counter-source explains the evidence.</p>
</section>`;

const touched = [];
for (const base of roots) {
  const file = path.join(base, 'ai-speculative-conclusions.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  if (before.includes(marker)) {
    after = before.replace(/<section id="ai-speculative-conclusion-integrity"[\s\S]*?<\/section>/i, section);
  } else if (/<\/main>/i.test(before)) {
    after = before.replace(/<\/main>/i, `${section}\n</main>`);
  } else if (/<\/body>/i.test(before)) {
    after = before.replace(/<\/body>/i, `${section}\n</body>`);
  } else {
    after = `${before}\n${section}\n`;
  }
  if (after !== before) {
    fs.writeFileSync(file, after);
    touched.push(path.relative(root, file).replace(/\\/g, '/'));
  }
}

if (!touched.length && !roots.some(base => fs.existsSync(path.join(base, 'ai-speculative-conclusions.html')))) {
  throw new Error('ai-speculative-conclusions.html was not generated before the final evidence-integrity pass.');
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'ai-speculative-conclusions-integrity.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  reviewed,
  touched
}, null, 2));
console.log(`AI speculative conclusions integrity pass complete: ${touched.length} file(s) updated.`);
