// Per-element visibility masks: element i solid white (own transform + clip kept), everything else removed. Element list (src/transform) comes from elements.json when present.
import { readFileSync, writeFileSync, existsSync } from "node:fs"; import { chrome, WORK, RASTER, SUPPLIED } from "./lib.mjs";
const S=WORK; const src=readFileSync(SUPPLIED,"utf8");
let els; if(existsSync(`${WORK}/elements.json`)) els=JSON.parse(readFileSync(`${WORK}/elements.json`,"utf8")); else {
  const lines=src.split("\n"); els=[]; let group=null;
  for(let i=0;i<lines.length;i++){ const l=lines[i].trim(); if(/^<g clip-path=/.test(l)) group=l; else if(l==="</g>") group=null;
    else if(/^<(path|rect|circle|ellipse)\b/.test(l)) els.push({i:els.length,group,src:l,opacity:(l.match(/\bopacity="([^"]+)"/)||[])[1],fill:(l.match(/\bfill="([^"]+)"/)||[])[1],stroke:(l.match(/\bstroke="([^"]+)"/)||[])[1]}); }
  writeFileSync(`${WORK}/elements.json`, JSON.stringify(els,null,1)); }
export const trAttr=(t)=>t?`translate(${(t.cx+t.tx-t.s*t.cx).toFixed(3)} ${(t.cy+t.ty-t.s*t.cy).toFixed(3)}) scale(${t.s})`:null;
const defs=src.slice(src.indexOf("<defs>"), src.indexOf("</defs>")+7);
const head=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">`;
const only=process.argv[2]?process.argv.slice(2).map(Number):null;
for(const e of els){ if(only&&!only.includes(e.i))continue; let el=e.src.replace(/\s(fill|stroke|opacity|stroke-opacity|stroke-width|stroke-linecap|stroke-linejoin)="[^"]*"/g,""); el=el.replace(/^<(\w+)/,'<$1 fill="#fff"'+(e.stroke?' stroke="#fff"':''));
  const inner=e.group?`${e.group}${el}</g>`:el; const t=trAttr(e.transform); const body=t?`<g transform="${t}">${inner}</g>`:inner;
  await chrome(head+defs+body+"</svg>", `${WORK}/mask-${e.i}.png`); }
console.log("masks rendered", only?only.join(","):"all");
