// Stage 3: put the supplied SVG's translucent overlays back over the stage-2 render, each refit to the raster.
// ALPHA=fixed (default): stop opacities stay as supplied, stop colours are least squares: T - B(1-alpha(t)) = sum_k w_k alpha_k c_k.
// ALPHA=free: premultiplied colour + opacity per stop, unconstrained (can clamp badly).
import { readFileSync, writeFileSync } from "node:fs"; import { chrome, raw, stats, sheet, WORK, RASTER, SUPPLIED } from "./lib.mjs";
const S=WORK, W=1024; const base=process.argv[2]||"stage2"; const OV=(process.env.OV||"3,4,15").split(",").map(Number); const FIXED=(process.env.ALPHA||"fixed")==="fixed";
const src=readFileSync(SUPPLIED,"utf8"); const els=JSON.parse(readFileSync(`${WORK}/elements.json`,"utf8"));
const T=await raw(RASTER); const B=await raw(`${WORK}/${base}-1024.png`);
const baseSvg=readFileSync(`${WORK}/${base}.svg`,"utf8"); const fitBase=JSON.parse(readFileSync(`${WORK}/fit-${base}.json`,"utf8"));
const KEEP=fitBase.elements.map(e=>e.i);
const defs=src.slice(src.indexOf("<defs>"), src.indexOf("</defs>")+7);
const grads={}; for(const m of defs.matchAll(/<(linearGradient|radialGradient) id="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g)){ const attrs=Object.fromEntries([...m[3].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])); const stops=[...m[4].matchAll(/<stop([^>]*)\/>/g)].map(s=>{const a=Object.fromEntries([...s[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]])); return {offset:parseFloat(a.offset||0), alpha:a["stop-opacity"]!==undefined?parseFloat(a["stop-opacity"]):1};}); grads[m[2]]={kind:m[1],attrs,stops}; }
function tOf(g){ const a=g.attrs; if(g.kind==="linearGradient"){ const x1=+a.x1,y1=+a.y1,x2=+a.x2,y2=+a.y2, dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy; return (x,y)=>Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/L)); }
  const m=a.gradientTransform.match(/translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\) scale\(([-\d.]+)(?: ([-\d.]+))?\)/); const tx=+m[1],ty=+m[2],th=+m[3]*Math.PI/180,sx=+m[4],sy=m[5]!==undefined?+m[5]:+m[4]; const c=Math.cos(th),s=Math.sin(th);
  return (x,y)=>{ const px=x-tx,py=y-ty; const rx=c*px+s*py, ry=-s*px+c*py; return Math.min(1,Math.hypot(rx/sx, ry/sy)); }; }
