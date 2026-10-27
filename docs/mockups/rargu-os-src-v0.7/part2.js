<script>
const SPRITES=__SPRITES__;
const MASKS=__MASKS__;
const P=["#000000","#1d2b53","#7e2553","#008751","#ab5236","#5f574f","#c2c3c7","#fff1e8","#ff004d","#ffa300","#ffec27","#00e436","#29adff","#83769c","#ff77a8","#ffccaa"];
const RM=matchMedia("(prefers-reduced-motion: reduce)").matches;
const $=s=>document.querySelector(s);
let toastT;
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2600)}

$("#copy").onclick=()=>{const e="r.arguello.h@gmail.com";(navigator.clipboard?navigator.clipboard.writeText(e):Promise.reject()).then(()=>toast("Email copied")).catch(()=>{const r=document.createRange();r.selectNodeContents($("#email"));const s=getSelection();s.removeAllRanges();s.addRange(r);toast("Selected; press ⌘C")})};
const closeRail=()=>{$("#rail").classList.remove("open");$("#railToggle").setAttribute("aria-expanded","false");$("#railToggle").textContent="about ▾"};
$("#railToggle").onclick=e=>{const o=$("#rail").classList.toggle("open");e.currentTarget.setAttribute("aria-expanded",o);e.currentTarget.textContent=o?"close ▴":"about ▾"};

const vp=$("#vp"),sizer=$("#sizer"),world=$("#world");
const WW=world.offsetWidth,WH=world.offsetHeight;
let Z=1,miniDirty=true;
// screen ↔ sheet coordinates (the sheet is scaled by Z inside the scroller)
const toWorld=(cx,cy)=>{const r=world.getBoundingClientRect();return[(cx-r.left)/Z,(cy-r.top)/Z]};

/* ---------- zoom: ⌘/Ctrl-scroll or trackpad pinch, two-finger pinch, the − + fit buttons ---------- */
const zMin=()=>Math.min(1,Math.max(.15,Math.min((vp.clientWidth-32)/WW,(vp.clientHeight-32)/WH)));
const Z_MAX=1.6;
function setZoom(z,ax,ay){// ax,ay: the screen point that stays put
  z=Math.min(Z_MAX,Math.max(zMin(),z));
  const b=vp.getBoundingClientRect();ax??=b.left+vp.clientWidth/2;ay??=b.top+vp.clientHeight/2;
  const [wx,wy]=toWorld(ax,ay);
  Z=z;world.style.transform=`scale(${Z})`;sizer.style.width=WW*Z+"px";sizer.style.height=WH*Z+"px";
  vp.scrollLeft=wx*Z-(ax-b.left);vp.scrollTop=wy*Z-(ay-b.top);
  $("#zPct").textContent=Math.round(Z*100)+"%";miniDirty=true;
}
let zAnim=0;
function zoomTo(z,ax,ay){cancelAnimationFrame(zAnim);if(RM)return setZoom(z,ax,ay);const z0=Z,t0=performance.now();
  const step=t=>{const k=Math.min(1,(t-t0)/220),e=1-Math.pow(1-k,3);setZoom(z0+(z-z0)*e,ax,ay);if(k<1)zAnim=requestAnimationFrame(step)};zAnim=requestAnimationFrame(step)}
vp.addEventListener("wheel",e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();setZoom(Z*Math.exp(-e.deltaY*.01),e.clientX,e.clientY)},{passive:false});
$("#zIn").onclick=()=>zoomTo(Z*1.25);
$("#zOut").onclick=()=>zoomTo(Z/1.25);
$("#zFit").onclick=()=>{cancelAnimationFrame(zAnim);setZoom(zMin());vp.scrollTo({left:0,top:0})};

/* ---------- draggable windows ----------
   Held: the grabbed point stays exactly under the pointer; the body swings on that point,
   lagging the hand like a hanging object (target angle from the torque r × v).
   Thrown: release velocity v (sheet px/s, from the last 80 ms of samples) gives a flight
   x(t) = x0 + v·τ·(1 − e^(−t/τ)), cut at t = 2τ, where it stops dead as if pinned.
   Pinned: the momentum left at the pin becomes a kick about the grab point, compressed
   through a log so hard throws don't swing much harder than soft ones, then a heavily
   damped oscillator θ'' = −ω²θ − 2ζωθ' settles it in well under a second. */
