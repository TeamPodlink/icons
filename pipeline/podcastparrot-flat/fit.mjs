// Fit every kept element's fill (gradient stop colours or solid) to the raster's own pixels by least squares, in the element's local (gradient) space; emit the SVG.
import { readFileSync, writeFileSync } from "node:fs"; import { chrome, raw, stats, sheet, WORK, RASTER, SUPPLIED } from "./lib.mjs";
const S=WORK; const W=1024; const stage=process.argv[2]||"stage2";
const src=readFileSync(SUPPLIED,"utf8"); const els=JSON.parse(readFileSync(`${WORK}/elements.json`,"utf8"));
const T=await raw(RASTER);
const defs=src.slice(src.indexOf("<defs>"), src.indexOf("</defs>")+7);
const grads={}; for(const m of defs.matchAll(/<(linearGradient|radialGradient) id="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g)){ const attrs=Object.fromEntries([...m[3].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])); const stops=[...m[4].matchAll(/<stop([^>]*)\/>/g)].map(s=>{const a=Object.fromEntries([...s[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]])); return {offset:parseFloat(a.offset||0), color:a["stop-color"]};}); grads[m[2]]={kind:m[1],attrs,stops}; }
function tOf(g){ const a=g.attrs; if(g.kind==="linearGradient"){ const x1=+a.x1,y1=+a.y1,x2=+a.x2,y2=+a.y2, dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy; return (x,y)=>Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/L)); }
  const m=a.gradientTransform.match(/translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\) scale\(([-\d.]+)(?: ([-\d.]+))?\)/); const tx=+m[1],ty=+m[2],th=+m[3]*Math.PI/180,sx=+m[4],sy=m[5]!==undefined?+m[5]:+m[4]; const c=Math.cos(th),s=Math.sin(th);
  return (x,y)=>{ const px=x-tx,py=y-ty; const rx=c*px+s*py, ry=-s*px+c*py; return Math.min(1,Math.hypot(rx/sx, ry/sy)); }; }
