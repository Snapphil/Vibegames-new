// HTML Game Templates - Used as placeholders/examples for game publishing
// These are not used in the feed directly, but can be used as starting points for game creation

export const gameHTML_FlappyNeon = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"/>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0f19;color:#fff;font-family:Inter,system-ui,Arial}#c{position:fixed;inset:0}</style></head>
<body><canvas id="c"></canvas>
<script>
const RNW = window.ReactNativeWebView || {postMessage:()=>{}};
const c=document.getElementById('c'); const x=c.getContext('2d');
let W=0,H=0,DPR=1; function rs(){DPR=Math.min(2,devicePixelRatio||1); W=c.width=innerWidth*DPR; H=c.height=innerHeight*DPR; c.style.width=innerWidth+'px'; c.style.height=innerHeight+'px';}
addEventListener('resize',rs); rs();
let bird={x:W*0.3,y:H*0.45,vy:0,r:14*DPR};
let pipes=[], gap=170*DPR, speed=2.6*DPR, gravity=0.35*DPR, jump=-6.8*DPR, score=0; 
let running=false, started=false; 
function addPipe(){ const w=64*DPR, x=W + w; const top=Math.random()*(H*0.5 - 90*DPR) + 40*DPR; pipes.push({x,w,top,passed:false}); }
for(let i=0;i<4;i++){ pipes.push({x:W + i*(W*0.5), w:64*DPR, top:H*0.35, passed:false}); }
let last=0; function loop(t){ requestAnimationFrame(loop); const dt=(t-last)||16.67; last=t; x.clearRect(0,0,W,H);
 // bg
 const g=x.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0b0f19'); g.addColorStop(1,'#111827'); x.fillStyle=g; x.fillRect(0,0,W,H);
 if(!started){ x.fillStyle='rgba(0,0,0,0.35)'; x.fillRect(0,0,W,H); x.fillStyle='#fff'; x.font=DPR*26+'px Arial'; x.textAlign='center'; x.fillText('Tap to Play',W/2,H/2); return; }
 if(!running) return;
 bird.vy += gravity*(dt/16.67); bird.y += bird.vy;
 for(const p of pipes){ p.x -= speed*(dt/16.67); }
 if(pipes[0].x + pipes[0].w < 0){ pipes.shift(); addPipe(); }
 // draw pipes
 x.fillStyle='#7C4DFF';
 for(const p of pipes){
   x.fillRect(p.x,0,p.w,p.top);
   x.fillRect(p.x,p.top+gap,p.w,H-(p.top+gap));
   if(!p.passed && p.x + p.w < bird.x - bird.r){ p.passed=true; score++; RNW.postMessage(JSON.stringify({type:'score', score})); }
 }
 // draw bird
 x.fillStyle='#22d3ee'; x.beginPath(); x.arc(bird.x,bird.y,bird.r,0,Math.PI*2); x.fill();
 // collisions
 if(bird.y-bird.r<0 || bird.y+bird.r>H) end();
 for(const p of pipes){ if(bird.x+bird.r>p.x && bird.x-bird.r<p.x+p.w){ if(bird.y-bird.r<p.top || bird.y+bird.r>p.top+gap){ end(); } } }
}
function tap(){ if(!started){ started=true; running=true; } else if(running){ bird.vy = jump; } }
function end(){ running=false; RNW.postMessage(JSON.stringify({type:'gameEnd', score})); }
addEventListener('touchstart',tap,{passive:true}); addEventListener('mousedown',tap);
requestAnimationFrame(loop);
</script></body></html>`;

export const gameHTML_SwipeSnake = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"/>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0f19;color:#fff;font-family:Inter,system-ui,Arial}#c{position:fixed;inset:0}</style></head>
<body><canvas id="c"></canvas>
<script>
const RNW = window.ReactNativeWebView || {postMessage:()=>{}};
const c=document.getElementById('c'); const g=c.getContext('2d');
let W=0,H=0,DPR=1; function rs(){DPR=Math.min(2,devicePixelRatio||1); W=c.width=innerWidth*DPR; H=c.height=innerHeight*DPR; c.style.width=innerWidth+'px'; c.style.height=innerHeight+'px';}
addEventListener('resize',rs); rs();
const CS=22*DPR; const cols=()=>Math.floor(W/CS), rows=()=>Math.floor(H/CS);
let snake=[{x:Math.floor(cols()/2),y:Math.floor(rows()/2)}]; let dir={x:1,y:0}; let apple=spawn(); let score=0; let alive=false, started=false; let acc=0, step=110;
function spawn(){ return {x:Math.floor(Math.random()*cols()), y:Math.floor(Math.random()*rows())} }
let sX=null,sY=null; 
function swipe(sx,sy,ex,ey){ const dx=ex-sx, dy=ey-sy; if(Math.abs(dx)>Math.abs(dy)){ dir = dx>0?{x:1,y:0}:{x:-1,y:0}; } else { dir = dy>0?{x:0,y:1}:{x:0,y:-1}; } if(!started){ started=true; alive=true; }}
document.addEventListener('touchstart',e=>{ const t=e.touches[0]; sX=t.clientX; sY=t.clientY; },{passive:true});
document.addEventListener('touchend',e=>{ if(sX==null) return; const t=e.changedTouches[0]; swipe(sX,sY,t.clientX,t.clientY); sX=null; sY=null; });
document.addEventListener('pointerdown',e=>{ sX=e.clientX; sY=e.clientY; });
document.addEventListener('pointerup',e=>{ if(sX==null) return; swipe(sX,sY,e.clientX,e.clientY); sX=null; sY=null; });
function tick(){ const head={x:(snake[0].x+dir.x+cols())%cols(), y:(snake[0].y+dir.y+rows())%rows()};
  if(snake.some((s)=>s.x===head.x&&s.y===head.y)){ alive=false; RNW.postMessage(JSON.stringify({type:'gameEnd', score})); return; }
  snake.unshift(head);
  if(head.x===apple.x&&head.y===apple.y){ score++; RNW.postMessage(JSON.stringify({type:'score', score})); apple=spawn(); }
  else snake.pop();
}
let last=0; function loop(t){ requestAnimationFrame(loop); const dt=t-last; last=t; g.clearRect(0,0,W,H);
  if(!started){ g.fillStyle='rgba(0,0,0,0.35)'; g.fillRect(0,0,W,H); g.fillStyle='#fff'; g.font=DPR*26+'px Arial'; g.textAlign='center'; g.fillText('Swipe to Play',W/2,H/2); return; }
  if(!alive){ return; }
  acc+=dt; if(acc>step){ acc=0; tick(); }
  g.fillStyle='#0b0f19'; g.fillRect(0,0,W,H);
  g.fillStyle='#ef4444'; g.fillRect(apple.x*CS, apple.y*CS, CS, CS);
  g.fillStyle='#22c55e'; for(const s of snake){ g.fillRect(s.x*CS, s.y*CS, CS, CS); }
}
requestAnimationFrame(loop);
</script></body></html>`;

