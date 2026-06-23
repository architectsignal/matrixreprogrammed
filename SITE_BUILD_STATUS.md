# Matrix Reprogrammed Site Build Status

## Build Mode

Current mode: **GitHub staging/build first**.  
Domain connection can be handled at the end once the site machine is strong.

## Completed

- Homepage rebuilt as a brand/sales funnel.
- Homepage cinematic `Signal Gate` added: first-landing welcome overlay with Matrix rain behind it, typed terminal intro, Enter Archive CTA, Black File CTA, skip option, replay button, and localStorage memory so repeat visitors are not blocked.
- Homepage is now database-driven through `scripts/build-homepage.js` and pulls featured books and reader pathways from `data/books.json`.
- Matrix rain preserved and moved into reusable `matrix.js`.
- Matrix rain upgraded with sharper glow, high-DPI canvas handling, smoother animation, gold signal flickers, and reduced-motion support.
- Shared elite dark styling added in `styles.css`: premium glass panels, serif hero typography, pill navigation, stronger cards, better buttons, forms, mobile responsiveness, gold/green highlights, and system-wide visual consistency.
- Old duplicate inline Matrix scripts removed from key legacy pages and replaced with the shared `matrix.js` engine.
- Public QA pressure pass completed across homepage, archive, Black File, Intel Desk, Video Drops, Rumble, Codex, Podcast, Members, Contact, shelf pages, legacy redirect, and key book landing pages.
- Public author-facing/build-note copy removed: build-status language, form setup language, KDP extraction notes, placeholder language, internal funnel links, and marketing jargon such as lead-magnet wording.
- `scripts/audit-site.js` added to check internal links/assets and banned public-facing build-note phrases.
- Site QA GitHub Actions workflow added.
- Netlify build now runs book generation, homepage generation, analytics injection, Black File PDF generation, and the site audit before deploy.
- Central book database added at `data/books.json`.
- Book Archive page is now generated from `data/books.json` through `scripts/build-book-system.js`.
- Generated book pages, Start Here, Search, search index, and Book Archive are all rebuilt from the book database.
- Book archive includes unconfirmed ASIN doors as a temporary mapping section until exact final titles are confirmed.
- Deep Site Pressure Test workflow added and triggered for live deploy verification.

## Last maintenance trigger

- 2026-06-23: Triggered Deep Site Pressure Test after adding live smoke/deep test workflows.
