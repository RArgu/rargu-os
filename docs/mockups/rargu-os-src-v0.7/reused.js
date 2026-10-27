/* ---------- CastleSiege stand-in ---------- */
const SETUP=[["bow",0,0],["king",3,0],["bow",6,0],["wall",1,1],["wall",3,1],["wall",5,1],["spear",0,2],["hammer",1,2],["sword",2,2],["hammer",3,2],["sword",4,2],["hammer",5,2],["spear",6,2]];
const bc=$("#board"),bx=bc.getContext("2d"),CS=40;
let pieces,sel=null,turn="white",csBusy=false;
const maskCache={};
function pieceImg(type,owner){
  const k=type+owner;if(maskCache[k])return maskCache[k];
  const m=MASKS[type],c=document.createElement("canvas");c.width=c.height=18;const x=c.getContext("2d");
  const fill=owner==="white"?P[7]:P[1],line=owner==="white"?P[0]:P[7];
  x.fillStyle=line;
  for(let r=0;r<16;r++)for(let q=0;q<16;q++)if(m[r][q]==="#")for(const[dx,dy]of[[0,1],[2,1],[1,0],[1,2]])x.fillRect(q+dx,r+dy,1,1);
  x.fillStyle=fill;for(let r=0;r<16;r++)for(let q=0;q<16;q++)if(m[r][q]==="#")x.fillRect(q+1,r+1,1,1);
  return maskCache[k]=c;
}
function csNew(){pieces=[];for(const[t,x,y]of SETUP){pieces.push({t,o:"black",x,y:y});pieces.push({t,o:"white",x,y:8-y})}sel=null;turn="white";csBusy=false;$("#csTurn").textContent="White to move";$("#csLog").textContent="new game";drawBoard()}
const at=(x,y)=>pieces.find(p=>p.x===x&&p.y===y);
function targets(p){if(p.t==="wall")return[];const out=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const x=p.x+dx,y=p.y+dy;if(x<0||y<0||x>6||y>8)continue;const q=at(x,y);if(!q||q.o!==p.o&&q.t!=="wall")out.push([x,y,!!q])}return out}
function drawBoard(){
  for(let y=0;y<9;y++)for(let x=0;x<7;x++){bx.fillStyle=(x+y)%2?P[15]:P[7];if(y===4)bx.fillStyle=(x+y)%2?"#f1b994":"#f7d9c4";bx.fillRect(x*CS,y*CS,CS,CS)}
  if(sel){bx.fillStyle="rgba(41,173,255,.35)";bx.fillRect(sel.x*CS,sel.y*CS,CS,CS);for(const[x,y,cap]of targets(sel)){bx.fillStyle=cap?"rgba(255,0,77,.45)":"rgba(41,173,255,.25)";bx.fillRect(x*CS+4,y*CS+4,CS-8,CS-8)}}
  bx.imageSmoothingEnabled=false;
  for(const p of pieces)bx.drawImage(pieceImg(p.t,p.o),p.x*CS+2,p.y*CS+2,36,36);
}
function move(p,x,y){const q=at(x,y);if(q)pieces.splice(pieces.indexOf(q),1);p.x=x;p.y=y;
  $("#csLog").textContent=`${p.o} ${p.t} → ${"abcdefg"[x]}${9-y}${q?" ×"+q.t:""}`;
  if(q&&q.t==="king"){$("#csTurn").textContent=(p.o==="white"?"White":"Black")+" wins. ↺ to replay";turn="over";drawBoard();return}
  turn=p.o==="white"?"black":"white";$("#csTurn").textContent=turn==="white"?"White to move":"Black is thinking…";drawBoard();
  if(turn==="black"){csBusy=true;setTimeout(()=>{const opts=[];for(const b of pieces.filter(p=>p.o==="black"))for(const t of targets(b))opts.push([b,...t]);opts.sort((a,b)=>b[3]-a[3]);const caps=opts.filter(o=>o[3]);const pick=caps.length&&Math.random()<.7?caps[0]:opts[Math.floor(Math.random()*opts.length)];csBusy=false;if(pick)move(pick[0],pick[1],pick[2])},450)}
}
bc.addEventListener("click",e=>{
  if(turn!=="white"||csBusy)return;const r=bc.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/r.width*7),y=Math.floor((e.clientY-r.top)/r.height*9);
  const p=at(x,y);if(p&&p.o==="white"){sel=p.t==="wall"?null:p;if(p.t==="wall")$("#csLog").textContent="walls don't move";drawBoard();return}
  if(sel&&targets(sel).some(t=>t[0]===x&&t[1]===y)){const s=sel;sel=null;move(s,x,y)}else{sel=null;drawBoard()}
});
$("#csReset").onclick=csNew;csNew();

