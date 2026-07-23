'use strict';

const releaseAudit = Object.freeze({
  requestedAt: '2026-07-23',
  purpose: 'Isolated full-system predeployment audit for the professional GoFundMe, GPU infrastructure banner and all current site upgrades.',
  deploymentBoundary: 'No production deployment is authorized by this marker. Deployment remains separately gated after all local release checks pass.'
});

if (!releaseAudit.purpose.includes('full-system predeployment audit')) {
  throw new Error('Release audit marker is invalid');
}

module.exports = releaseAudit;