export const gameHTML_ThreeRunner = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"/>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0f19}</style>
<script src="https://unpkg.com/three@0.152.2/build/three.min.js"></script></head>
<body>
<script>
const RNW = window.ReactNativeWebView || {postMessage:()=>{}};
let W=innerWidth, H=innerHeight, DPR = Math.min(2, window.devicePixelRatio||1);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60, W/H, 0.1, 100); camera.position.set(0,1.2,3);
const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(DPR); renderer.setSize(W,H); document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x222233,1.0)); const dl=new THREE.DirectionalLight(0xffffff,0.8); dl.position.set(2,3,1); scene.add(dl);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,200), new THREE.MeshStandardMaterial({color:0x111827})); ground.rotation.x=-Math.PI/2; ground.position.z=-50; scene.add(ground);
const player=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.6,0.6), new THREE.MeshStandardMaterial({color:0x22d3ee})); player.position.y=0.3; scene.add(player);
let vy=0, gravity=-0.025; const jump=0.45;
const obstacles=[]; function addObs(z){ const m=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.7,0.7), new THREE.MeshStandardMaterial({color:0xef4444})); m.position.set(0,0.35,z); scene.add(m); obstacles.push({m, passed:false}); }
for(let i=6;i<=60;i+=6){ addObs(-i); }
let speed=0.12; let running=false, started=false, score=0;
function reset(){ for(const o of obstacles){ scene.remove(o.m);} obstacles.length=0; for(let i=6;i<=60;i+=6){ addObs(-i);} player.position.set(0,0.3,0); vy=0; speed=0.12; score=0; }
function start(){ if(!started){ started=true; running=true; RNW.postMessage(JSON.stringify({type:'score', score})); } }
addEventListener('touchstart',()=>{ if(!started){ start(); } else if(running && player.position.y<=0.31){ vy=jump; } },{passive:true});
addEventListener('mousedown',()=>{ if(!started){ start(); } else if(running && player.position.y<=0.31){ vy=jump; } });
function loop(){ requestAnimationFrame(loop);
 if(!started){ renderer.render(scene,camera); return; }
 if(running){
   player.position.y += vy; vy += gravity; if(player.position.y<0.3){ player.position.y=0.3; vy=0; }
   for(const o of obstacles){ o.m.position.z += speed; if(!o.passed && o.m.position.z>0){ o.passed=true; score++; RNW.postMessage(JSON.stringify({type:'score', score})); } }
   if(obstacles.length && obstacles[0].m.position.z>2){ const o=obstacles.shift(); scene.remove(o.m); const lastZ = obstacles[obstacles.length-1].m.position.z; addObs(lastZ-6-(Math.random()*2)); }
   for(const o of obstacles){ if(Math.abs(o.m.position.z) < 0.6 && player.position.y < 0.6){ running=false; RNW.postMessage(JSON.stringify({type:'gameEnd', score})); break; } }
   speed += 0.0002;
 }
 renderer.render(scene,camera);
}
loop();
addEventListener('resize',()=>{ W=innerWidth; H=innerHeight; camera.aspect=W/H; camera.updateProjectionMatrix(); renderer.setSize(W,H); });
</script>
</body></html>`;

// Simple HTML placeholder for new games
export const gameHTML_Placeholder = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"/>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0f19;color:#fff;font-family:Inter,system-ui,Arial;display:flex;align-items:center;justify-content:center;flex-direction:column</style></head>
<body>
  <h1>Your Game Here</h1>
  <p>Replace this HTML with your game code</p>
  <button onclick="alert('Game interaction!')">Click me!</button>
</body></html>`;

// Add default export for Expo Router
export default {
  gameHTML_FlappyNeon,
  gameHTML_SwipeSnake,
  gameHTML_ThreeRunner,
  gameHTML_Placeholder
};
