const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'data', 'investigation-source-registry.json');
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
console.log(`Investigation source registry repaired: ${changed} field change(s).`);