function hat(stops,t){ const w=new Array(stops.length).fill(0); if(t<=stops[0].offset){w[0]=1;return w;} if(t>=stops[stops.length-1].offset){w[stops.length-1]=1;return w;} for(let k=1;k<stops.length;k++){ if(t<=stops[k].offset){ const u=(t-stops[k-1].offset)/(stops[k].offset-stops[k-1].offset); w[k-1]=1-u; w[k]=u; return w; } } return w; }
function solve(M,v){ const n=v.length; const a=M.map((r,i)=>[...r,v[i]]); for(let c=0;c<n;c++){ let p=c; for(let r=c+1;r<n;r++) if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r; [a[c],a[p]]=[a[p],a[c]]; if(Math.abs(a[c][c])<1e-12)continue; for(let r=0;r<n;r++){ if(r===c)continue; const f=a[r][c]/a[c][c]; for(let k=c;k<=n;k++)a[r][k]-=f*a[c][k]; } } return v.map((_,i)=>Math.abs(a[i][i])<1e-12?0:a[i][n]/a[i][i]); }
const hex=(rgb)=>"#"+rgb.map(c=>Math.max(0,Math.min(255,Math.round(c))).toString(16).padStart(2,"0")).join("").toUpperCase();
const trAttr=(t)=>t?`translate(${(t.cx+t.tx-t.s*t.cx).toFixed(3)} ${(t.cy+t.ty-t.s*t.cy).toFixed(3)}) scale(${t.s})`:null;
const KEEP=(process.env.KEEP||"2,6,8,11,12,14,16,17,20,21,22,24").split(",").map(Number);
const masks={}; for(const i of KEEP){ const M=await raw(`${WORK}/mask-${i}.png`); masks[i]=new Uint8Array(W*W); for(let p=0;p<W*W;p++)masks[i][p]=M.d[p*4+3]>127?1:0; }
const fitted={}; const report=[];
for(const i of KEEP){ const e=els[i]; const tr=e.transform; const L=tr?(x,y)=>[(x-tr.cx-tr.tx)/tr.s+tr.cx,(y-tr.cy-tr.ty)/tr.s+tr.cy]:(x,y)=>[x,y];
  const samples=[]; for(let y=0;y<W;y++)for(let x=0;x<W;x++){ const p=y*W+x; if(!masks[i][p])continue; let hidden=0; for(const j of KEEP) if(j>i&&masks[j][p]){hidden=1;break;} if(hidden)continue; const q=p*4; if(T.d[q+3]<250)continue; samples.push([...L(x,y),T.d[q],T.d[q+1],T.d[q+2]]); }
  const fill=e.fill; if(fill&&fill.startsWith("url(")){ const g=grads[fill.slice(5,-1)]; const tf=tOf(g); const n=g.stops.length; const M=Array.from({length:n},()=>new Array(n).fill(0)); const v=[0,1,2].map(()=>new Array(n).fill(0));
    for(const [x,y,r,gg,b] of samples){ const w=hat(g.stops,tf(x,y)); for(let a=0;a<n;a++){ if(!w[a])continue; for(let c=0;c<n;c++)M[a][c]+=w[a]*w[c]; v[0][a]+=w[a]*r; v[1][a]+=w[a]*gg; v[2][a]+=w[a]*b; } }
    for(let a=0;a<n;a++)M[a][a]+=1e-6; const R=solve(M,v[0]),G=solve(M,v[1]),B=solve(M,v[2]); const cols=g.stops.map((s,k)=>[R[k],G[k],B[k]]);
    let se=0; for(const [x,y,r,gg,b] of samples){ const w=hat(g.stops,tf(x,y)); let cr=0,cg=0,cb=0; for(let k=0;k<n;k++){cr+=w[k]*cols[k][0];cg+=w[k]*cols[k][1];cb+=w[k]*cols[k][2];} se+=(cr-r)**2+(cg-gg)**2+(cb-b)**2; }
    fitted[i]={gradient:fill.slice(5,-1),stops:cols.map(hex)}; report.push(`${i} ${fill} n=${samples.length} rmse=${Math.sqrt(se/(3*samples.length)).toFixed(2)} -> ${cols.map(hex).join(",")}`);
  } else { let r=0,g=0,b=0; for(const s of samples){r+=s[2];g+=s[3];b+=s[4];} const n=samples.length; const c=[r/n,g/n,b/n]; let se=0; for(const s of samples)se+=(s[2]-c[0])**2+(s[3]-c[1])**2+(s[4]-c[2])**2; fitted[i]={solid:hex(c)}; report.push(`${i} ${fill} n=${n} rmse=${Math.sqrt(se/(3*n)).toFixed(2)} -> solid ${hex(c)}`); } }
console.log(report.join("\n"));
writeFileSync(`${WORK}/fit-${stage}.json`, JSON.stringify({fitted, elements: KEEP.map(i=>({i, src: els[i].src, transform: els[i].transform, group: els[i].group}))},null,1));
let out=defs; for(const [id,f] of Object.entries(fitted)){ if(!f.gradient)continue; let k=0; out=out.replace(new RegExp(`(<(?:linear|radial)Gradient id="${f.gradient}"[^>]*>)([\\s\\S]*?)(</(?:linear|radial)Gradient>)`), (m,a,b,c)=>a+b.replace(/stop-color="[^"]*"/g,()=>`stop-color="${f.stops[k++]}"`).replace(/ stop-opacity="[^"]*"/g,"")+c); }
const body=KEEP.map(i=>{ const e=els[i]; let l=e.src.replace(/\s(stroke|stroke-width|stroke-opacity|stroke-linecap|stroke-linejoin|opacity)="[^"]*"/g,""); if(fitted[i].solid) l=l.replace(/fill="[^"]*"/,`fill="${fitted[i].solid}"`); const t=trAttr(e.transform); if(t) l=l.replace(/^<(\w+)/,`<$1 transform="${t}"`); return e.group?`${e.group}${l}</g>`:l; }).join("\n");
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">\n${out}\n${body}\n</svg>`;
writeFileSync(`${WORK}/${stage}.svg`,svg);
const R1=await chrome(svg,`${WORK}/${stage}-1024.png`); console.log(`${stage} vs raster:`, stats(R1,T));
await sheet([RASTER,`${WORK}/${stage}-1024.png`], `${WORK}/sheet-${stage}.png`, 512);
