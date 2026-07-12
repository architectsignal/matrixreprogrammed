let CiteClass = null;

async function ensureCitationJs() {
  if (CiteClass) return CiteClass;
  try {
    const module = await import('https://esm.sh/citation-js@0.7.21?bundle');
    CiteClass = module.Cite || module.default;
  } catch (error) {
    console.warn('Citation.js unavailable; plain citation fallback active.', error);
  }
  return CiteClass;
}

function dateParts(value = '') {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? [[Number(match[1]), Number(match[2]), Number(match[3])]] : undefined;
}

export function archiveToCsl(archive) {
  return {
    id: archive.id,
    type: 'webpage',
    title: archive.title,
    URL: archive.sourceUrl,
    accessed: { 'date-parts': dateParts(archive.capturedAt) },
    issued: { 'date-parts': dateParts(archive.capturedAt) },
    publisher: 'Matrix Reprogrammed Evidence Archive',
    note: `Preserved WACZ capture ${archive.sha256}; replay ${new URL(archive.replayUrl, location.href).href}`
  };
}

function plainCitation(archive) {
  const date = String(archive.capturedAt || '').slice(0, 10) || 'undated';
  return `${archive.title}. ${archive.sourceUrl}. Preserved by Matrix Reprogrammed on ${date}. WACZ SHA-256 ${archive.sha256}. Replay: ${new URL(archive.replayUrl, location.href).href}`;
}

export async function formatCitation(archive, style = 'apa') {
  if (!archive) return '';
  const Cite = await ensureCitationJs();
  if (!Cite) return plainCitation(archive);
  try {
    const cite = new Cite([archiveToCsl(archive)]);
    if (style === 'bibtex') return cite.format('bibtex');
    if (style === 'ris') return cite.format('ris');
    return cite.format('bibliography', { format: 'text', template: style, lang: 'en-US' }).trim();
  } catch (error) {
    console.warn('Citation formatting failed; plain citation fallback active.', error);
    return plainCitation(archive);
  }
}

export async function downloadBibliography(archives, style = 'apa') {
  const selected = (archives || []).filter(Boolean);
  if (!selected.length) return;
  const Cite = await ensureCitationJs();
  let body;
  let extension = 'txt';
  let mime = 'text/plain;charset=utf-8';
  if (Cite) {
    try {
      const cite = new Cite(selected.map(archiveToCsl));
      if (style === 'bibtex') { body = cite.format('bibtex'); extension = 'bib'; }
      else if (style === 'ris') { body = cite.format('ris'); extension = 'ris'; }
      else body = cite.format('bibliography', { format: 'text', template: style, lang: 'en-US' });
    } catch { body = selected.map(plainCitation).join('\n\n'); }
  } else body = selected.map(plainCitation).join('\n\n');
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `matrix-evidence-bibliography-${style}.${extension}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
