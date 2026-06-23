const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');
function sizeCanvas(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
sizeCanvas();
const characters = "アァイィウヴエカガキクグケゲコゴサザシスセソタチッヂツテトナニヌネノハバパヒフヘホマミムメモヤユヨラリルレロワンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789DOGRITUALSIGNALARCHITECT";
const fontSize = 14;
let drops = [];
function resetDrops(){
  const columns = Math.floor(canvas.width / fontSize);
  drops = new Array(columns).fill(1);
}
resetDrops();
function drawMatrix(){
  ctx.fillStyle = "rgba(0,0,0,0.055)";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = "#00ff66";
  ctx.font = fontSize + "px monospace";
  for(let i=0;i<drops.length;i++){
    const text = characters[Math.floor(Math.random()*characters.length)];
    ctx.fillText(text, i*fontSize, drops[i]*fontSize);
    drops[i]++;
    if(drops[i]*fontSize > canvas.height && Math.random() > 0.975) drops[i]=0;
  }
}
setInterval(drawMatrix, 50);
window.addEventListener('resize',()=>{sizeCanvas();resetDrops();});
