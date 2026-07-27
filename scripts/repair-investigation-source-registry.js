const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'data', 'investigation-source-registry.json');
if (!fs.existsSync(file)) {
  console.error('Missing data/investigation-source-registry.json');
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
const replacements = {
  'uk-sfo-news': {
    url: 'https://www.gov.uk/government/organisations/serious-fraud-office',
    label: 'UK Serious Fraud Office — News And Communications'
  },
  'eppo-news': {
    url: 'https://www.eppo.europa.eu/media/news_en',
    label: "European Public Prosecutor's Office — News"
  },
  'openfec-api': {
    label: 'U.S. Federal Election Commission — Campaign Finance Data',
    type: 'html',
    parser: null,
    optional: false,
    requiredEnv: [],
    url: 'https://www.fec.gov/data/',
    securityBoundary: 'The public investigation registry uses the FEC data portal. Secret-bearing OpenFEC request URLs are not stored or published.'
  }
};

let changed = 0;
for (const source of registry.sources || []) {
  const replacement = replacements[source.id];
  if (!replacement) continue;
  for (const [key, value] of Object.entries(replacement)) {
    if (JSON.stringify(source[key]) !== JSON.stringify(value)) {
      source[key] = value;
      changed += 1;
    }
  }
}

registry.updated = new Date().toISOString().slice(0, 10);
registry.securityBoundary = 'Public source registries and generated reports must not contain API keys, tokens, passwords, webhook secrets or secret-bearing request URLs.';
fs.writeFileSync(file, JSON.stringify(registry, null, 2) + '\n');

// Fail-closed collection rule: when every scheduled source fails, record the
// outage and rebuild the public status pages from the prior evidence, but do
// not rewrite, re-sort or refresh the authoritative evidence ledger. This
// prevents an outage from looking like a successful evidence refresh.
const machineFile = path.join(root, 'scripts', 'run-investigation-machine.js');
let machineChanged = 0;
if (fs.existsSync(machineFile)) {
  let machine = fs.readFileSync(machineFile, 'utf8');
  const replacements = [
    [
      '  const mergedFindings = mergeLedger(currentFindings);',
      "  const runHealthy = results.some(result => result.status === 'fetched');\n  const mergedFindings = runHealthy ? mergeLedger(currentFindings) : [...(priorLedger.findings || [])];"
    ],
    [
      '  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));',
      "  if (runHealthy) fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));"
    ],
    [
      "    ok: results.some(result => result.status === 'fetched'),",
      '    ok: runHealthy,'
    ]
  ];
  for (const [before, after] of replacements) {
    if (machine.includes(after)) continue;
    if (!machine.includes(before)) {
      console.error(`Investigation outage-preservation patch target missing: ${before}`);
      process.exit(1);
    }
    machine = machine.replace(before, after);
    machineChanged += 1;
  }
  fs.writeFileSync(machineFile, machine);
}

console.log(`Investigation source registry repaired: ${changed} field change(s); outage preservation patch: ${machineChanged} change(s).`);
