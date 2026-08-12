'use strict';

(async () => {
  await require('./production-daily-deploy-guard.js').runGuard();
  require('./patch-newsletter-public-page.js');
  require('./patch-power-family-public-gateways.js');
  require('./behind-the-curtain-production-guard-v2.js');
  require('./ensure-search-query-handoff.js').ensureSearchQueryHandoff();
  require('./inject-daily-watch-surfaces.js');
  require('./sync-cloudflare-homepage-routes.js');
  require('./search-first-accountability-home-pressure-test.js');
  require('./mission-orchestration-audit.js');
})().catch(error => {
  console.error(`BEHIND THE CURTAIN PRODUCTION GUARD FAILED: ${error.stack || error.message || error}`);
  process.exit(1);
});
