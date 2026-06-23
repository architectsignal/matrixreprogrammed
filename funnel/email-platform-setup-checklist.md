# Matrix Reprogrammed Email Platform Setup Checklist

Use this when connecting the Black File funnel to Netlify Forms, Mailchimp, Brevo, ConvertKit, or another email platform.

## 1. Form source

Primary form page:

- `black-file.html`

Form name:

- `black-file-request`

Fields:

- `name`
- `email`

Current preview download:

- `downloads/the-black-file-preview.txt`

## 2. First automation

Automation name:

- `Black File Welcome Sequence`

Trigger:

- New submission on `black-file-request`
- Or tag added: `black-file-signup`

Sequence file:

- `funnel/black-file-welcome-sequence.md`

## 3. Email timing

- Email 1: immediately
- Email 2: day 1
- Email 3: day 3
- Email 4: day 5
- Email 5: day 7

## 4. Tags to create

- `black-file-signup`
- `masonic-interest`
- `survival-war-interest`
- `dark-psychology-interest`
- `public-record-interest`
- `dog-interest`

## 5. Link tracking logic

If the platform supports link-based tagging:

- Clicks to `masonic-esoteric.html` -> `masonic-interest`
- Clicks to `survival-war.html` -> `survival-war-interest`
- Clicks to `dark-psychology.html` -> `dark-psychology-interest`
- Clicks to `public-record-dossiers.html` -> `public-record-interest`
- Clicks to `dog-the-architect.html` -> `dog-interest`

## 6. Branch follow-up sequences

Built branch sequences:

- `funnel/masonic-esoteric-followup-sequence.md`
- `funnel/survival-war-followup-sequence.md`
- `funnel/dark-psychology-followup-sequence.md`
- `funnel/public-record-dossiers-followup-sequence.md`

Still to build:

- `funnel/dog-collector-hardback-sequence.md`

## 7. Recommended automation map

- New Black File signup -> send `Black File Welcome Sequence`
- Clicks Masonic shelf -> tag `masonic-interest` -> send Masonic follow-up sequence
- Clicks Survival shelf -> tag `survival-war-interest` -> send Survival/War follow-up sequence
- Clicks Dark Psychology shelf -> tag `dark-psychology-interest` -> send Dark Psychology follow-up sequence
- Clicks Public Record shelf -> tag `public-record-interest` -> send Dossiers/Public Record follow-up sequence
- Clicks D.O.G page -> tag `dog-interest` -> send D.O.G collector sequence once built

## 8. Current status

- Black File page: built
- Black File preview download: built
- Five-email welcome sequence: written
- Four branch follow-up sequences: written
- Email platform connection: pending
- Final polished Black File PDF: pending
- D.O.G collector hardback email sequence: pending
