// Colour-class segmentation of the bundle raster (classes.bin: 0 bg, 1 body, 2 wing, 3 dark, 4 white, 5 face) + optional 4x|diff| heatmap of a stage render.
import sharp from "sharp"; import { writeFileSync, existsSync } from "node:fs"; import { raw, WORK, RASTER } from "./lib.mjs";
const W=1024; const T=await raw(RASTER); const stage=process.argv[2]||null; const R=stage&&existsSync(`${WORK}/${stage}-1024.png`)?await raw(`${WORK}/${stage}-1024.png`):null;
function hsl(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); const l=(mx+mn)/2; let h=0,s=0; if(mx!==mn){ const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn); if(mx===r)h=((g-b)/d+(g<b?6:0)); else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; } return [h,s,l]; }
const cls=new Uint8Array(W*W); const colors={1:[255,140,0],2:[60,60,220],3:[30,30,30],4:[250,250,250],5:[255,215,190]}; const counts={};
for(let p=0;p<W*W;p++){ if(T.d[p*4+3]<128)continue; const [h,s,l]=hsl(T.d[p*4],T.d[p*4+1],T.d[p*4+2]); let c;
  if(l<0.32&&s<0.35)c=3; else if(l>0.9&&s<0.3)c=4; else if(h>=190&&h<=310&&s>0.25)c=2; else if(h>=5&&h<=40&&s<0.98&&l>0.72)c=5; else c=1; cls[p]=c; counts[c]=(counts[c]||0)+1; }
console.log("class px", counts);
const img=Buffer.alloc(W*W*4); const heat=Buffer.alloc(W*W*4);
for(let p=0;p<W*W;p++){ const c=cls[p]; if(c) img.set([...colors[c],255],p*4); if(R){ const a=T.d[p*4+3]>127&&R.d[p*4+3]>127; if(a){ let m=0; for(let k=0;k<3;k++)m=Math.max(m,Math.abs(T.d[p*4+k]-R.d[p*4+k])); const v=Math.min(255,m*4); heat.set([v,v,v,255],p*4);} else heat.set([0,0,0,255],p*4); } }
await sharp(img,{raw:{width:W,height:W,channels:4}}).png().toFile(`${WORK}/classes.png`);
if(R) await sharp(heat,{raw:{width:W,height:W,channels:4}}).png().toFile(`${WORK}/heat-${stage}.png`);
writeFileSync(`${WORK}/classes.bin`, cls);
