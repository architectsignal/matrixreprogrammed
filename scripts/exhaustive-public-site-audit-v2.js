#!/usr/bin/env node
'use strict';

// Compatibility entrypoint retained for existing workflows. The Black File
// hero is finalized at this exact audit boundary so a late generator cannot
// conceal a missing public H1 behind earlier successful reconciliation.
require('./finalize-black-file-public-hero.js');
require('./exhaustive-public-site-audit-v3.js');
