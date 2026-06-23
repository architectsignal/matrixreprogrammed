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

## 6. Follow-up sequences to build next

- Masonic & Esoteric shelf sequence
- Survival & War shelf sequence
- Dark Psychology shelf sequence
- Dossiers & Public Record shelf sequence
- D.O.G collector hardback sequence

## 7. Current status

- Black File page: built
- Black File preview download: built
- Five-email welcome sequence: written
- Email platform connection: pending
- Final polished Black File PDF: pending
