(function(){
  const grid = document.getElementById('store-books');
  const count = document.getElementById('store-count');
  if (!grid) return;

  function esc(s){
    return String(s || '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  }

  function amazonSearch(title){
    return 'https://www.amazon.com/s?k=' + encodeURIComponent(title + ' D.O.G The Architect Auctor Manus');
  }

  function card(book){
    const direct = book.asin ? '<a class="btn" href="https://www.amazon.com/dp/' + esc(book.asin) + '" target="_blank" rel="noopener">Amazon US</a><a class="btn alt" href="https://www.amazon.co.uk/dp/' + esc(book.asin) + '" target="_blank" rel="noopener">Amazon UK</a>' : '<a class="btn" href="' + esc(amazonSearch(book.title)) + '" target="_blank" rel="noopener">Amazon Search</a>';
    const status = book.asin ? 'ASIN ' + book.asin : (book.status || 'visible-title');
    return '<article class="card book-card"><div><span class="label">' + esc(book.category) + '</span><h3>' + esc(book.title) + '</h3><p>' + esc(book.series) + '</p><p><span class="pill">' + esc(status) + '</span></p></div><div class="cta-row small">' + direct + '</div></article>';
  }

  fetch('data/amazon-store-visible-books.json')
    .then(r => r.json())
    .then(data => {
      const books = data.books || [];
      if (count) count.textContent = books.length + ' visible Amazon Store title' + (books.length === 1 ? '' : 's') + ' captured';
      grid.innerHTML = books.map(card).join('');
    })
    .catch(() => {
      grid.innerHTML = '<article class="card redline"><h3>Catalogue not loaded</h3><p>The Amazon Store catalogue data could not be loaded.</p></article>';
    });
})();