function hat(stops,t){ const w=new Array(stops.length).fill(0); if(t<=stops[0].offset){w[0]=1;return w;} if(t>=stops[stops.length-1].offset){w[stops.length-1]=1;return w;} for(let k=1;k<stops.length;k++){ if(t<=stops[k].offset){ const u=(t-stops[k-1].offset)/(stops[k].offset-stops[k-1].offset); w[k-1]=1-u; w[k]=u; return w; } } return w; }
function solve(M,v){ const n=v.length; const a=M.map((r,i)=>[...r,v[i]]); for(let c=0;c<n;c++){ let p=c; for(let r=c+1;r<n;r++) if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r; [a[c],a[p]]=[a[p],a[c]]; if(Math.abs(a[c][c])<1e-12)continue; for(let r=0;r<n;r++){ if(r===c)continue; const f=a[r][c]/a[c][c]; for(let k=c;k<=n;k++)a[r][k]-=f*a[c][k]; } } return v.map((_,i)=>Math.abs(a[i][i])<1e-12?0:a[i][n]/a[i][i]); }
const hex=(rgb)=>"#"+rgb.map(c=>Math.max(0,Math.min(255,Math.round(c))).toString(16).padStart(2,"0")).join("").toUpperCase();
const masks={}; for(const i of [...KEEP,...OV]){ const M=await raw(`${WORK}/mask-${i}.png`); masks[i]=new Uint8Array(W*W); for(let p=0;p<W*W;p++)masks[i][p]=M.d[p*4+3]>127?1:0; }
const out=[]; const rep=[];
for(const i of OV){ const e=els[i]; const fill=e.fill; const elOp=e.opacity!==undefined?parseFloat(e.opacity):1; const g=fill.startsWith("url(")?grads[fill.slice(5,-1)]:{stops:[{offset:0,alpha:1}]}; const tf=g.attrs?tOf(g):()=>0; const n=g.stops.length; const fixedA=g.stops.map(s=>s.alpha*elOp);
  const rows=[]; for(let y=0;y<W;y++)for(let x=0;x<W;x++){ const p=y*W+x; if(!masks[i][p])continue; let hidden=0; for(const j of KEEP) if(j>i&&masks[j][p]){hidden=1;break;} if(hidden)continue; if(T.d[p*4+3]<250||B.d[p*4+3]<250)continue; rows.push([hat(g.stops,tf(x,y)), [B.d[p*4],B.d[p*4+1],B.d[p*4+2]], [T.d[p*4],T.d[p*4+1],T.d[p*4+2]]]); }
  let stops=[];
  if(FIXED){ const M2=Array.from({length:n},()=>new Array(n).fill(0)); const v2=[0,1,2].map(()=>new Array(n).fill(0));
    for(const [w,b,t] of rows){ let al=0; for(let k=0;k<n;k++)al+=w[k]*fixedA[k]; for(let a=0;a<n;a++){ const wa=w[a]*fixedA[a]; if(!wa)continue; for(let bb=0;bb<n;bb++)M2[a][bb]+=wa*w[bb]*fixedA[bb]; } for(let c=0;c<3;c++){ const y=t[c]-b[c]*(1-al); for(let a=0;a<n;a++){ const wa=w[a]*fixedA[a]; if(!wa)continue; v2[c][a]+=wa*y; } } }
    for(let a=0;a<n;a++)M2[a][a]+=1e-6; const R=solve(M2,v2[0]),G=solve(M2,v2[1]),Bc=solve(M2,v2[2]); for(let k=0;k<n;k++) stops.push({alpha:fixedA[k], color:hex(fixedA[k]?[R[k],G[k],Bc[k]]:[0,0,0])});
  } else { const U=4*n; const M=Array.from({length:U},()=>new Array(U).fill(0)); const v=new Array(U).fill(0);
    for(const [w,b,t] of rows){ for(let c=0;c<3;c++){ const row=new Array(U).fill(0); for(let k=0;k<n;k++){ if(!w[k])continue; row[k]=-w[k]*b[c]; row[n+c*n+k]=w[k]; } const y=t[c]-b[c]; for(let a=0;a<U;a++){ if(!row[a])continue; v[a]+=row[a]*y; for(let bb=0;bb<U;bb++) if(row[bb]) M[a][bb]+=row[a]*row[bb]; } } }
    for(let a=0;a<U;a++)M[a][a]+=1e-6; const sol=solve(M,v); for(let k=0;k<n;k++){ const al=Math.max(0,Math.min(1,sol[k])); const p=[sol[n+k],sol[2*n+k],sol[3*n+k]]; stops.push({alpha:al, color:hex(al>0.02?p.map(c=>c/al):[0,0,0])}); } }
  let se0=0,se1=0; for(const [w,b,t] of rows){ let al=0; const pc=[0,0,0]; for(let k=0;k<n;k++){ al+=w[k]*stops[k].alpha; const c=stops[k].color; const rgb=[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]; for(let q=0;q<3;q++)pc[q]+=w[k]*stops[k].alpha*rgb[q]; } for(let q=0;q<3;q++){ se0+=(t[q]-b[q])**2; const comp=b[q]*(1-al)+pc[q]; se1+=(t[q]-comp)**2; } }
  const r0=Math.sqrt(se0/(3*rows.length)), r1=Math.sqrt(se1/(3*rows.length)); rep.push(`${i} ${fill} n=${rows.length} rmse ${r0.toFixed(2)} -> ${r1.toFixed(2)} ${r1<r0?"KEEP":"drop"} stops ${stops.map(s=>`${s.color}@${s.alpha.toFixed(3)}`).join(" ")}`);
  if(r1<r0 || process.env.KEEPALL) out.push({i,stops,gradient:g.attrs?fill.slice(5,-1):null});
}
console.log(rep.join("\n"));
let defsOut=baseSvg.slice(baseSvg.indexOf("<defs>"), baseSvg.indexOf("</defs>")+7);
for(const o of out){ if(!o.gradient)continue; let k=0; defsOut=defsOut.replace(new RegExp(`(<(?:linear|radial)Gradient id="${o.gradient}"[^>]*>)([\\s\\S]*?)(</(?:linear|radial)Gradient>)`), (m,a,b,c)=>a+b.replace(/<stop([^>]*)\/>/g,(mm,attrs)=>{ const s=o.stops[k++]; const off=attrs.match(/offset="[^"]*"/); return `<stop${off?" "+off[0]:""} stop-color="${s.color}"${s.alpha<1?` stop-opacity="${+s.alpha.toFixed(3)}"`:""}/>`; })+c); }
const trAttr=(t)=>t?`translate(${(t.cx+t.tx-t.s*t.cx).toFixed(3)} ${(t.cy+t.ty-t.s*t.cy).toFixed(3)}) scale(${t.s})`:null;
const baseLines=baseSvg.slice(baseSvg.indexOf("</defs>")+7).trim().replace(/<\/svg>\s*$/,"").trim().split("\n"); const baseBody=Object.fromEntries(baseLines.map((l,idx)=>[KEEP[idx],l]));
const all=[...KEEP,...out.map(o=>o.i)].sort((a,b)=>a-b); const body=all.map(i=>{ if(baseBody[i]!==undefined)return baseBody[i]; const e=els[i]; const o=out.find(x=>x.i===i); let l=e.src.replace(/\s(stroke|stroke-width|stroke-opacity|stroke-linecap|stroke-linejoin|opacity)="[^"]*"/g,""); if(!o.gradient){ l=l.replace(/fill="[^"]*"/,`fill="${o.stops[0].color}"${o.stops[0].alpha<1?` fill-opacity="${+o.stops[0].alpha.toFixed(3)}"`:""}`); } const t=trAttr(e.transform); if(t) l=l.replace(/^<(\w+)/,`<$1 transform="${t}"`); return e.group?`${e.group}${l}</g>`:l; }).join("\n");
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">\n${defsOut}\n${body}\n</svg>`;
writeFileSync(`${WORK}/stage3.svg`,svg); writeFileSync(`${WORK}/fit-stage3.json`,JSON.stringify(out,null,1));
const R=await chrome(svg,`${WORK}/stage3-1024.png`); console.log("stage3 vs raster:", stats(R,T));
await sheet([RASTER,`${WORK}/stage3-1024.png`], `${WORK}/sheet-stage3.png`, 512);