/* ---------- Castle Wars sprite sheets ---------- */
const cwc=$("#cw"),cwx=cwc.getContext("2d");cwx.imageSmoothingEnabled=false;
const ORDER=["swordsman","spearman","hammerman","archer","knight","wizard"];
const ANIMS={idle:420,walk:120,attack:150,victory:300,death:180};
let anim="idle",frame=0;
const imgs={};let loaded=0;
ORDER.forEach(n=>{const i=new Image();i.onload=()=>{loaded++;if(loaded===ORDER.length)cwDraw()};i.src=SPRITES[n].src;imgs[n]=i});
const tabs=$("#cwTabs");
Object.keys(ANIMS).forEach(a=>{const b=document.createElement("button");b.textContent=a;b.setAttribute("aria-pressed",a===anim);b.onclick=()=>{anim=a;frame=0;[...tabs.children].forEach(c=>c.setAttribute("aria-pressed",c===b));$("#cwInfo").textContent=a;cwDraw()};tabs.append(b)});
function cwDraw(){
  cwx.clearRect(0,0,cwc.width,cwc.height);
  ORDER.forEach((n,i)=>{const sp=SPRITES[n],tag=sp.tags[anim],len=tag[1]-tag[0]+1,f=tag[0]+(frame%len);
    const sc=2,col=i%3,row=Math.floor(i/3),cx=col*186+93,base=row*125+118;
    cwx.drawImage(imgs[n],f*sp.w,0,sp.w,sp.h,Math.round(cx-sp.w*sc/2),base-sp.h*sc,sp.w*sc,sp.h*sc)});
}
(function cwLoop(){setTimeout(()=>{frame++;if(loaded===ORDER.length)cwDraw();cwLoop()},RM?900:ANIMS[anim])})();

/* ---------- Pentimento sketch ---------- */
const pc=$("#pentC"),px=pc.getContext("2d");
function pentDraw(split){
  const g=px.createLinearGradient(0,0,400,200);g.addColorStop(0,"#29adff");g.addColorStop(1,"#ff77a8");px.fillStyle=g;px.fillRect(0,0,400,200);
  px.fillStyle="#ffec27";px.beginPath();px.arc(320,60,34,0,7);px.fill();
  px.fillStyle="#1d2b53";px.beginPath();px.moveTo(0,200);px.lineTo(120,110);px.lineTo(210,170);px.lineTo(290,120);px.lineTo(400,200);px.fill();
  px.font="bold 38px 'Instrument Sans',sans-serif";px.fillStyle="#fff1e8";px.fillText("SUMMER SALE",28,72);
  if(split){px.setLineDash([6,4]);px.strokeStyle="#ffec27";px.lineWidth=2;px.strokeRect(22,36,248,48);px.setLineDash([])}
}
pentDraw(false);
$("#pentRun").onclick=()=>{
  const L=$("#layers"),c=$("#pentCmd");L.innerHTML='<div><span class="eye">◉</span> Background</div>';pentDraw(false);
  const lines=["agent> pull the text in this image onto its own layer","$ pentimento detect-text in.png  → 1 region (22,36 248×48)","$ pentimento layer extract --region 0 --name \"SUMMER SALE\"","$ pentimento inpaint --layer 0 --region 0","done: 2 layers"];
  let i=0;c.textContent="";(function step(){c.textContent+=(i?"\n":"")+lines[i];i++;if(i===3){pentDraw(true);const d=document.createElement("div");d.className="new";d.innerHTML='<span class="eye">◉</span> Text: SUMMER SALE';L.prepend(d)}if(i<lines.length)setTimeout(step,RM?0:550)})();
};

