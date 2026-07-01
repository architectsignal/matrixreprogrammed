(function(){
  const grid = document.getElementById('store-books');
  const count = document.getElementById('store-count');
  if (!grid) return;

  const fallbackBooks = [
    { title:'As Above, So Below', series:'D.O.G / Flagship', category:'Esoteric / Symbolic Architecture', asin:'B0H65JXCBR' },
    { title:'The Elite Toolkit', series:'Matrix Reprogrammed / Control Systems', category:'Elite Networks' },
    { title:'The Intelligence Dossiers: CIA', series:'The Intelligence Dossiers', category:'Intelligence Dossiers' },
    { title:'The Intelligence Dossiers: NSA', series:'The Intelligence Dossiers', category:'Intelligence Dossiers' },
    { title:'The Intelligence Dossiers: GCHQ', series:'The Intelligence Dossiers', category:'Intelligence Dossiers' },
    { title:'The Intelligence Dossiers: MI6', series:'The Intelligence Dossiers', category:'Intelligence Dossiers' },
    { title:'The Intelligence Dossiers: Mossad', series:'The Intelligence Dossiers', category:'Intelligence Dossiers' },
    { title:'The Crime Dossiers: Albanian Mafia', series:'The Crime Dossiers', category:'Crime Dossiers' },
    { title:'SYMBOL: The Hidden System Behind Freemasonry', series:'Masonic & Esoteric', category:'Masonic Symbols', asin:'B0GGVCPLNY' },
    { title:'The Hegelian Crisis Dialectic', series:'Problem Reaction Solution', category:'Control Systems' },
    { title:'The Book You Were Never Supposed to Read', series:'Books You Were Never Supposed to Read', category:'Forbidden Books' },
    { title:'Dark Arts NSP: Social Sorcery & Group Influence', series:'Dark Arts NSP Defence Series', category:'NSP / Dark Psychology' }
  ];

  function esc(s){
    return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function amazonSearch(title){
    return 'https://www.amazon.com/s?k=' + encodeURIComponent(title + ' D.O.G The Architect Auctor Manus Nicholas Matthews');
  }

  function card(book){
    const direct = book.asin
      ? '<a class="btn" href="https://www.amazon.com/dp/' + esc(book.asin) + '" target="_blank" rel="noopener">Amazon US</a><a class="btn alt" href="https://www.amazon.co.uk/dp/' + esc(book.asin) + '" target="_blank" rel="noopener">Amazon UK</a>'
      : '<a class="btn" href="' + esc(amazonSearch(book.title)) + '" target="_blank" rel="noopener">Find on Amazon</a>';
    return '<article class="card book-card"><div><span class="label">' + esc(book.category) + '</span><h3>' + esc(book.title) + '</h3><p>' + esc(book.series) + '</p><p><span class="pill">Amazon Store</span></p></div><div class="cta-row small">' + direct + '</div></article>';
  }

  function render(books, sourceLabel){
    const safeBooks = Array.isArray(books) ? books.filter(book => book && book.title) : [];
    if (!safeBooks.length) {
      grid.innerHTML = '<article class="card redline"><h3>Catalogue route active</h3><p>Open the main book archive while the Amazon catalogue refreshes.</p><a class="btn" href="books.html">Main Book Archive</a></article>';
      if (count) count.textContent = 'Catalogue route active';
      return;
    }
    if (count) count.textContent = safeBooks.length + ' store title' + (safeBooks.length === 1 ? '' : 's') + ' listed' + (sourceLabel ? ' · ' + sourceLabel : '');
    grid.innerHTML = safeBooks.map(card).join('');
  }

  render(fallbackBooks, 'instant fallback');

  fetch('/data/amazon-store-visible-books.json', { cache:'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('Catalogue HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      const books = data.books || [];
      render(books, data.updated ? 'checked ' + data.updated : 'live catalogue');
    })
    .catch(() => {
      render(fallbackBooks, 'fallback catalogue');
    });
})();
