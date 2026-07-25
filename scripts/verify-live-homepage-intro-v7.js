const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const attempts = Number(process.env.INTRO_VERIFY_ATTEMPTS || 30);
const delayMs = Number(process.env.INTRO_VERIFY_DELAY_MS || 5000);
const version = '20260725-video-v7';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function packagedBytes() {
  const file = path.join(dataDir, 'homepage-intro-packaged-bytes.txt');
  if (!fs.existsSync(file)) return 0;
  return Number(fs.readFileSync(file, 'utf8')) || 0;
}

async function request(route, options = {}) {
  const join = route.includes('?') ? '&' : '?';
  const url = `${siteUrl}${route}${join}verify=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      method: options.method || 'GET',
      headers: {
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'Matrix-Homepage-Intro-Verifier/7.0',
        ...(options.headers || {})
      }
    });
    const body = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      url,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      error: ''
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      headers: {},
      body: Buffer.alloc(0),
      error: String(error?.message || error)
    };
  }
}

function header(response, name) {
  return String(response.headers[String(name).toLowerCase()] || response.headers[name] || '');
}

function selectedHeaders(response) {
  const allowed = new Set([
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'cache-control',
    'cf-ray',
    'x-matrix-intro-source',
    'x-matrix-intro-version',
    'x-matrix-origin'
  ]);
  return Object.fromEntries(Object.entries(response.headers).filter(([key]) => allowed.has(key.toLowerCase())));
}

async function verifyOnce(attempt) {
  const [home, runtime, mp4, range] = await Promise.all([
    request('/?intro=1'),
    request(`/homepage-intro-direct-v7.js?v=${version}`),
    request(`/_matrix-intro.mp4?v=${version}`),
    request(`/_matrix-intro.mp4?v=${version}`, { headers: { range: 'bytes=0-99' } })
  ]);

  const homeText = home.body.toString('utf8');
  const runtimeText = runtime.body.toString('utf8');
  const expectedBytes = packagedBytes();
  const checks = {
    homeStatus: home.status === 200,
    homeOverlay: homeText.includes('data-homepage-intro-v6') || homeText.includes('homepage-intro-v6'),
    homeRuntime: homeText.includes('homepage-intro-direct-v7.js') || homeText.includes('homepage-intro-hotfix-v6.js'),
    runtimeStatus: runtime.status === 200,
    runtimeJavascript: header(runtime, 'content-type').toLowerCase().includes('javascript'),
    runtimeVersion: runtimeText.includes('matrix-homepage-intro-seen-v7'),
    runtimeDirectMp4: runtimeText.includes('/_matrix-intro.mp4?v='),
    mp4Status: mp4.status === 200,
    mp4ContentType: header(mp4, 'content-type').toLowerCase().startsWith('video/mp4'),
    mp4Source: header(mp4, 'x-matrix-intro-source') === 'worker-bundled-mp4',
    mp4Version: header(mp4, 'x-matrix-intro-version') === version,
    mp4Length: mp4.body.length === expectedBytes && mp4.body.length > 10000,
    mp4Ftyp: mp4.body.length >= 8 && mp4.body.subarray(4, 8).toString('ascii') === 'ftyp',
    rangeStatus: range.status === 206,
    rangeHeader: /^bytes 0-99\/\d+$/.test(header(range, 'content-range')),
    rangeLength: range.body.length === 100,
    rangeSource: header(range, 'x-matrix-intro-source') === 'worker-bundled-mp4'
  };

  const result = {
    ok: Object.values(checks).every(Boolean),
    attempt,
    checkedAt: new Date().toISOString(),
    siteUrl,
    version,
    packagedBytes: expectedBytes,
    liveBytes: mp4.body.length,
    rangeBytes: range.body.length,
    checks,
    responses: {
      home: { status: home.status, url: home.url, bytes: home.body.length, headers: selectedHeaders(home), error: home.error },
      runtime: { status: runtime.status, url: runtime.url, bytes: runtime.body.length, headers: selectedHeaders(runtime), error: runtime.error },
      mp4: { status: mp4.status, url: mp4.url, bytes: mp4.body.length, headers: selectedHeaders(mp4), signature: mp4.body.subarray(0, 12).toString('hex'), error: mp4.error },
      range: { status: range.status, url: range.url, bytes: range.body.length, headers: selectedHeaders(range), signature: range.body.subarray(0, 12).toString('hex'), error: range.error }
    }
  };

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'homepage-intro-live-diagnostics.json'), JSON.stringify(result, null, 2));
  return result;
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await verifyOnce(attempt);
    if (result.ok) {
      fs.writeFileSync(path.join(dataDir, 'homepage-intro-live-bytes.txt'), String(result.liveBytes));
      console.log(`VERIFIED: homepage intro v7 is live as a ${result.liveBytes}-byte direct MP4 with Range support.`);
      return;
    }
    console.warn(`Homepage intro v7 verification attempt ${attempt} failed:`, JSON.stringify(result.checks));
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error('Homepage intro v7 verification failed:', JSON.stringify(result, null, 2));
  process.exit(1);
})().catch(error => {
  console.error('Homepage intro v7 verifier crashed:', error);
  process.exit(1);
});
