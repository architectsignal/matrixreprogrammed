async function main() {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const mode = (process.env.FACEBOOK_PAGE_UPDATE_MODE || 'live').toLowerCase();

  const link = process.env.FACEBOOK_PAGE_UPDATE_LINK || 'https://matrixreprogrammed.com/';
  const message = [
    'MATRIX REPROGRAMMED is live.',
    '',
    'A dark archive for people who know the headline is never the whole machine.',
    '',
    'Inside the signal:',
    '• books and public-record dossiers',
    '• the Signal Intel Desk',
    '• declassified files and archive drops',
    '• D.O.G The Architect',
    '• Masonic and esoteric symbolism',
    '• survival, war, dark psychology and hidden-system analysis',
    '',
    'The truth is not hidden.',
    'It is encoded.',
    '',
    'Enter the archive:',
    link,
    '',
    '#MatrixReprogrammed #BlackFile #DOGTheArchitect #IntelDesk #PublicRecord #HiddenSystems'
  ].join('\n');

  if (!pageId || !token) {
    console.log('Facebook secrets missing. Required: META_PAGE_ID and META_PAGE_ACCESS_TOKEN.');
    return;
  }

  if (mode === 'dry-run') {
    console.log('FACEBOOK PAGE UPDATE DRY RUN');
    console.log(`Page ID: ${pageId}`);
    console.log(message);
    return;
  }

  const endpoint = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/feed`;
  const body = new URLSearchParams({
    access_token: token,
    message,
    link
  });

  const res = await fetch(endpoint, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const safe = JSON.stringify(json).replace(token, '[REDACTED]');
    throw new Error(`Facebook page update failed: HTTP ${res.status} ${safe}`);
  }

  console.log(`Facebook page update posted: ${json.id || 'unknown-id'}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