const TAU=.12,TP=2*TAU,NORM=1-Math.exp(-2),PIN=Math.exp(-2)/TAU/NORM,MAXD=360;
const W_OSC=2*Math.PI*2.6,ZETA=.34,KICK_DEG=4,KICK_SOFT=150;
let zTop=10;
const all=[];
function makeWin(w){
  const bar=w.querySelector(".bar");
  const s={x:0,y:0,rot:0,rv:0,lift:0,vx:0,vy:0,gx:0,gy:0,cx:0,cy:0,drag:false,samples:[],fl:null,raf:0,last:0,home:{x:+w.dataset.x,y:+w.dataset.y}};
  const set=()=>{w.style.transformOrigin=`${s.gx}px ${s.gy}px`;w.style.transform=`translate(${s.x}px,${s.y}px) rotate(${s.rot}deg) scale(${1+.03*s.lift})`;miniDirty=true};
  const clampXY=(x,y)=>[Math.min(Math.max(x,0),WW-w.offsetWidth),Math.min(Math.max(y,0),WH-w.offsetHeight)];
  const sample=()=>{const p=toWorld(s.cx,s.cy);s.samples.push([performance.now(),p[0],p[1]]);if(s.samples.length>12)s.samples.shift()};
  const velocity=now=>{const k=s.samples.filter(p=>now-p[0]<80);if(k.length<2||now-k[k.length-1][0]>50)return[0,0];const a=k[0],b=k[k.length-1],dt=(b[0]-a[0])/1000||1;return[(b[1]-a[1])/dt,(b[2]-a[2])/dt]};
  // torque of the window's centre about the grab point when that point moves at (vx,vy)
  const torque=(vx,vy)=>{const rx=w.offsetWidth/2-s.gx,ry=w.offsetHeight/2-s.gy;return(rx*vy-ry*vx)/(Math.hypot(rx,ry)+1)};
  // place the window from the last pointer position (also after the sheet scrolls or zooms under it)
  const follow=()=>{const[x,y]=toWorld(s.cx,s.cy);s.x=x-s.gx;s.y=y-s.gy};
  const tick=now=>{
    const dt=Math.min(.05,s.last?(now-s.last)/1000:1/60);s.last=now;
    if(s.drag){
      // hold a window near the edge of the screen and the sheet scrolls under it
      const E=56,b=vp.getBoundingClientRect();let px=0,py=0;
      if(s.cx<b.left+E)px=-(b.left+E-s.cx);else if(s.cx>b.right-E)px=s.cx-(b.right-E);
      if(s.cy<b.top+E)py=-(b.top+E-s.cy);else if(s.cy>b.bottom-E)py=s.cy-(b.bottom-E);
      if(px||py){vp.scrollBy(px*.35,py*.35);sample()}
      follow();[s.vx,s.vy]=velocity(now);
    }
    if(s.fl){const f=s.fl,t=(now-f.t0)/1000;
      if(t>=f.T){s.x=f.Lx;s.y=f.Ly;s.rv+=f.kick;s.fl=null}
      else{const k=(1-Math.exp(-t/f.tau))/NORM;s.x=f.x0+(f.Lx-f.x0)*k;s.y=f.y0+(f.Ly-f.y0)*k}}
    const target=s.drag?Math.max(-12,Math.min(12,-.012*torque(s.vx,s.vy))):0;
    const om=s.drag?2*Math.PI*2.6:W_OSC,z=s.drag?.65:ZETA;
    s.rv+=(-om*om*(s.rot-target)-2*z*om*s.rv)*dt;s.rot+=s.rv*dt;
    if(RM){s.rot=0;s.rv=0}
    s.lift+=((s.drag?1:0)-s.lift)*Math.min(1,dt*14);
    set();
    if(!s.drag&&!s.fl&&Math.abs(s.rot)<.05&&Math.abs(s.rv)<.5&&s.lift<.01){s.rot=s.rv=s.lift=0;set();s.raf=0;s.last=0;return}
    s.raf=requestAnimationFrame(tick);
  };
  const run=()=>{if(!s.raf)s.raf=requestAnimationFrame(tick)};
  // fly to a landing point on the same curve; long trips (summons, reset) take proportionally longer
  const fly=(Lx,Ly,withKick)=>{[Lx,Ly]=clampXY(Lx,Ly);
    const d=Math.hypot(Lx-s.x,Ly-s.y),tau=d>MAXD?Math.min(.3,TAU*d/MAXD):TAU;
    const t=torque((Lx-s.x)*PIN*TAU/tau,(Ly-s.y)*PIN*TAU/tau);// velocity at the pin moment is dx/dt of the flight curve
    const kick=withKick&&!RM?Math.sign(t)*KICK_DEG*Math.log1p(Math.abs(t)/KICK_SOFT)*W_OSC:0;
    s.fl={x0:s.x,y0:s.y,Lx,Ly,t0:performance.now(),tau,T:2*tau,kick};run()};
  w.addEventListener("pointerdown",()=>{w.style.zIndex=++zTop});
  bar.addEventListener("pointerdown",e=>{
    if(e.target.closest("button")||e.button>0)return;
    e.preventDefault();e.stopPropagation();bar.setPointerCapture(e.pointerId);
    // catch it: drop any flight or wobble, the pivot is wherever the pointer landed
    s.fl=null;s.rot=0;s.rv=0;s.drag=true;s.cx=e.clientX;s.cy=e.clientY;
    const[x,y]=toWorld(e.clientX,e.clientY);s.gx=x-s.x;s.gy=y-s.y;
    s.samples=[];sample();w.classList.add("lifted");set();run();
  });
  bar.addEventListener("pointermove",e=>{if(!s.drag)return;s.cx=e.clientX;s.cy=e.clientY;sample();follow();set()});
  const end=()=>{if(!s.drag)return;s.drag=false;w.classList.remove("lifted");
    let[vx,vy]=velocity(performance.now());if(RM)vx=vy=0;
    const sp=Math.hypot(vx,vy),cap=sp*TAU*NORM>MAXD?MAXD/(sp*TAU*NORM):1;vx*=cap;vy*=cap;
    fly(s.x+vx*TAU*NORM,s.y+vy*TAU*NORM,true)};
  bar.addEventListener("pointerup",end);bar.addEventListener("pointercancel",end);
  bar.addEventListener("dblclick",e=>{if(e.target.closest("button"))return;fly(s.home.x,s.home.y,true)});
  s.x=s.home.x;s.y=s.home.y;set();
  const api={w,s,fly,follow,set};all.push(api);return api;
}
document.querySelectorAll(".win").forEach(makeWin);
const win=id=>all.find(a=>a.w.id===id);

