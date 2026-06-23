# Matrix Reprogrammed Site Build Status

## Build Mode

Current mode: **GitHub staging/build first**.  
Domain connection can be handled at the end once the site machine is strong.

## Completed

- Homepage rebuilt as a brand/sales funnel.
- Homepage cinematic `Signal Gate` added: first-landing welcome overlay with Matrix rain behind it, typed terminal intro, Enter Archive CTA, Black File CTA, skip option, replay button, and localStorage memory so repeat visitors are not blocked.
- Matrix rain preserved and moved into reusable `matrix.js`.
- Matrix rain upgraded with sharper glow, high-DPI canvas handling, smoother animation, gold signal flickers, and reduced-motion support.
- Shared elite dark styling added in `styles.css`: premium glass panels, serif hero typography, pill navigation, stronger cards, better buttons, forms, mobile responsiveness, gold/green highlights, and system-wide visual consistency.
- Old duplicate inline Matrix scripts removed from key legacy pages and replaced with the shared `matrix.js` engine.
- Public QA pressure pass completed across homepage, archive, Black File, Intel Desk, Video Drops, Rumble, Codex, Podcast, Members, Contact, shelf pages, legacy redirect, and key book landing pages.
- Public author-facing/build-note copy removed: build-status language, form setup language, KDP extraction notes, placeholder language, internal funnel links, and marketing jargon such as lead-magnet wording.
- `scripts/audit-site.js` added to check internal links/assets and banned public-facing build-note phrases.
- Site QA GitHub Actions workflow added.
- Netlify build now runs Black File PDF generation and the site audit before deploy.
- Book archive upgraded with ASIN doors and CollectionPage schema.
- Nine dedicated book landing pages created from priority archive titles.
- Four reader pathway shelves created: Masonic & Esoteric, Survival & War, Dark Psychology, and Dossiers & Public Record.
- D.O.G The Architect upgraded as the flagship premium occult masterwork page.
- Black File upgraded as the gateway file and email-capture page.
- Black File branded PDF added and generated during Netlify deploy.
- Black File preview text retained as backup.
- Black File welcome sequence written.
- Four shelf branch email sequences written.
- D.O.G collector hardback email sequence written.
- Funnel master plan and internal `funnel-map.html` created.
- Signal Intel Desk added for wars, declassified files, elite networks, court records, WikiLeaks/archive drops, sanctions, surveillance, censorship, organized crime/state overlap, and public-record corruption.
- Intel Desk upgraded into a short-bulletin page with Latest 7 Days framing, source-hub categories, trafficking/exploitation source rules, and seven-day live bulletin retention.
- Intel Bulletin Archive page added at `intel-archive.html`.
- `scripts/build-intel-archive-page.js` added to rebuild the archive page from saved source drops.
- Daily Intel Drop workflow now updates `news.html`, rebuilds `intel-archive.html`, runs the site audit, commits the generated files, and can post to Facebook when Meta secrets exist.
- Daily Intel Drop automation added: source scan, scoring, latest drop JSON, social post Markdown, `news.html` update, archive page build, site audit, commit, and Facebook Page post when Meta secrets exist.
- Weekly D.O.G video automation added: source-led package, dark D.O.G manga scene prompts/cards, ElevenLabs narration, vertical MP4 rendering, artifact upload, commit, and Facebook Page video upload when Meta secrets exist.
- Human Cost evidence panel added with sourced/statistical framing and no fake live counter.
- Signal Video Drops page added for video dispatches, Rumble routes, source-led explainers, and book trailers.
- Rumble Channel Network added with links for `VVaccines`, `Vcabal`, `VPlandemics`, `V5G`, and `V2030`.
- ElevenLabs GitHub Actions voice-test workflow added.
- `robots.txt` added.
- `sitemap.xml` added and includes the Intel Bulletin Archive.
- `netlify.toml` added with static publish settings, security headers, clean redirects, Black File PDF generation, and site audit.
- Daily Signal Intel Desk automation scheduled.

## Current Core Pages

- `index.html` — homepage / main funnel with Signal Gate welcome overlay
- `books.html` — archive and Amazon ASIN doors
- `news.html` — Signal Intel Desk / Latest 7 Days bulletin page
- `intel-archive.html` — older source-led Intel Bulletin Archive
- `videos.html` — video drops and Rumble route page
- `black-file.html` — gateway file and email capture page
- `dog-the-architect.html` — premium flagship page
- `intelligence-dossiers.html` — intelligence series page
- `crime-dossiers.html` — crime series page
- `masonic-esoteric.html` — masonic/esoteric series page
- `survival-war.html` — survival and war shelf page
- `dark-psychology.html` — dark psychology shelf page
- `public-record-dossiers.html` — dossiers and public record shelf page
- `codex.html` — symbolic codex page
- `transmissions.html` — Rumble channel network / video pathway
- `podcast.html` — audio pathway
- `members.html` — contact/follow signal page
- `contact.html` — contact page
- `funnel-map.html` — internal noindex funnel review page

## Rumble Channels Added

- `https://rumble.com/c/VVaccines`
- `https://rumble.com/c/Vcabal`
- `https://rumble.com/c/VPlandemics`
- `https://rumble.com/c/V5G`
- `https://rumble.com/c/V2030`

## Automation Workflows

- `.github/workflows/daily-intel-drop.yml` — daily source-led site update, archive page rebuild, site audit, and Facebook post.
- `.github/workflows/weekly-dog-video.yml` — weekly D.O.G-style MP4 render and Facebook video upload.
- `.github/workflows/elevenlabs-voice-test.yml` — manual ElevenLabs voice test.
- `.github/workflows/site-qa.yml` — site audit.
- `.github/workflows/link-audit.yml` — internal link audit.

## Next Best Upgrades

1. Run `Daily Intel Drop` in dry-run/manual mode first, then live if it passes.
2. Add category filter buttons to `intel-archive.html`.
3. Add analytics and conversion tracking.
4. Connect Netlify Forms to an email platform.
5. Add YouTube upload automation.
6. Add Rumble upload automation if account/API upload access is available.
7. Add true AI image generation for each weekly D.O.G scene if an approved image/video generation API is connected.

## Evidence Rules For Intel Desk

- No unsupported allegations.
- No fake client-list claims.
- No private victim names.
- No screenshots as proof.
- Every item must be sourced or labeled Not Verified.
- Use labels: Confirmed, Developing, Declassified, Court Record, Archive Drop, Intelligence Watch, War File, Elite Network, Trafficking Watch, Crime-State Overlap, Not Verified.
- Live bulletins older than seven days are removed from the live Intel Desk and preserved through archive generation where available.
