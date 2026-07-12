let diffModule = null;

async function ensureDiff() {
  if (diffModule) return diffModule;
  try { diffModule = await import('https://esm.sh/diff@8.0.2?bundle'); }
  catch (error) { console.warn('jsdiff unavailable; plain comparison fallback active.', error); }
  return diffModule;
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function changeText(change, key) {
  const values = Array.isArray(change?.[key]) ? change[key] : [];
  return values.map(value => String(value || '').trim()).filter(Boolean).join('\n');
}

export async function renderSourceChangeDiff(change, mode = 'words') {
  if (!change) return '<p>Choose a source-change record.</p>';
  const previous = changeText(change, 'removals');
  const current = changeText(change, 'additions');
  if (!previous && !current) return '<p>This record does not expose canonical text fragments for comparison. Open the source and preserved archive for contextual review.</p>';
  const Diff = await ensureDiff();
  if (!Diff) return `<h3>Removed fragments</h3><pre>${esc(previous || 'None recorded')}</pre><h3>Added fragments</h3><pre>${esc(current || 'None recorded')}</pre>`;
  const parts = mode === 'lines' ? Diff.diffLines(previous, current) : Diff.diffWordsWithSpace(previous, current);
  return parts.map(part => {
    const className = part.added ? 'diff-add' : part.removed ? 'diff-remove' : '';
    return `<span class="${className}">${esc(part.value)}</span>`;
  }).join('');
}
