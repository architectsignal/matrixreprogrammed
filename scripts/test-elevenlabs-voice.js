const fs = require('fs');
const path = require('path');

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY secret.');
  if (!voiceId) throw new Error('Missing ELEVENLABS_VOICE_ID secret.');

  const outDir = path.join(process.cwd(), 'artifacts');
  const outFile = path.join(outDir, 'matrix-reprogrammed-elevenlabs-test.mp3');
  fs.mkdirSync(outDir, { recursive: true });

  const sampleText = [
    'Matrix Reprogrammed signal test.',
    'The truth is not hidden. It is encoded.',
    'This voice is now connected to the archive.'
  ].join(' ');

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: sampleText,
      model_id: modelId,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.82,
        style: 0.35,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read error body');
    throw new Error(`ElevenLabs request failed with HTTP ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000) throw new Error('Generated audio file is unexpectedly small.');
  fs.writeFileSync(outFile, buffer);

  console.log(`ElevenLabs voice test generated: ${outFile}`);
  console.log(`Audio bytes: ${buffer.length}`);
  console.log('No API key or secret values were printed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
