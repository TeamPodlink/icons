import sharp from "sharp";
import { execFileSync } from "node:child_process"; import { mkdirSync, writeFileSync } from "node:fs";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export async function chrome(svgText, outPng, size=1024){ const dir=`${WORK}/chrome-${Math.floor(Math.random()*1e9)}`; mkdirSync(dir,{recursive:true}); writeFileSync(`${dir}/icon.svg`,svgText); writeFileSync(`${dir}/wrap.html`,`<!doctype html><html><head><style>html,body{margin:0;padding:0}img{width:${size}px;height:${size}px;display:block}</style></head><body><img src="icon.svg"></body></html>`); execFileSync(CHROME,["--headless=new","--disable-gpu",`--screenshot=${outPng}`,`--window-size=${size},${size}`,"--default-background-color=00000000",`${dir}/wrap.html`],{stdio:"ignore"}); return raw(outPng); }
export async function raw(p){ const {data,info}=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true}); return {d:data,w:info.width,h:info.height}; }
export function stats(A,B){ // A,B RGBA same size: alpha IoU, colour RMSE over both-opaque px, bboxes
  let inter=0,uni=0,s=0,n=0; const bb=(X)=>{let x0=1e9,y0=1e9,x1=-1,y1=-1; for(let y=0;y<X.h;y++)for(let x=0;x<X.w;x++){if(X.d[(y*X.w+x)*4+3]>127){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}} return [x0,y0,x1,y1];};
  for(let i=0;i<A.d.length;i+=4){const a=A.d[i+3]>127,b=B.d[i+3]>127; if(a&&b){inter++; for(let c=0;c<3;c++){const e=A.d[i+c]-B.d[i+c]; s+=e*e;} n+=3;} if(a||b)uni++;}
  return {iou:inter/uni, rmse:Math.sqrt(s/n), bbA:bb(A), bbB:bb(B)}; }
export async function sheet(paths, out, size=256){ const bufs=[]; for(const p of paths) bufs.push(await sharp(p).resize(size,size).png().toBuffer()); await sharp({create:{width:size*paths.length,height:size,channels:4,background:"#888"}}).composite(bufs.map((b,i)=>({input:b,left:i*size,top:0}))).png().toFile(out); }
import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..", "..");
export const WORK = process.env.WORK ?? "/tmp/podcastparrot-flat-work";   // scratch: masks, renders, fits
export const RASTER = join(ROOT, "platforms/podcastparrot/PodcastParrot.icon/Assets/parrot.png");
export const SUPPLIED = join(here, "supplied.svg");
mkdirSync(WORK, { recursive: true });
