const canvas = document.getElementById('matrix');
const ctx = canvas ? canvas.getContext('2d') : null;

if (canvas && ctx) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const characters = "アァイィウヴエカガキクグケゲコゴサザシスセソタチッヂツテトナニヌネノハバパヒフヘホマミムメモヤユヨラリルレロワンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789DOGRITUALSIGNALARCHITECTBLACKFILEINTEL";
  const fontSize = 15;
  let drops = [];
  let columns = 0;
  let frame = 0;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resetDrops();
  }

  function resetDrops() {
    columns = Math.ceil(window.innerWidth / fontSize);
    drops = Array.from({ length: columns }, () => Math.floor(Math.random() * (window.innerHeight / fontSize)));
  }

  function drawMatrix() {
    frame += 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.062)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.font = `${fontSize}px Courier New, monospace`;
    ctx.textAlign = 'left';

    for (let i = 0; i < drops.length; i += 1) {
      const x = i * fontSize;
      const y = drops[i] * fontSize;
      const text = characters[Math.floor(Math.random() * characters.length)];
      const isHead = Math.random() > 0.975;

      ctx.shadowBlur = isHead ? 14 : 6;
      ctx.shadowColor = isHead ? 'rgba(234,255,239,0.9)' : 'rgba(0,255,102,0.55)';
      ctx.fillStyle = isHead ? 'rgba(234,255,239,0.95)' : 'rgba(0,255,102,0.78)';
      ctx.fillText(text, x, y);

      if (frame % 7 === 0 && Math.random() > 0.985) {
        ctx.fillStyle = 'rgba(244,216,137,0.58)';
        ctx.fillText(text, x, y - fontSize);
      }

      drops[i] += Math.random() > 0.16 ? 1 : 0;
      if (y > window.innerHeight + fontSize && Math.random() > 0.975) drops[i] = 0;
    }
  }

  function loop() {
    drawMatrix();
    window.setTimeout(() => requestAnimationFrame(loop), prefersReducedMotion ? 140 : 46);
  }

  sizeCanvas();
  loop();
  window.addEventListener('resize', sizeCanvas);
}
