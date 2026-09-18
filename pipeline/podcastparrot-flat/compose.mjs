// Compose the house 32-unit icon.svg / badge.svg from a fitted 1024-space parrot SVG: declared light canvas (gray 1.0 -> 0.925) under the parrot group scaled 1/32.
import { readFileSync, writeFileSync } from "node:fs"; import { WORK } from "./lib.mjs";
const S=WORK; const stage=process.argv[2]||"stage3"; const svg=readFileSync(`${WORK}/${stage}.svg`,"utf8");
let defs=svg.slice(svg.indexOf("<defs>")+6, svg.indexOf("</defs>")); let body=svg.slice(svg.indexOf("</defs>")+7).replace(/<\/svg>\s*$/,"");
// drop XML comments, collapse whitespace
const clean=(s)=>s.replace(/<!--[\s\S]*?-->/g,"").replace(/>\s+</g,"><").replace(/\s+/g," ").replace(/\s*\/>/g,"/>").trim();
defs=clean(defs); body=clean(body);
// rename ids: gradients/clips in order of appearance -> podcastparrot-unmasked__b, __c, ... (__a is the plate)
const ids=[...defs.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]); const used=new Set([...body.matchAll(/url\(#([^)]+)\)/g)].map(m=>m[1]).concat([...defs.matchAll(/url\(#([^)]+)\)/g)].map(m=>m[1])));
const map={}; let n=1; for(const id of ids){ if(!used.has(id))continue; map[id]="podcastparrot-unmasked__"+String.fromCharCode(97+n++); }
// remove unused defs
defs=defs.replace(/<(linearGradient|radialGradient|clipPath) id="([^"]+)"[\s\S]*?<\/\1>/g,(m,tag,id)=>used.has(id)?m:"");
const ren=(s)=>s.replace(/ id="([^"]+)"/g,(m,id)=>map[id]?` id="${map[id]}"`:m).replace(/url\(#([^)]+)\)/g,(m,id)=>map[id]?`url(#${map[id]})`:m);
defs=ren(defs); body=ren(body);
// shorten numbers: trailing zeros, leading 0.
const tidy=(s)=>s.replace(/(\d+\.\d*?)0+(?=[\s",)/])/g,"$1").replace(/(\d)\.(?=[\s",)/])/g,"$1").replace(/(^|[\s"(,])0\.(\d)/g,"$1.$2").replace(/(^|[\s"(,-])0\.(\d)/g,"$1.$2");
const plate=`<linearGradient id="podcastparrot-unmasked__a" x1="16" x2="16" y1="0" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#ECECEC"/></linearGradient>`;
const art=`<path fill="url(#podcastparrot-unmasked__a)" d="M0 0h32v32H0z"/><g transform="scale(.03125)">${body}</g>`;
const icon=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32"><defs>${plate}${tidy(defs)}</defs>${tidy(art)}</svg>`;
const badge=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32">\n  <defs>${plate}${tidy(defs)}<clipPath id="shape"><path d="M16 0C30.545 0 32 1.455 32 16S30.545 32 16 32S0 30.545 0 16S1.455 0 16 0Z"/></clipPath></defs>\n  <g clip-path="url(#shape)">${tidy(art)}</g>\n</svg>`;
writeFileSync(`${WORK}/icon.svg`, icon+"\n"); writeFileSync(`${WORK}/badge.svg`, badge+"\n");
console.log("icon.svg bytes", icon.length, "ids", JSON.stringify(map));
