// Stage 2: register each feature to the raster's own colour-class region (translate + scale about the feature's centre, XOR-minimised); eye discs are circle fits to the white/dark blobs.
import { readFileSync, writeFileSync } from "node:fs"; import { raw, WORK, RASTER, SUPPLIED } from "./lib.mjs";
const S=WORK, W=1024; const cls=new Uint8Array(readFileSync(`${WORK}/classes.bin`)); const T=await raw(RASTER);
const els=JSON.parse(readFileSync(`${WORK}/elements.json`,"utf8"));
async function mask(i){ const M=await raw(`${WORK}/mask-${i}.png`); const m=new Uint8Array(W*W); for(let p=0;p<W*W;p++)m[p]=M.d[p*4+3]>127?1:0; return m; }
const union=(...ms)=>{const u=new Uint8Array(W*W); for(const m of ms)for(let p=0;p<W*W;p++)if(m[p])u[p]=1; return u;};
const minus=(a,b)=>{const u=new Uint8Array(W*W); for(let p=0;p<W*W;p++)u[p]=a[p]&&!b[p]?1:0; return u;};
const classMask=(c,pred)=>{const u=new Uint8Array(W*W); for(let p=0;p<W*W;p++){ if(cls[p]!==c)continue; if(pred&&!pred(p))continue; u[p]=1;} return u;};
function comp(m,sx,sy){ // connected component of mask m containing the mask pixel nearest (sx,sy)
  let best=null,bd=1e18; for(let y=0;y<W;y++)for(let x=0;x<W;x++){ if(!m[y*W+x])continue; const d=(x-sx)**2+(y-sy)**2; if(d<bd){bd=d;best=[x,y];} }
  const out=new Uint8Array(W*W); const st=[best]; out[best[1]*W+best[0]]=1; let cnt=0,ax=0,ay=0; while(st.length){const [x,y]=st.pop(); cnt++;ax+=x;ay+=y; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=W)continue; const i=ny*W+nx; if(m[i]&&!out[i]){out[i]=1;st.push([nx,ny]);}}} return {m:out,cnt,cx:ax/cnt+0.5,cy:ay/cnt+0.5,r:Math.sqrt(cnt/Math.PI)}; }
