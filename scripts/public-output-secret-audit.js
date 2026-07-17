const fs = require('fs');
const path = require('path');

const root = process.cwd();
const publicRoots = [path.join(root, 'data'), path.join(root, 'downloads'), path.join(root, '_site')]
  .filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const binary = new Set(['.png','.jpg','.jpeg','.gif','.webp','.ico','.pdf','.zip','.gz','.woff','.woff2','.ttf','.eot','.mp3','.mp4','.mov','.avi','.sqlite','.db','.wacz']);
const secretNames = [
  'FEC_API_KEY','BREVO_API_KEY','ADMIN_API_TOKEN','EMAIL_WEBHOOK_SECRET',
  'PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID','CLOUDFLARE_API_TOKEN',
  'GITHUB_TOKEN','NETLIFY_AUTH_TOKEN'
];
const secretValues = secretNames
  .map(name => ({ name, value: String(process.env[name] || '') }))
  .filter(item => item.value.length >= 8);
const forbiddenTemplates = secretNames.map(name => `{{${name}}}`);
const redactions = [];
const failures = [];

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ['.git','node_modules','.wrangler','evidence-archive','source-snapshots','browsertrix-output'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output); else output.push(full);
  }
  return output;
}
function display(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function textCandidate(file) {
  if (binary.has(path.extname(file).toLowerCase())) return false;
  try { return fs.statSync(file).size <= 25 * 1024 * 1024; } catch { return false; }
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

for (const base of publicRoots) {
  for (const file of walk(base).filter(textCandidate)) {
    let source;
    try {
      const buffer = fs.readFileSync(file);
      if (buffer.includes(0)) continue;
      source = buffer.toString('utf8');
    } catch { continue; }
    const before = source;
    const reasons = [];

    for (const item of secretValues) {
      if (!source.includes(item.value)) continue;
      source = source.replace(new RegExp(escapeRegExp(item.value), 'g'), `[REDACTED_${item.name}]`);
      reasons.push(`resolved-${item.name}`);
    }
    for (const template of forbiddenTemplates) {
      if (!source.includes(template)) continue;
      source = source.split(template).join('[REDACTED_SECRET_TEMPLATE]');
      reasons.push(`template-${template.slice(2, -2)}`);
    }

    source = source.replace(/([?&](?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|signature)=)([^&"'<>\s]+)/gi, (match, prefix, value) => {
      if (/^(?:\[?redacted|public|demo)$/i.test(value)) return match;
      reasons.push('sensitive-query-parameter');
      return `${prefix}[REDACTED]`;
    });

    if (source !== before) {
      fs.writeFileSync(file, source);
      redactions.push({ file: display(file), reasons: [...new Set(reasons)] });
    }

    for (const item of secretValues) if (source.includes(item.value)) failures.push(`${display(file)} still contains ${item.name}`);
    for (const template of forbiddenTemplates) if (source.includes(template)) failures.push(`${display(file)} still contains ${template}`);
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  roots: publicRoots.map(value => path.relative(root, value) || '.'),
  secretNamesChecked: secretNames,
  resolvedSecretValuesChecked: secretValues.map(item => item.name),
  redactionCount: redactions.length,
  redactions,
  failures,
  boundary: 'Only public data, downloads and the deployable Cloudflare bundle are scanned and redacted. Secret values are never written into this report.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'public-output-secret-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(`PUBLIC OUTPUT SECRET AUDIT FAILED: ${failures.length} residual issue(s).`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Public output secret audit passed; ${redactions.length} public file(s) required redaction.`);
