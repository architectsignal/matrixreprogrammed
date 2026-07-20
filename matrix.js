(() => {
  'use strict';

  const canvas = document.getElementById('matrix');
  const ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;
  if (!canvas || !ctx) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection && connection.saveData);
  const cores = Number(navigator.hardwareConcurrency || 8);
  const memory = Number(navigator.deviceMemory || 8);
  const mobile = window.matchMedia('(max-width: 700px)').matches;
  const lowPower = saveData || cores <= 4 || memory <= 4 || mobile;
  const characters = 'アァイィウヴエカガキクグケゲコゴサザシスセソタチッヂツテトナニヌネノハバパヒフヘホマミムメモヤユヨラリルレロワンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789DOGRITUALSIGNALARCHITECTBLACKFILEINTEL';
  const fontSize = lowPower ? 19 : 16;
  const frameInterval = reducedMotion ? 240 : lowPower ? 86 : 50;

  let drops = [];
  let frame = 0;
  let lastFrameAt = 0;
  let animationFrame = 0;
  let resizeTimer = 0;
  let running = false;

  function resetDrops() {
    const columns = Math.ceil(window.innerWidth / fontSize);
    const rows = Math.max(1, window.innerHeight / fontSize);
    drops = Array.from({ length: columns }, () => Math.floor(Math.random() * rows));
  }

  function sizeCanvas() {
    const dpr = reducedMotion || lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resetDrops();
  }

  function drawMatrix() {
    frame += 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = reducedMotion ? 'rgba(0, 0, 0, 0.18)' : 'rgba(0, 0, 0, 0.075)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.font = `${fontSize}px Courier New, monospace`;
    ctx.textAlign = 'left';

    for (let index = 0; index < drops.length; index += 1) {
      const x = index * fontSize;
      const y = drops[index] * fontSize;
      const text = characters[Math.floor(Math.random() * characters.length)];
      const isHead = Math.random() > (lowPower ? 0.99 : 0.978);

      if (!lowPower && isHead) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(234,255,239,0.82)';
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = isHead ? 'rgba(234,255,239,0.92)' : 'rgba(0,255,102,0.70)';
      ctx.fillText(text, x, y);

      if (!lowPower && frame % 8 === 0 && Math.random() > 0.988) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(244,216,137,0.50)';
        ctx.fillText(text, x, y - fontSize);
      }

      if (!reducedMotion) {
        drops[index] += Math.random() > (lowPower ? 0.28 : 0.17) ? 1 : 0;
        if (y > window.innerHeight + fontSize && Math.random() > 0.975) drops[index] = 0;
      }
    }
    ctx.shadowBlur = 0;
  }

  function tick(timestamp) {
    if (!running) return;
    if (timestamp - lastFrameAt >= frameInterval) {
      lastFrameAt = timestamp;
      drawMatrix();
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function start() {
    if (running || document.hidden || reducedMotion) return;
    running = true;
    lastFrameAt = 0;
    animationFrame = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  sizeCanvas();
  drawMatrix();
  start();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      sizeCanvas();
      drawMatrix();
    }, 180);
  }, { passive: true });
})();
