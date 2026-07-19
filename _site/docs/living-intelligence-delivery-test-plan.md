# Living Intelligence Delivery Test Plan

The final build must prove:

- generic action labels never render as actor names;
- actor cards contain documented action, significance, evidence boundary and evidence route;
- clock summaries contain only score, timeframe, pressure band, title and latest movement before the closed dropdown;
- the Daily Brief form submits Daily and Weekly preferences independently;
- verification sends or safely queues today's Daily Control Brief;
- the scheduled campaign cannot duplicate that same brief for the same member and date;
- provider failures never produce a false success message;
- protected subscriber diagnostics expose preferences, segments, suppressions and delivery history only to an authenticated administrator.

The executable gate is `scripts/living-intelligence-regression-test.js`.