function bbox(m){let x0=1e9,y0=1e9,x1=-1,y1=-1; for(let y=0;y<W;y++)for(let x=0;x<W;x++)if(m[y*W+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;} return [x0,y0,x1,y1];}
function warp(m,s,tx,ty,cx,cy){ const o=new Uint8Array(W*W); for(let y=0;y<W;y++)for(let x=0;x<W;x++){ const sx=Math.round((x-cx-tx)/s+cx), sy=Math.round((y-cy-ty)/s+cy); if(sx<0||sy<0||sx>=W||sy>=W)continue; if(m[sy*W+sx])o[y*W+x]=1; } return o; }
function fit(m,target,label){ const [x0,y0,x1,y1]=bbox(union(m,target)); const cx=(bbox(m)[0]+bbox(m)[2])/2, cy=(bbox(m)[1]+bbox(m)[3])/2;
  const xor=(s,tx,ty,step)=>{ let n=0; for(let y=Math.max(0,y0-20);y<=Math.min(W-1,y1+20);y+=step)for(let x=Math.max(0,x0-20);x<=Math.min(W-1,x1+20);x+=step){ const sx=Math.round((x-cx-tx)/s+cx), sy=Math.round((y-cy-ty)/s+cy); const v=(sx<0||sy<0||sx>=W||sy>=W)?0:m[sy*W+sx]; if(v!==target[y*W+x])n++; } return n; };
  let best={n:1e9}; for(let s=0.90;s<=1.101;s+=0.02)for(let tx=-16;tx<=16;tx+=2)for(let ty=-16;ty<=16;ty+=2){const n=xor(s,tx,ty,2); if(n<best.n)best={n,s,tx,ty};}
  let b2={n:1e9}; for(let s=best.s-0.02;s<=best.s+0.0201;s+=0.005)for(let tx=best.tx-2;tx<=best.tx+2;tx++)for(let ty=best.ty-2;ty<=best.ty+2;ty++){const n=xor(s,tx,ty,1); if(n<b2.n)b2={n,s:+s.toFixed(3),tx,ty};}
  const id=xor(1,0,0,1); console.log(`${label}: identity xor ${id} -> fitted xor ${b2.n} at s=${b2.s} t=(${b2.tx},${b2.ty}) about (${cx},${cy})`); return {...b2,cx,cy}; }
const hsl=(p)=>{let r=T.d[p*4]/255,g=T.d[p*4+1]/255,b=T.d[p*4+2]/255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); const l=(mx+mn)/2; let h=0; if(mx!==mn){const d=mx-mn; if(mx===r)h=((g-b)/d+(g<b?6:0)); else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4; h*=60;} return [h,l];};
// eye discs
const dark=classMask(3), white=classMask(4);
const pupil=comp(dark,506,302); const irisRing=comp(white,506,302); const irisDisc=union(irisRing.m,pupil.m); let cnt=0,ax=0,ay=0; for(let p=0;p<W*W;p++)if(irisDisc[p]){cnt++;ax+=p%W;ay+=Math.floor(p/W);} const iris={cx:ax/cnt+0.5,cy:ay/cnt+0.5,r:Math.sqrt(cnt/Math.PI),cnt};
console.log("pupil", {cx:pupil.cx.toFixed(2),cy:pupil.cy.toFixed(2),r:pupil.r.toFixed(2),cnt:pupil.cnt}, "iris", {cx:iris.cx.toFixed(2),cy:iris.cy.toFixed(2),r:iris.r.toFixed(2),cnt:iris.cnt}, "supplied: iris (506,302) r59, pupil r36");
// beak
const beakTarget=minus(dark,pupil.m); const beakMask=union(await mask(20),await mask(22),await mask(24)); const beakFit=fit(beakMask,beakTarget,"beak 20+22+24");
// wing
const wingFit=fit(await mask(14),classMask(2),"wing 14");
const purple=classMask(2,(p)=>{const [h]=hsl(p); return h>=255&&h<=300;}); const topFit=fit(await mask(17),purple,"top feathers 17 vs purple");
// face: visible = mask8 minus registered beak; target = peach ∪ iris disc
const beakReg=warp(beakMask,beakFit.s,beakFit.tx,beakFit.ty,beakFit.cx,beakFit.cy); const faceVis=minus(await mask(8),beakReg); const faceTarget=union(classMask(5),irisDisc); const faceFit=fit(faceVis,faceTarget,"face 8 (visible) vs peach+eye");
// shoulder plumage 6: warm sub-band? leave with body. body+shoulder get the global translate(-1,0).
for(const e of els){ delete e.transform; }
const setT=(i,f)=>{ els[i].transform={s:f.s,tx:f.tx,ty:f.ty,cx:f.cx,cy:f.cy}; };
for(const i of [20,21,22,24]) setT(i,beakFit); for(const i of [14,16,17]) setT(i,wingFit); setT(8,faceFit); // 17 rides the wing transform: its own purple-hue fit (topFit) scored no better overall and distorted the lobe (README ledger)
for(const i of [2,6]) setT(i,{s:1,tx:-1,ty:0,cx:512,cy:512});
els[11].src=els[11].src.replace(/cx="[^"]*" cy="[^"]*" r="[^"]*"/,`cx="${iris.cx.toFixed(2)}" cy="${iris.cy.toFixed(2)}" r="${iris.r.toFixed(2)}"`);
els[12].src=els[12].src.replace(/cx="[^"]*" cy="[^"]*" r="[^"]*"/,`cx="${pupil.cx.toFixed(2)}" cy="${pupil.cy.toFixed(2)}" r="${pupil.r.toFixed(2)}"`);
writeFileSync(`${WORK}/elements.json`, JSON.stringify(els,null,1)); console.log("written");