/* ---------- the sheet: one finger or the mouse drags the paper, two fingers pinch ---------- */
const NOPAN=".bar,button,input,textarea,a,canvas#paint,canvas#board,.seq";
const pts=new Map();let pan=null,panV=[0,0],panRaf=0,pinch=null;
vp.addEventListener("pointerdown",e=>{
  if(e.button!==0)return;
  if(e.pointerType==="mouse"?e.target.closest(".win"):e.target.closest(NOPAN))return;
  pts.set(e.pointerId,[e.clientX,e.clientY]);vp.setPointerCapture(e.pointerId);cancelAnimationFrame(panRaf);
  if(e.pointerType==="mouse")e.preventDefault();
  if(pts.size===2){const[a,b]=[...pts.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z:Z,mx:(a[0]+b[0])/2,my:(a[1]+b[1])/2};pan=null;return}
  pan={x:e.clientX,y:e.clientY,sl:vp.scrollLeft,st:vp.scrollTop,samples:[[performance.now(),e.clientX,e.clientY]]};vp.classList.add("panning");
});
vp.addEventListener("pointermove",e=>{
  if(!pts.has(e.pointerId))return;pts.set(e.pointerId,[e.clientX,e.clientY]);
  if(pinch&&pts.size>=2){const[a,b]=[...pts.values()],mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
    setZoom(pinch.z*Math.hypot(a[0]-b[0],a[1]-b[1])/pinch.d,mx,my);vp.scrollBy(pinch.mx-mx,pinch.my-my);pinch.mx=mx;pinch.my=my;return}
  if(!pan)return;vp.scrollLeft=pan.sl-(e.clientX-pan.x);vp.scrollTop=pan.st-(e.clientY-pan.y);pan.samples.push([performance.now(),e.clientX,e.clientY]);if(pan.samples.length>8)pan.samples.shift()});
const panEnd=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(!pan)return;vp.classList.remove("panning");const now=performance.now(),k=pan.samples.filter(p=>now-p[0]<80);pan=null;
  if(RM||k.length<2)return;const a=k[0],b=k[k.length-1],dt=(b[0]-a[0])/1000||1;panV=[(b[1]-a[1])/dt,(b[2]-a[2])/dt];let last=now;
  // the paper glides a little after a flick, then stops
  const glide=t=>{const d=(t-last)/1000;last=t;vp.scrollBy(-panV[0]*d,-panV[1]*d);const f=Math.exp(-d/.18);panV=[panV[0]*f,panV[1]*f];if(Math.hypot(...panV)>20)panRaf=requestAnimationFrame(glide)};panRaf=requestAnimationFrame(glide)};
