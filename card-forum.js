function matrixCardForumMount(targetId, opts = {}) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const deckId = opts.deckId || new URLSearchParams(location.search).get('deck') || 'unknown-deck';
  const cardId = opts.cardId || new URLSearchParams(location.search).get('card') || document.body.dataset.cardId || 'unknown-card';
  const cardName = opts.cardName || document.querySelector('h1')?.textContent?.trim() || cardId;
  target.innerHTML = `
    <section class="card-intel-forum" style="border:1px solid rgba(216,181,106,.35);border-radius:24px;padding:1rem;background:linear-gradient(150deg,rgba(18,8,0,.96),rgba(0,0,0,.94));margin-top:1.5rem">
      <div class="eyebrow">Card Intelligence Forum</div>
      <h2>Submit information for this card</h2>
      <p class="lead">Add public-record links, corrections, timeline notes, relationship leads, missing records or artwork corrections for <strong>${escapeHtml(cardName)}</strong>.</p>
      <p><strong>Boundary:</strong> user submissions are leads, not verified claims. They must be reviewed and evidence-rated before being added to the profile.</p>
      <form id="card-intel-form" class="grid" method="post" action="/submit-card-intel">
        <input type="hidden" name="deckId" value="${escapeHtml(deckId)}" />
        <input type="hidden" name="cardId" value="${escapeHtml(cardId)}" />
        <input type="hidden" name="cardName" value="${escapeHtml(cardName)}" />
        <label>Submission type<br/><select name="submissionType" required><option value="public source link">Public source link</option><option value="court record link">Court record link</option><option value="government record">Government / institutional record</option><option value="news report">News / reporting link</option><option value="timeline note">Timeline note</option><option value="relationship suggestion">Relationship suggestion</option><option value="correction request">Correction request</option><option value="broken link report">Broken link report</option><option value="artwork correction">Artwork correction</option></select></label>
        <label>Source URL<br/><input name="sourceUrl" type="url" placeholder="https://..." /></label>
        <label>Title / short label<br/><input name="title" type="text" maxlength="140" placeholder="What is this lead?" required /></label>
        <label style="grid-column:1/-1">Notes<br/><textarea name="note" rows="5" maxlength="1200" placeholder="Explain what the link shows, what needs correcting, or where it should connect in the profile." required></textarea></label>
        <label>Optional name<br/><input name="submitterNameOptional" type="text" maxlength="80" placeholder="Optional" /></label>
        <div style="align-self:end"><button class="btn" type="submit">Submit Lead</button></div>
      </form>
      <p class="mini">No private personal data, threats, doxxing, spam, unsupported accusations, or fabricated documents.</p>
    </section>`;
  const form = target.querySelector('form');
  form.addEventListener('submit', event => {
    if (!form.sourceUrl.value && !form.note.value.trim()) {
      event.preventDefault();
      alert('Add a source link or a clear note before submitting.');
    }
  });
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
