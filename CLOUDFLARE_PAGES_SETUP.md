# Cloudflare Deployment Setup — Matrix Reprogrammed

This repo is configured for the production path that preserves the persistent Signal Board:

- Cloudflare Worker: `src/worker.js`
- Bundled static assets: `_site`
- KV persistence binding: `FORUM_POSTS`
- Production workflow: `.github/workflows/deploy.yml`

## Production path

Use the guarded GitHub Actions deployment path:

1. Push to `main`.
2. GitHub Actions runs `npm install --no-audit --no-fund`.
3. GitHub Actions runs `npm run build`.
4. The build creates `_site` with deployable public assets only.
5. GitHub Actions runs `node scripts/production-deploy-guard.js`.
6. If guards pass, GitHub Actions runs `npx wrangler@latest deploy`.

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` if your Cloudflare account setup requires it

The deploy workflow intentionally fails if the Cloudflare API token is missing. A silent non-deploy is worse than a loud failed deploy.

## Forum persistence boundary

The forum must remain on Worker + KV, not a static-only Pages deploy.

Required persistence pieces:

- `wrangler.toml` keeps `binding = "FORUM_POSTS"`.
- `wrangler.toml` points assets to `./_site`.
- `src/worker.js` handles `/forum-health`, `/forum-feed-main`, `/forum-feed-speculation`, `/forum-feed-epstein-alive`, `/submit-main-post`, `/submit-speculation-post`, `/submit-epstein-alive-post`, report routes, and forum JSON/Markdown exports.
- `forum.js` refuses non-persistent saves.

Do not replace the Worker deployment with a static-only Pages deployment unless the forum persistence architecture is rebuilt first.

## Why `_site` is required

Cloudflare failed when deploy tooling tried to upload the whole repository root. That included large tooling files and non-public source folders. The safe build ends with:

```bash
node scripts/build-cloudflare-output.js
```

That script copies only deployable site files into `_site` and excludes:

- `node_modules`
- `.git`
- `.github`
- `scripts`
- `netlify`
- package/build tooling files

## Guarded deploy checks

`node scripts/production-deploy-guard.js` blocks deployment if any of these fail:

- homepage or Amazon Store still leak old compatibility marker text
- Amazon Store fallback catalogue is missing
- Amazon catalogue JSON is missing or too small
- `_site` deploy output is incomplete
- Worker-first asset mode is missing
- `FORUM_POSTS` KV binding is missing
- persistent forum feed/submit/report routes are missing
- `_site/_redirects` is present, which breaks Worker asset deployment validation

## Netlify compatibility

Netlify files may remain as backup, but production for the live forum-backed site should be Worker + assets + KV.

- Netlify uses `netlify.toml`.
- Cloudflare Worker deployment uses `wrangler.toml` and `_site`.
- Do not put Cloudflare API tokens directly into this repo.