/* ---------- Crawler placeholder (simulated) ---------- */
const STRATS=[["URL keywords",.38],["static sim.",.55],["adaptive sim.",.64],["LLM judge",.82]];
const HOSTS=["nature.com","biorxiv.org","pubmed.ncbi.nlm.nih.gov","en.wikipedia.org","deepmind.google","rcsb.org","arxiv.org","github.com","sciencedirect.com","news.ycombinator.com","reddit.com","medium.com","foldit.org","ebi.ac.uk","cell.com","shop.example.com"];
const PATHS=["alphafold-3","protein-folding","casp15-results","structure-prediction","rosettafold","cryo-em-vs-ml","pdb-entry-7xyz","folding-at-home","sequence-to-structure","msa-transformer","careers","pricing","login","about-us","blog/top-10-gadgets"];
const crawl=$("#crawl");const cols=STRATS.map(([n,p])=>{const d=document.createElement("div");d.className="col";d.innerHTML=`<h4><span>${n}</span><span>–</span></h4><ul></ul>`;crawl.append(d);return{ul:d.querySelector("ul"),h:d.querySelector("h4 span:last-child"),p,ok:0,n:0}});
let crN=0,crOn=true;
function crStep(){for(const c of cols){if(Math.random()<.45)continue;const h=HOSTS[Math.floor(Math.random()*HOSTS.length)],pa=PATHS[Math.floor(Math.random()*PATHS.length)];const ok=Math.random()<c.p;c.n++;c.ok+=ok;crN++;
  const li=document.createElement("li");if(!ok)li.className="no";li.innerHTML=`${ok?"✓":"✗"} <i>${(ok?.6+Math.random()*.4:Math.random()*.5).toFixed(2)}</i> ${h}/${pa}`;c.ul.prepend(li);while(c.ul.children.length>14)c.ul.lastChild.remove();c.h.textContent=Math.round(c.ok/c.n*100)+"%"}
  $("#crStat").textContent=`${crN} pages · precision shown per strategy`}
for(let i=0;i<10;i++)crStep();
setInterval(()=>{if(crOn&&!RM)crStep()},700);
$("#crPause").onclick=e=>{crOn=!crOn;e.currentTarget.textContent=crOn?"❚❚":"▶"};

/* ---------- Insider placeholder (simulated) ---------- */
const ic=$("#inC"),ix=ic.getContext("2d");
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const N=160,SPIKE=118,price=[],trades=[];
function inGen(){seed=7;price.length=0;trades.length=0;let p=.22;for(let i=0;i<N;i++){p+=(rnd()-.5)*.012;if(i>=SPIKE&&i<SPIKE+6)p+=.1;p=Math.min(.97,Math.max(.03,p));price.push(p);
  if(rnd()<.35){const sus=i>SPIKE-14&&i<SPIKE&&rnd()<.6;trades.push({i,size:sus?20+rnd()*40:2+rnd()*10,sus,w:"0x"+Math.floor(rnd()*0xffff).toString(16).padStart(4,"0")+"…"+Math.floor(rnd()*0xff).toString(16).padStart(2,"0")})}}}
