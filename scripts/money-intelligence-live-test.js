const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const attempts = Number(process.env.MONEY_LIVE_ATTEMPTS || 18);
const delayMs = Number(process.env.MONEY_LIVE_DELAY_MS || 5000);
const output = path.join(root, 'downloads', 'money-intelligence-live-test.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const parse = text => { try { return JSON.parse(text); } catch { return null; } };

async function request(route, binary = false) {
  const separator = route.includes('?') ? '&' : '?';
  const response = await fetch(`${siteUrl}${route}${separator}money_check=${Date.now()}`, {
    redirect: 'follow',
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'MatrixMoneyIntelligenceVerifier/1.0'
    }
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    route,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') || '',
    cacheControl: response.headers.get('cache-control') || '',
    bytes,
    text: binary ? '' : bytes.toString('utf8')
  };
}

async function verify() {
  const [home, follow, making, profile, data, pdf] = await Promise.all([
    request('/'),
    request('/follow-the-money'),
    request('/making-money'),
    request('/follow-the-money/people/elon-musk'),
    request('/data/follow-the-money-top-100.json'),
    request('/downloads/wealth-guides/start-from-zero.pdf', true)
  ]);
  const top = parse(data.text);
  const peopleCount = Array.isArray(top?.people) ? top.people.length : 0;
  const checks = [
    { id: 'homepage-follow-link', ok: home.ok && home.text.includes('follow-the-money.html') },
    { id: 'homepage-making-link', ok: home.ok && home.text.includes('making-money.html') },
    { id: 'follow-page', ok: follow.ok && follow.text.includes("World's Top 100 Wealth Holders") && follow.text.includes('follow-the-money.js') },
    { id: 'making-page', ok: making.ok && making.text.includes('Starting From Zero') && making.text.includes('Future of Making Money') && making.text.includes('Free PDF Guides') },
    { id: 'profile-page', ok: profile.ok && profile.text.includes('Elon Musk') && profile.text.includes('Estimated net worth') },
    { id: 'top100-data', ok: data.ok && peopleCount === 100 },
    { id: 'starter-pdf', ok: pdf.ok && pdf.bytes.length >= 500 && pdf.bytes.slice(0, 4).toString('binary') === '%PDF' }
  ];
  return {
    ok: checks.every(item => item.ok),
    checkedAt: new Date().toISOString(),
    siteUrl,
    peopleCount,
    checks,
    routes: [home, follow, making, profile, data, pdf].map(item => ({
      route: item.route,
      status: item.status,
      contentType: item.contentType,
      cacheControl: item.cacheControl,
      bytes: item.bytes.length
    }))
  };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verify(); }
    catch (error) { result = { ok: false, checkedAt: new Date().toISOString(), siteUrl, error: error.message, checks: [] }; }
    result.attempt = attempt;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    if (result.ok) {
      console.log(`Money intelligence live test passed on attempt ${attempt}: Top 100, Making Money, profile, data and PDF are live.`);
      return;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
})();
