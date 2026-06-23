# ElevenLabs Voice Test — Run Guide

This guide tests that the GitHub secrets are connected without exposing the API key.

## Required secrets

In GitHub repo settings:

```text
Settings -> Secrets and variables -> Actions -> Repository secrets
```

Required:

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`

Optional:

- `ELEVENLABS_MODEL_ID`

Recommended model value:

- `eleven_multilingual_v2`

## Workflow added

```text
.github/workflows/elevenlabs-voice-test.yml
```

## Script added

```text
scripts/test-elevenlabs-voice.js
```

## How to run the test

1. Open the GitHub repo:

```text
https://github.com/architectsignal/matrixreprogrammed
```

2. Click **Actions**.
3. In the left sidebar, click **ElevenLabs Voice Test**.
4. Click **Run workflow**.
5. Leave branch as `main`.
6. Click the green **Run workflow** button.
7. Wait for the run to finish.
8. Open the completed run.
9. Scroll to **Artifacts**.
10. Download:

```text
elevenlabs-voice-test-audio
```

The ZIP should contain:

```text
matrix-reprogrammed-elevenlabs-test.mp3
```

## Expected spoken line

```text
Matrix Reprogrammed signal test. The truth is not hidden. It is encoded. This voice is now connected to the archive.
```

## Safety notes

- The workflow does not print the API key.
- The workflow does not commit generated audio to the repo.
- The artifact expires after 7 days.
- The workflow only runs manually.
- Running the workflow may use a small amount of ElevenLabs credits.

## If it fails

Common causes:

- `ELEVENLABS_API_KEY` missing or pasted incorrectly.
- `ELEVENLABS_VOICE_ID` missing or pasted incorrectly.
- Voice does not belong to the workspace/account for that API key.
- ElevenLabs credits exhausted.
- Model ID invalid or unavailable on the plan.

Check the Actions log for the HTTP error message. It should not reveal your secret.