inGen();
let inT=0,inRaf=0;
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}
function inDraw(){
  const W=ic.width,H=ic.height,pad=40,X=i=>pad+i/(N-1)*(W-pad*2),Y=v=>H-pad-v*(H-pad*2);
  ix.fillStyle=css("--win-bg");ix.fillRect(0,0,W,H);
  ix.strokeStyle=css("--grid")||"#ddd";ix.lineWidth=1;ix.fillStyle=css("--ink-dim");ix.font="20px 'Pixel Operator',monospace";
  for(const v of[0,.25,.5,.75,1]){ix.beginPath();ix.moveTo(pad,Y(v));ix.lineTo(W-pad,Y(v));ix.stroke();ix.fillText(Math.round(v*100)+"¢",4,Y(v)+6)}
  const upto=Math.floor(inT);
  ix.fillStyle="rgba(255,163,0,.15)";if(upto>=SPIKE){ix.fillRect(X(SPIKE),pad,X(SPIKE+6)-X(SPIKE),H-pad*2);ix.fillStyle=css("--warn");ix.fillText("spike",X(SPIKE)+4,pad+16)}
  for(const t of trades){if(t.i>upto)continue;ix.beginPath();ix.arc(X(t.i),Y(price[t.i]),Math.sqrt(t.size)*2,0,7);ix.fillStyle=t.sus&&upto>=SPIKE?"rgba(255,0,77,.75)":"rgba(41,173,255,.4)";ix.fill()}
  ix.strokeStyle=css("--ink");ix.lineWidth=3;ix.beginPath();for(let i=0;i<=Math.min(upto,N-1);i++){i?ix.lineTo(X(i),Y(price[i])):ix.moveTo(X(i),Y(price[i]))}ix.stroke();
  $("#inStat").textContent=`t = ${upto}h of ${N}h`;
}
function inPlay(){cancelAnimationFrame(inRaf);inT=0;$("#flags").innerHTML='<span class="note" style="margin:0">Wallets that bought big before the spike show up here.</span>';let flagged=false;
  const step=()=>{inT+=RM?N:.9;inDraw();if(!flagged&&inT>=SPIKE){flagged=true;const f=$("#flags");f.innerHTML="";trades.filter(t=>t.sus).slice(0,4).forEach((t,k)=>setTimeout(()=>{const d=document.createElement("div");d.innerHTML=`<b>${t.w}</b><br>$${Math.round(t.size)}k · ${SPIKE-t.i}h before`;f.append(d)},k*250))}
    if(inT<N-1)inRaf=requestAnimationFrame(step)};step()}
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){inPlay();io.disconnect()}}),{threshold:.4});
inT=N-1;inDraw();io.observe(ic);
$("#inReplay").onclick=inPlay;

