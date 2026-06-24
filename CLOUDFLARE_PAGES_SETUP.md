# Cloudflare Pages Setup — Matrix Reprogrammed

This repo is now prepared for Cloudflare Pages while keeping Netlify compatibility.

## Recommended Cloudflare Pages settings

Use these settings when creating the Pages project:

- Project type: Pages
- Connect to Git: `architectsignal/matrixreprogrammed`
- Production branch: `main`
- Framework preset: None / Static HTML
- Build command: `npm run build`
- Build output directory: `.`
- Root directory: `/`
- Node version: `22`

## Files added for Cloudflare

- `_redirects` — Cloudflare route map converted from Netlify redirects.
- `_headers` — Cloudflare headers for security and downloadable files.

Cloudflare Pages reads these files from the published output directory. Because the site publishes from the repo root, they live in the repo root.

## Weekly updates

The weekly Live Intel workflow remains in GitHub Actions. The intended flow is:

1. GitHub Action scans weekly.
2. It updates `data/live-intel.json` only if meaningful items change.
3. It commits changed data/reports.
4. Cloudflare Pages rebuilds from GitHub.

This avoids constant deploys.

## Migration checklist

After connecting Cloudflare Pages:

1. Confirm the Pages deploy succeeds.
2. Open `/live-intel`, `/epstein`, `/books`, `/amazon-store`, `/rss`, `/download-center`, `/evidence-vault`, and `/search`.
3. Confirm JSON/Markdown/PDF downloads keep the correct content type.
4. Add the custom domain in Cloudflare Pages.
5. Keep Netlify as backup until Cloudflare has passed a full smoke test.

## Important boundaries

- Netlify uses `netlify.toml`.
- Cloudflare Pages uses `_redirects` and `_headers`.
- Keep both while running both platforms.
- Do not put Cloudflare API tokens directly into this repo.
