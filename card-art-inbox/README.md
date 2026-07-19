# Card Art Inbox

Place approved card artwork in this folder and commit it to the repository.

## Naming rule

Name the file with the card ID used by the site, for example:

- `elon-musk.webp`
- `world-health-organization.png`
- `federal-reserve.jpg`
- `blackrock.webp`

The build accepts `.webp`, `.png`, `.jpg`, `.jpeg`, and `.avif`.

The card-art resolver scans this folder and other existing image folders, matches artwork by normalized card name or ID, copies it into the correct canonical deck folder, updates the card registry, deck walls, download manifest, and dossier routes, and preserves the original source path in the audit.

Real raster artwork always takes priority over generated SVG placeholders. A placeholder is used only when no approved image can be matched.

Artwork is editorial illustration. It is not evidence and must not visually imply criminal guilt without a proven record.
