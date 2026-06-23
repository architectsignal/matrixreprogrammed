const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outDir = path.join(root, 'artifacts', 'elevenlabs-video-probe');
const diagnosticsDir = path.join(root, 'diagnostics', 'elevenlabs-video-probe');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(diagnosticsDir, { recursive: true });

const apiKey = process.env.ELEVENLABS_API_KEY;
const explicitEndpoint = process.env.ELEVENLABS_VIDEO_ENDPOINT;
const mode = (process.env.ELEVENLABS_VIDEO_PROBE_MODE || 'probe').toLowerCase();

const prompt = [
  'Dark D.O.G manga dossier style.',
  'A black dog guardian stands at the threshold of a redacted intelligence archive.',
  'Matrix rain falls behind green terminal screens.',
  'Black, green, and gold palette. Cinematic shadows. No real people. No public figures. No logos.'
].join(' ');

const candidateEndpoints = [
  'https://api.elevenlabs.io/v1/videos',
  'https://api.elevenlabs.io/v1/video',
  'https://api.elevenlabs.io/v1/image-to-video',
  'https://api.elevenlabs.io/v1/image-to-video/generate',
  'https://api.elevenlabs.io/v1/text-to-video',
  'https://api.elevenlabs.io/v1/generation/video',
  'https://api.elevenlabs.io/v1/studio/video',
  'https://api.elevenlabs.io/v1/creative/video'
];

function writeBoth(filename, content) {
  fs.writeFileSync(path.join(outDir, filename), content);
  fs.writeFileSync(path.join(diagnosticsDir, filename), content);
}

async function request(method, url, options = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'xi-api-key': apiKey,
      'Accept': 'application/json',
      ...(options.headers || {})
    },
    body: options.body
  });
  const contentType = res.headers.get('content-type') || '';
  let body;
  if (contentType.includes('application/json')) body = await res.json().catch(() => ({}));
  else body = await res.text().catch(() => '');
  return { status: res.status, contentType, body };
}

async function probeOnly() {
  const rows = [];
  for (const endpoint of candidateEndpoints) {
    for (const method of ['OPTIONS', 'GET']) {
      try {
        const result = await request(method, endpoint);
        rows.push({ endpoint, method, status: result.status, contentType: result.contentType, bodyPreview: JSON.stringify(result.body).slice(0, 500) });
      } catch (err) {
        rows.push({ endpoint, method, error: err.message });
      }
    }
  }
  const json = JSON.stringify(rows, null, 2);
  const md = [
    '# ElevenLabs Video API Probe Results',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'No secret values are printed here. The probe only records endpoint, method, HTTP status, content type, and a short response preview.',
    '',
    ...rows.map(r => `## ${r.method} ${r.endpoint}\n\nStatus: ${r.status || 'ERR'}\n\nContent-Type: ${r.contentType || 'n/a'}\n\n\`\`\`text\n${r.bodyPreview || r.error || ''}\n\`\`\``)
  ].join('\n\n');
  writeBoth('probe-results.json', json);
  writeBoth('probe-results.md', md);
  console.log('ElevenLabs video API probe complete. No video generation was attempted.');
  console.log(`Results written to ${outDir} and ${diagnosticsDir}`);
}

async function generateWithExplicitEndpoint() {
  if (!explicitEndpoint) throw new Error('ELEVENLABS_VIDEO_ENDPOINT is required for generate mode.');
  const payload = {
    prompt,
    duration_seconds: 5,
    aspect_ratio: '9:16',
    resolution: '720p',
    model_id: process.env.ELEVENLABS_VIDEO_MODEL_ID || 'default'
  };
  const result = await request('POST', explicitEndpoint, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = JSON.stringify(result, null, 2);
  writeBoth('generate-response.json', json);
  console.log(`Explicit endpoint generation attempted: ${explicitEndpoint}`);
  console.log(`Status: ${result.status}`);
  console.log('Response saved as artifact and diagnostics file. If it contains a video/job ID, the next script can poll/download it.');
}

async function main() {
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY secret.');
  if (mode === 'generate') await generateWithExplicitEndpoint();
  else await probeOnly();
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
