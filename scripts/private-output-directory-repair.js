'use strict';

const fs = require('fs');
const path = require('path');

function removePrivateOutputDirectories(site, htmlRoutes) {
  const repairs = [];
  for (const relativeHtml of htmlRoutes) {
    const relativeAlias = relativeHtml.slice(0, -'.html'.length);
    const aliasDirectory = path.join(site, relativeAlias);
    if (!fs.existsSync(aliasDirectory) || !fs.statSync(aliasDirectory).isDirectory()) continue;
    fs.rmSync(aliasDirectory, { recursive: true, force: true });
    repairs.push({
      html: relativeHtml,
      directory: relativeAlias.split(path.sep).join('/'),
      repair: 'removed-private-output-directory'
    });
  }
  return repairs;
}

module.exports = { removePrivateOutputDirectories };