/* ---------- Paint ---------- */
const pnt=$("#paint"),pctx=pnt.getContext("2d");pctx.fillStyle="#fff";pctx.fillRect(0,0,340,200);pctx.lineCap=pctx.lineJoin="round";
let pcol=P[2],psize=5,last=null;
const pal=$("#pal");P.forEach(c=>{const b=document.createElement("button");b.style.background=c;b.setAttribute("aria-label","color "+c);b.setAttribute("aria-pressed",c===pcol);b.onclick=()=>{pcol=c;[...pal.children].forEach(x=>x.setAttribute("aria-pressed",x===b))};pal.append(b)});
document.querySelectorAll("[data-size]").forEach(b=>b.onclick=()=>{psize=+b.dataset.size;document.querySelectorAll("[data-size]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
const ppos=e=>{const r=pnt.getBoundingClientRect();return[(e.clientX-r.left)/r.width*340,(e.clientY-r.top)/r.height*200]};
pnt.addEventListener("pointerdown",e=>{pnt.setPointerCapture(e.pointerId);last=ppos(e);pctx.fillStyle=pcol;pctx.beginPath();pctx.arc(last[0],last[1],psize/2,0,7);pctx.fill()});
pnt.addEventListener("pointermove",e=>{if(!last)return;const p=ppos(e);pctx.strokeStyle=pcol;pctx.lineWidth=psize;pctx.beginPath();pctx.moveTo(...last);pctx.lineTo(...p);pctx.stroke();last=p});
pnt.addEventListener("pointerup",()=>last=null);
$("#pClear").onclick=()=>{pctx.fillStyle="#fff";pctx.fillRect(0,0,340,200)};
// a little starter doodle so the canvas isn't blank
(()=>{pctx.strokeStyle=P[12];pctx.lineWidth=5;pctx.beginPath();pctx.moveTo(30,150);pctx.bezierCurveTo(90,40,150,190,220,80);pctx.stroke();pctx.fillStyle=P[9];pctx.beginPath();pctx.arc(280,60,26,0,7);pctx.fill();pctx.font="22px 'Pixel Operator',monospace";pctx.fillStyle=P[1];pctx.fillText("hi from RArgu OS",40,186)})();
$("#pSave").onclick=()=>toast("Downloads are off in this mockup. On rargu.dev this saves drawing.png");

/* ---------- Music maker ---------- */
const ROWS=[["kick","x...x...x...x..."],["snare","....x.......x..x"],["hat","..x...x...x.x.x."],["bleep","x..x..x...x....."]];
const grid=ROWS.map(r=>[...r[1]].map(c=>c==="x"));
const seq=$("#seq"),cells=[];
ROWS.forEach(([n],r)=>{const s=document.createElement("span");s.textContent=n;seq.append(s);cells[r]=[];for(let i=0;i<16;i++){const b=document.createElement("button");b.className=(grid[r][i]?"on":"")+(i%4===0?" q":"");b.setAttribute("aria-label",`${n} step ${i+1}`);b.onclick=()=>{grid[r][i]=!grid[r][i];b.classList.toggle("on")};seq.append(b);cells[r][i]=b}});
let ac,mStep=0,mTimer=null;
function noise(t,d,hp){const b=ac.createBuffer(1,ac.sampleRate*d,ac.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;const s=ac.createBufferSource();s.buffer=b;const f=ac.createBiquadFilter();f.type="highpass";f.frequency.value=hp;const g=ac.createGain();g.gain.setValueAtTime(.35,t);g.gain.exponentialRampToValueAtTime(.001,t+d);s.connect(f).connect(g).connect(ac.destination);s.start(t)}
const NOTES=[523,659,784,659,587,523,440,392];
function hit(r,t,i){
  if(r===0){const o=ac.createOscillator(),g=ac.createGain();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(40,t+.15);g.gain.setValueAtTime(.8,t);g.gain.exponentialRampToValueAtTime(.001,t+.2);o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.2)}
  if(r===1)noise(t,.15,1200);if(r===2)noise(t,.04,7000);
  if(r===3){const o=ac.createOscillator(),g=ac.createGain();o.type="square";o.frequency.value=NOTES[i%8];g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.2)}
}
$("#mPlay").onclick=e=>{
  if(mTimer){clearInterval(mTimer);mTimer=null;e.currentTarget.textContent="▶ play";cells.flat().forEach(c=>c.classList.remove("now"));return}
  ac=ac||new (window.AudioContext||window.webkitAudioContext)();ac.resume();e.currentTarget.textContent="■ stop";
  const iv=60/112/4*1000;mTimer=setInterval(()=>{const t=ac.currentTime+.02;cells.forEach(r=>r.forEach(c=>c.classList.remove("now")));ROWS.forEach((_,r)=>{cells[r][mStep].classList.add("now");if(grid[r][mStep])hit(r,t,mStep)});mStep=(mStep+1)%16},iv);
};
$("#mClear").onclick=()=>{grid.forEach((r,ri)=>r.forEach((_,i)=>{r[i]=false;cells[ri][i].classList.remove("on")}))};

/* ---------- Notes ---------- */
const notes=$("#notes"),nc=()=>$("#nCount").textContent=notes.value.length+" chars";
try{const v=localStorage.getItem("rargu-notes");if(v)notes.value=v}catch{}
notes.oninput=()=>{nc();try{localStorage.setItem("rargu-notes",notes.value)}catch{}};nc();
$("#nSave").onclick=()=>toast("Downloads are off in this mockup. On rargu.dev this saves notes.txt");

