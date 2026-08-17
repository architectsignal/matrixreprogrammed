'use strict';

const {
  EVIDENCE_CLASSES,
  PUBLICATION_MODES,
  SENSITIVITY,
} = require('./constants');

class PublicationGate {
  constructor(options = {}) {
    this.mode = options.mode || PUBLICATION_MODES.DISABLED;
    if (!Object.values(PUBLICATION_MODES).includes(this.mode)) {
      throw new TypeError(`Invalid publication mode: ${this.mode}`);
    }
  }

  evaluate(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      return { allowed: false, code: 'invalid_candidate', reason: 'Candidate must be an object' };
    }

    if (this.mode === PUBLICATION_MODES.DISABLED) {
      return { allowed: false, code: 'publication_disabled', reason: 'Phase 1 publication is disabled' };
    }

    if (candidate.humanApproved !== true) {
      return { allowed: false, code: 'human_review_required', reason: 'Human approval is required' };
    }

    if (!candidate.provenance || !Array.isArray(candidate.provenance) || candidate.provenance.length === 0) {
      return { allowed: false, code: 'missing_provenance', reason: 'At least one source locator is required' };
    }

    if ([EVIDENCE_CLASSES.ALLEGATION, EVIDENCE_CLASSES.INFERENCE, EVIDENCE_CLASSES.SPECULATION]
      .includes(candidate.evidenceClass) && candidate.languageReviewed !== true) {
      return { allowed: false, code: 'sensitive_language_review_required', reason: 'Qualified language must be reviewed' };
    }

    if ([SENSITIVITY.HIGH, SENSITIVITY.CRITICAL].includes(candidate.sensitivity)
      && candidate.editorialApproval !== true) {
      return { allowed: false, code: 'editorial_approval_required', reason: 'Editorial approval is required' };
    }

    return {
      allowed: true,
      code: 'approved_for_handoff',
      reason: 'Candidate may be handed to the existing controlled publication pipeline',
    };
  }
}

module.exports = { PublicationGate };
