function matrixCardForumMount(targetId, opts = {}) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const deckId = opts.deckId || new URLSearchParams(location.search).get('deck') || 'unknown-deck';
  const cardId = opts.cardId || new URLSearchParams(location.search).get('card') || document.body.dataset.cardId || 'unknown-card';
  const cardName = opts.cardName || document.querySelector('h1')?.textContent?.trim() || cardId;
  target.innerHTML = `
    <section class="card-intel-forum" style="border:1px solid rgba(216,181,106,.35);border-radius:24px;padding:1rem;background:linear-gradient(150deg,rgba(18,8,0,.96),rgba(0,0,0,.94));margin-top:1.5rem">
      <div class="eyebrow">Card Intelligence Forum · Evidence Intake</div>
      <h2>Submit source intelligence for this card</h2>
      <p class="lead">Add public-source links, corrections, timeline notes, relationship leads, missing records, counter-evidence or artwork corrections for <strong>${escapeHtml(cardName)}</strong>.</p>
      <p><strong>Boundary:</strong> submissions are leads, not verified claims. A source must be reviewed, evidence-rated and cross-checked before it changes a dossier, score, card route or conclusion.</p>
      <form id="card-intel-form" class="grid" method="post" action="/submit-forum-post">
        <input type="hidden" name="board" value="main" />
        <input type="hidden" name="category" value="Card Evidence Lead" />
        <input type="hidden" name="deckId" value="${escapeHtml(deckId)}" />
        <input type="hidden" name="cardId" value="${escapeHtml(cardId)}" />
        <input type="hidden" name="cardName" value="${escapeHtml(cardName)}" />
        <input type="hidden" name="title" value="Card Evidence Lead: ${escapeHtml(cardName)}" />
        <label>Submission type<br/><select name="submissionType" required><option value="source link">Source link</option><option value="primary document">Primary document</option><option value="official page">Official page</option><option value="public database">Public database</option><option value="timeline note">Timeline note</option><option value="relationship lead">Relationship lead</option><option value="correction request">Correction request</option><option value="counter-evidence">Counter-evidence</option><option value="missing record">Missing record</option><option value="broken link report">Broken link report</option><option value="artwork correction">Artwork correction</option></select></label>
        <label>Source type<br/><select name="sourceType" required><option value="official record">Official record</option><option value="public filing">Public filing</option><option value="court or regulator document">Court / regulator document</option><option value="archive page">Archive page</option><option value="reliable report">Reliable report</option><option value="speech or interview">Speech / interview</option><option value="dataset">Dataset</option><option value="correction or counter-source">Correction / counter-source</option><option value="lead only">Lead only / needs verification</option></select></label>
        <label>Evidence level<br/><select name="evidenceLevel" required><option value="1 lead">1 · Lead</option><option value="2 public mention">2 · Public mention</option><option value="3 primary source">3 · Primary source</option><option value="4 implementation record">4 · Implementation record</option><option value="5 convergence signal">5 · Convergence signal</option><option value="6 lock-in signal">6 · Lock-in signal</option></select></label>
        <label>Source URL<br/><input name="sourceUrl" type="url" placeholder="https://..." /></label>
        <label>Short label<br/><input name="leadTitle" type="text" maxlength="140" placeholder="What is this lead?" required /></label>
        <label>Date / year on source<br/><input name="sourceDate" type="text" maxlength="60" placeholder="2026-07-08, 2025, unknown" /></label>
        <label>Jurisdiction / institution<br/><input name="jurisdiction" type="text" maxlength="120" placeholder="EU, WHO, ECB, US court, company, etc." /></label>
        <label style="grid-column:1/-1">What the source shows<br/><textarea name="shows" rows="4" maxlength="1200" placeholder="State exactly what the source supports. Do not infer beyond it." required></textarea></label>
        <label style="grid-column:1/-1">What the source does NOT show<br/><textarea name="doesNotShow" rows="3" maxlength="900" placeholder="State the boundary: what this source does not prove." required></textarea></label>
        <label style="grid-column:1/-1">Suggested site route / affected section<br/><input name="affectedRoute" type="text" maxlength="220" placeholder="card dossier, risk clock, policy lane, missing record, brief, source ledger..." /></label>
        <label style="grid-column:1/-1">Missing record or next source needed<br/><textarea name="missingRecord" rows="3" maxlength="900" placeholder="What document would confirm, correct, downgrade or strengthen this lead?"></textarea></label>
        <label style="grid-column:1/-1">Notes / context<br/><textarea name="note" rows="5" maxlength="1400" placeholder="Explain where this should connect, whether it corrects a page, and what should be reviewed next." required></textarea></label>
        <label>Optional name<br/><input name="name" type="text" maxlength="80" placeholder="Anonymous" /></label>
        <label>Review request<br/><select name="reviewRequest"><option value="add as lead">Add as lead</option><option value="correct existing page">Correct existing page</option><option value="downgrade claim">Downgrade claim</option><option value="create missing record task">Create missing record task</option><option value="connect related cards">Connect related cards</option></select></label>
        <div style="align-self:end"><button class="btn" type="submit">Submit Evidence Lead</button></div>
      </form>
      <p class="mini">No private personal data, threats, doxxing, spam, unsupported accusations, fabricated documents, or claims that go beyond the linked source.</p>
    </section>`;
  const form = target.querySelector('form');
  if (!form.querySelector('input[name="body"]')) {
    const body = document.createElement('input');
    body.type = 'hidden';
    body.name = 'body';
    body.value = '';
    form.appendChild(body);
  }
  form.addEventListener('submit', event => {
    if (!form.sourceUrl.value && !form.note.value.trim()) {
      event.preventDefault();
      alert('Add a source link or a clear note before submitting.');
      return;
    }
    if (!form.shows.value.trim() || !form.doesNotShow.value.trim()) {
      event.preventDefault();
      alert('Explain both what the source shows and what it does not show.');
      return;
    }
    form.body.value = `[CARD EVIDENCE LEAD]\nDeck: ${deckId}\nCard: ${cardName} (${cardId})\nType: ${form.submissionType.value}\nSource type: ${form.sourceType.value}\nEvidence level: ${form.evidenceLevel.value}\nLead: ${form.leadTitle.value}\nSource: ${form.sourceUrl.value || 'none supplied'}\nSource date: ${form.sourceDate.value || 'not supplied'}\nJurisdiction / institution: ${form.jurisdiction.value || 'not supplied'}\nWhat it shows: ${form.shows.value}\nWhat it does not show: ${form.doesNotShow.value}\nAffected route: ${form.affectedRoute.value || 'not supplied'}\nMissing record / next source: ${form.missingRecord.value || 'not supplied'}\nReview request: ${form.reviewRequest.value}\nNotes: ${form.note.value}`;
  });
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
