# Matrix Reprogrammed Internal Analytics Email Setup

## What this system tracks

The site now has its own internal analytics layer. It tracks:

- page views
- Amazon clicks
- Rumble clicks
- Black File clicks
- Book Archive clicks
- Intel Desk clicks
- D.O.G page clicks
- form submissions
- top click targets
- top routes

No Google Analytics is required.

## How it works

1. `analytics.js` watches public site clicks and form submissions.
2. Events are sent to `/.netlify/functions/track-event`.
3. `track-event.js` stores events in Netlify Blobs by date.
4. `send-analytics-report.js` creates a daily summary email.
5. If email secrets are missing, the report is printed to Netlify logs instead.

## Required Netlify environment variables

Add these in Netlify:

Site configuration → Environment variables

```text
RESEND_API_KEY=your_resend_api_key
ANALYTICS_EMAIL_TO=your@email.com
ANALYTICS_EMAIL_FROM=Matrix Reprogrammed <reports@yourdomain.com>
ANALYTICS_REPORT_SECRET=make-a-long-private-secret
```

`ANALYTICS_EMAIL_FROM` can use Resend's test sender at first, but a verified domain sender is better before launch.

## Daily report

The function is scheduled to run daily at approximately 08:05 UTC and reports on the previous UTC day.

## Manual report trigger

After deploy, visit this URL with your secret:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/send-analytics-report?manual=1&secret=YOUR_SECRET
```

Optional date override:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/send-analytics-report?manual=1&secret=YOUR_SECRET&date=2026-06-23
```

## Reading the report

- Amazon clicks = buyer intent.
- Black File clicks/forms = email list intent.
- Intel Desk clicks = content-interest signal.
- Rumble clicks = audience migration signal.
- Top routes show which parts of the archive are pulling attention.

## Privacy rule

This internal system stores event type, page, route, link target, referrer, and user-agent. It does not ask for private personal data and should not be used to identify individuals.