vp.addEventListener("pointerup",panEnd);vp.addEventListener("pointercancel",panEnd);
vp.addEventListener("scroll",()=>{miniDirty=true;for(const a of all)if(a.s.drag){a.follow();a.set()}},{passive:true});

/* go to a window wherever it currently is, framed beside the identity card */
function visibleArea(){const rail=$("#rail").getBoundingClientRect(),map=$(".mapbox").getBoundingClientRect(),wide=innerWidth>760;
  const l=wide?rail.right+24:16,t=wide?24:rail.bottom+16;return{l,t,w:innerWidth-l-16,h:(wide?innerHeight:map.top)-t-16}}
function panTo(id,instant){
  const a=win(id);if(!a)return;
  const v=visibleArea(),ww=a.w.offsetWidth*Z,wh=a.w.offsetHeight*Z;
  vp.scrollTo({left:a.s.x*Z-v.l-Math.max(0,(v.w-ww)/2),top:a.s.y*Z-v.t-Math.max(0,(v.h-wh)/2),behavior:instant||RM?"auto":"smooth"});
  a.w.style.zIndex=++zTop;
}
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{panTo(b.dataset.go);closeRail()});

/* quick tools: the icon takes you to the tool, wherever it is now */
document.querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>{panTo(b.dataset.tool);closeRail()});

/* reset: every window flies home, zoom back to 100%, view back to the start */
$("#reset").onclick=()=>{cancelAnimationFrame(zAnim);setZoom(1);for(const a of all){a.s.gx=a.w.offsetWidth/2;a.s.gy=0;a.fly(a.s.home.x,a.s.home.y,true)}panTo("castlesiege");closeRail()};

/* minimap */
const mini=$("#mini"),mx=mini.getContext("2d");
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}
function drawMini(){
  const k=mini.width/WW;mini.height=Math.round(WH*k);
  mx.fillStyle=css("--paper");mx.fillRect(0,0,mini.width,mini.height);
  mx.strokeStyle=css("--grid-major");mx.lineWidth=1;for(let x=0;x<WW;x+=120){mx.beginPath();mx.moveTo(x*k,0);mx.lineTo(x*k,mini.height);mx.stroke()}for(let y=0;y<WH;y+=120){mx.beginPath();mx.moveTo(0,y*k);mx.lineTo(mini.width,y*k);mx.stroke()}
  for(const a of all){mx.fillStyle=/win$/.test(a.w.id)?css("--ink-dim"):css("--accent");mx.fillRect(a.s.x*k,a.s.y*k,a.w.offsetWidth*k,a.w.offsetHeight*k)}
  mx.strokeStyle=css("--accent-2");mx.lineWidth=4;mx.strokeRect(vp.scrollLeft/Z*k+2,vp.scrollTop/Z*k+2,vp.clientWidth/Z*k-4,vp.clientHeight/Z*k-4);
}
(function miniLoop(){if(miniDirty){miniDirty=false;drawMini()}requestAnimationFrame(miniLoop)})();
let miniDrag=false;
const miniGo=e=>{const r=mini.getBoundingClientRect(),k=WW/r.width;vp.scrollTo({left:(e.clientX-r.left)*k*Z-vp.clientWidth/2,top:(e.clientY-r.top)*k*Z-vp.clientHeight/2})};
mini.addEventListener("pointerdown",e=>{miniDrag=true;mini.setPointerCapture(e.pointerId);miniGo(e)});
mini.addEventListener("pointermove",e=>{if(miniDrag)miniGo(e)});
mini.addEventListener("pointerup",()=>miniDrag=false);

/* the card highlights whichever project sits nearest the middle of the view */
const navBtns=[...document.querySelectorAll("[data-go]")];
function markNearest(){const v=visibleArea(),[cx,cy]=toWorld(v.l+v.w/2,v.t+v.h/2);let best=null,bd=1e9;
  for(const a of all){if(!a.w.id||/win$/.test(a.w.id))continue;const d=Math.hypot(a.s.x+a.w.offsetWidth/2-cx,a.s.y+a.w.offsetHeight/2-cy);if(d<bd){bd=d;best=a.w.id}}
  navBtns.forEach(b=>b.classList.toggle("on",b.dataset.go===best))}
vp.addEventListener("scroll",markNearest,{passive:true});

