# Matrix Reprogrammed Daily / Weekly Automation Run Guide

## What is now automated

## Daily Intel Drop

Workflow:

```text
.github/workflows/daily-intel-drop.yml
```

Runs:

- every day at 07:15 UTC
- manually from GitHub Actions

It does this:

1. Scans configured public source feeds.
2. Scores drops for Matrix Reprogrammed relevance.
3. Creates `data/latest-drop.json`.
4. Creates a dated Markdown post in `social/daily/`.
5. Updates `news.html` with the latest signal.
6. Builds the Black File PDF.
7. Runs the site audit.
8. Commits the generated files.
9. Posts the daily drop to Facebook if `META_PAGE_ID` and `META_PAGE_ACCESS_TOKEN` are present.

Manual run:

```text
GitHub repo -> Actions -> Daily Intel Drop -> Run workflow
```

The workflow has a `facebook_mode` input:

- `live` posts to Facebook
- `dry-run` prints the post package without posting

## Weekly D.O.G Video Package

Workflow:

```text
.github/workflows/weekly-dog-video.yml
```

Runs:

- every Monday at 08:30 UTC
- manually from GitHub Actions

It does this:

1. Generates a fresh Intel Drop.
2. Builds a weekly D.O.G manga-style video package.
3. Creates narration text.
4. Creates scene prompts.
5. Creates YouTube metadata.
6. Creates Facebook caption.
7. Creates a poster SVG.
8. Generates an ElevenLabs MP3 if ElevenLabs secrets exist.
9. Uploads the package as a GitHub Actions artifact.
10. Commits the package metadata to the repo.

Manual run:

```text
GitHub repo -> Actions -> Weekly D.O.G Video Package -> Run workflow
```

## Secrets currently expected

### Facebook

```text
META_PAGE_ID
META_PAGE_ACCESS_TOKEN
```

### ElevenLabs

```text
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
ELEVENLABS_MODEL_ID
```

## What is not fully automated yet

- Rendering a final MP4 from the package.
- Auto-uploading to YouTube.
- Auto-uploading to Rumble.
- Auto-posting the weekly video file to Facebook.

## Next build step

Build the MP4 renderer:

```text
latest-video-package.json + voiceover.mp3 + poster.svg/caption layers -> weekly MP4
```

Then add upload steps for:

- YouTube
- Facebook video post
- Rumble, if API/account upload access is available
