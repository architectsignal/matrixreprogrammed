(() => {
  'use strict';
  document.documentElement.dataset.matrixSharedScript = 'ready';
  window.dispatchEvent(new CustomEvent('matrix:shared-script-ready'));
})();
