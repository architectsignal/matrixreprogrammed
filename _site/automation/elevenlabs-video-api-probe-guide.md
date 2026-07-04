# ElevenLabs Video API Probe Guide

This workflow checks whether the ElevenLabs API key already saved in GitHub can access a video/image-to-video API endpoint.

## Workflow

```text
.github/workflows/elevenlabs-video-probe.yml
```

## Safe mode: probe

Probe mode does not try to generate a video. It checks likely endpoint paths with `OPTIONS` and `GET`, then saves the results as an artifact.

Run it here:

```text
GitHub repo -> Actions -> ElevenLabs Video API Probe -> Run workflow
```

Use:

```text
probe_mode = probe
```

Leave these blank:

```text
video_endpoint
video_model_id
```

Download artifact:

```text
elevenlabs-video-api-probe
```

Look for:

```text
probe-results.md
probe-results.json
```

## Generation mode

Only use this if you have found the real endpoint from ElevenLabs documentation or Developers -> Request Log.

Run with:

```text
probe_mode = generate
video_endpoint = <endpoint from ElevenLabs request log or docs>
video_model_id = <model id if required>
```

The script sends a harmless symbolic D.O.G prompt:

```text
Dark D.O.G manga dossier style. A black dog guardian stands at the threshold of a redacted intelligence archive. Matrix rain falls behind green terminal screens. Black, green, and gold palette. Cinematic shadows. No real people. No public figures. No logos.
```

The response is saved as:

```text
generate-response.json
```

If it contains a job ID or video URL, the next step is to add a poll/download script and connect it to the weekly D.O.G workflow.

## Important

Do not paste your ElevenLabs API key into chat.

The workflow uses:

```text
ELEVENLABS_API_KEY
```

from GitHub repository secrets.
