const fs = require('fs');

const ignored = new Set([
  '.git', '.github', '.wrangler', 'node_modules', '_site', '.matrix-production-bin',
  'dist', 'build', 'scripts', 'tools', 'netlify', 'downloads', 'data',
  'evidence-archive', 'source-snapshots', 'browsertrix-output', 'templates'
]);
const originalReadDirectory = fs.readdirSync;
fs.readdirSync = function filteredReadDirectory(directory, options) {
  const result = originalReadDirectory.call(fs, directory, options);
  if (options && typeof options === 'object' && options.withFileTypes) {
    return result.filter(entry => !ignored.has(entry.name));
  }
  return result.filter(name => !ignored.has(String(name)));
};
try {
  require('./build-cinematic-link-structure.js');
} finally {
  fs.readdirSync = originalReadDirectory;
}
