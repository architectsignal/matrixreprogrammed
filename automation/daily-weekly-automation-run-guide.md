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

## Weekly D.O.G Video Package + MP4 + Facebook Video

Workflow:

```text
.github/workflows/weekly-dog-video.yml
```

Runs:

- every Monday at 08:30 UTC
- manually from GitHub Actions

It does this:

1. Installs FFmpeg and SVG rendering tools.
2. Generates a fresh Intel Drop.
3. Builds a weekly D.O.G manga-style video package.
4. Creates narration text.
5. Creates scene prompts.
6. Creates YouTube metadata.
7. Creates Facebook caption.
8. Creates a poster SVG.
9. Generates an ElevenLabs MP3 if ElevenLabs secrets exist.
10. Renders a vertical 1080x1920 MP4.
11. Uploads the package and MP4 as a GitHub Actions artifact.
12. Uploads the MP4 to the Facebook Page if Meta secrets exist.
13. Commits the package metadata and MP4 files to the repo.

Manual run:

```text
GitHub repo -> Actions -> Weekly D.O.G Video Package -> Run workflow
```

The workflow has a `facebook_video_mode` input:

- `live` uploads the weekly MP4 to Facebook
- `dry-run` renders the MP4 and prints the Facebook caption without posting

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

## Generated weekly video files

Each weekly run creates a folder under:

```text
video-packages/<date-and-drop-slug>/
```

Expected files:

```text
package.md
package.json
narration.txt
poster.svg
scene-01.svg
scene-01.png
scene-02.svg
scene-02.png
scene-03.svg
scene-03.png
scene-04.svg
scene-04.png
scene-05.svg
scene-05.png
voiceover.mp3
weekly-dog-transmission.mp4
```

If ElevenLabs fails or secrets are missing, the workflow falls back to silent audio so a video can still render.

## What is not fully automated yet

- Auto-uploading to YouTube.
- Auto-uploading to Rumble.
- True AI image generation for each scene.

## Next build step

Add YouTube upload automation:

```text
weekly-dog-transmission.mp4 -> YouTube Data API upload -> title, description, tags, book links
```

Then add Rumble if API/account upload access is available.
