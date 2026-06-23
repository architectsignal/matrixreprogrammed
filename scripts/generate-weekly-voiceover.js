const fs = require('fs');
const path = require('path');

const root = process.cwd();
const packagePath = path.join(root, 'data', 'latest-video-package.json');

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

  if (!fs.existsSync(packagePath)) throw new Error('Missing data/latest-video-package.json. Run build-weekly-dog-video-package first.');
  const pack = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const outDir = path.join(root, 'video-packages', pack.slug);
  fs.mkdirSync(outDir, { recursive: true });

  if (!apiKey || !voiceId) {
    console.log('ElevenLabs secrets missing. Voiceover skipped.');
    return;
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: pack.narration,
      model_id: modelId,
      voice_settings: {
        stability: 0.38,
        similarity_boost: 0.82,
        style: 0.45,
        use_speaker_boost: true
      }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unable to read error body');
    throw new Error(`ElevenLabs voiceover failed: HTTP ${res.status} ${body.slice(0, 500)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const outFile = path.join(outDir, 'voiceover.mp3');
  fs.writeFileSync(outFile, buffer);
  console.log(`Voiceover generated: ${outFile}`);
  console.log(`Audio bytes: ${buffer.length}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
