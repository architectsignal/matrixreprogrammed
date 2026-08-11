'use strict';

function authoritativeFullProofHealthy(report) {
  const expectedSha = String(report?.expectedSha || '');
  const routes = Array.isArray(report?.routeResults) ? report.routeResults : [];
  return report?.ok === true
    && /^[a-f0-9]{40}$/i.test(expectedSha)
    && report?.mainSha === expectedSha
    && report?.mainAdvancedDuringRun === false
    && report?.manifestSha === expectedSha
    && report?.manifestIsCommitBound === true
    && report?.manifestMatchesExpected === true
    && report?.manifestMatchesCurrentMain === true
    && report?.manifestMatches === true
    && report?.healthMatches === true
    && Number(report?.manifestStatus) === 200
    && Number(report?.healthStatus) === 200
    && routes.length > 0
    && routes.every(item => item?.ok === true && Number(item?.status) >= 200 && Number(item?.status) < 400)
    && report?.paypalBoundary?.ok === true
    && report?.paypalBoundary?.anonymousChargePossible === false
    && report?.emailAutomationBoundary?.ok === true
    && report?.forumPersistence?.ok === true
    && report?.forumPersistence?.anonymousWriteRejected === true;
}

function compactUniformWaf(report) {
  const statuses = Object.values(report?.statuses || {}).map(Number);
  const failures = Array.isArray(report?.failures) ? report.failures : [];
  const cfRays = Array.isArray(report?.cfRays) ? report.cfRays.filter(Boolean) : [];
  return report?.ok === false
    && statuses.length > 0
    && statuses.every(status => status === 403)
    && failures.length > 0
    && failures.every(item => Number(item?.status) === 403 && String(item?.route || '').startsWith('/'))
    && cfRays.length > 0;
}

function supplementalFailureCanPreserveAuthoritativeSuccess(fullReport, supplementalReport) {
  return authoritativeFullProofHealthy(fullReport) && compactUniformWaf(supplementalReport);
}

module.exports = {
  authoritativeFullProofHealthy,
  compactUniformWaf,
  supplementalFailureCanPreserveAuthoritativeSuccess
};
