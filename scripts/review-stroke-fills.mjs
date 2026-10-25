// Compare a separately extracted published package with the built candidate in Chrome.
// Usage: node scripts/review-stroke-fills.mjs /path/to/published/package /tmp/review
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as current from '../dist/react/index.js'
const baseline = resolve(process.argv[2])
const output = resolve(process.argv[3] ?? 'static/stroke-review')
const previous = await import(pathToFileURL(join(baseline, 'dist/react/index.js')).href)
const chrome =
  process.env.CHROME_BIN ??
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync)
if (!chrome) throw Error('Set CHROME_BIN to an installed Chrome')
mkdirSync(output, { recursive: true })
const samples = []
const render = (api, kind, props) => {
  const markup = renderToStaticMarkup(createElement(api[kind], props))
  return markup
    .match(/<svg[\s\S]*<\/svg>/)[0]
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace(/(xmlns="http:\/\/www.w3.org\/2000\/svg" )\1/, '$1')
}
for (const platform of ['gpodder', 'podurama']) {
  for (const theme of ['light', 'dark']) {
    for (const shape of ['square', 'superellipse', 'circle']) {
      for (const size of [24, 64]) {
        const props = { platform, shape, size }
        const before = render(previous, 'PlatformIcon', props)
        samples.push({
          label: `${platform} · ${theme} · ${shape} · ${size}px`,
          theme,
          size,
          before,
          expected: before.replace('<svg viewBox=', '<svg fill="none" viewBox='),
          after: render(current, 'PlatformIcon', props),
        })
      }
    }
    for (const height of [40, 48]) {
      const props = { platform, theme, height, shape: 'superellipse' }
      const before = render(previous, 'PlatformBadge', props)
      samples.push({
        label: `${platform} · ${theme} badge · ${height}px`,
        theme,
        size: Math.round((24 * height) / 40),
        before,
        expected: before.replace('<svg viewBox=', '<svg fill="none" viewBox='),
        after: render(current, 'PlatformBadge', props),
      })
    }
  }
  for (const kind of ['icon', 'light', 'dark']) {
    const file =
      kind === 'icon' ? `static/icons/${platform}.svg` : `static/badges/${platform}-${kind}.svg`
    const before = readFileSync(join(baseline, file), 'utf8')
    const after = readFileSync(resolve(file), 'utf8')
    samples.push({
      label: `${platform} · static ${kind} unchanged appearance`,
      theme: 'light',
      size: 64,
      before,
      expected: before,
      after,
      unchanged: true,
    })
  }
}
const image = (svg, sample, variant) =>
  `<img data-variant="${variant}" width="${sample.size}" height="${sample.size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" alt="${variant}">`
const rows = samples
  .map(
    (s) =>
      `<tr class="${s.theme}" data-unchanged="${!!s.unchanged}"><th>${s.label}</th>${['before', 'expected', 'after'].map((v) => `<td>${image(s[v], s, v)}</td>`).join('')}</tr>`,
  )
  .join('')
const html = `<!doctype html><html><meta charset="utf-8"><title>Stroke-fill correction browser regression</title><style>body{font:14px system-ui;margin:20px;background:#ddd;color:#151515}h1{font-size:24px}table{width:900px;border-spacing:4px;table-layout:fixed}th{text-align:left;width:330px}thead th:not(:first-child){width:auto}td{text-align:center;height:70px;background:white}.dark td{background:#202020}img{vertical-align:middle}pre{display:none}</style><h1>gPodder & Podurama: preserve stroke-only interiors</h1><p>Chrome · original colors and paths · released / inherited fill restored / corrected package</p><table><thead><th>Sample</th><th>Released 0.2.0</th><th>Authored fill intent</th><th>Corrected</th></thead>${rows}</table><pre id="result"></pre><script>
(async()=>{try{
await Promise.all(Array.from(document.images).map(i=>i.decode()));
const results=[];
for(const row of document.querySelectorAll('tr[data-unchanged]')){
const imgs=Array.from(row.querySelectorAll('img'));const canvas=document.createElement('canvas');canvas.width=canvas.height=imgs[0].width;const ctx=canvas.getContext('2d',{willReadFrequently:true});
const pixels=imgs.map(img=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return ctx.getImageData(0,0,canvas.width,canvas.height).data});
const delta=(a,b)=>a.reduce((sum,n,i)=>sum+(Math.abs(n-b[i])>1?1:0),0);
const expectedDelta=delta(pixels[1],pixels[2]);const changed=delta(pixels[0],pixels[2]);
if(expectedDelta!==0)throw Error(row.textContent+' differs from authored fill intent: '+expectedDelta);
if(row.dataset.unchanged==='false' && changed===0)throw Error(row.textContent+' did not reproduce released defect');
if(row.dataset.unchanged==='true' && changed!==0)throw Error(row.textContent+' static appearance changed');
results.push({label:row.querySelector('th').textContent,changedChannels:changed,unexpectedChannels:expectedDelta});
}
document.body.dataset.status='passed';document.getElementById('result').textContent=JSON.stringify({status:'PASS',samples:results.length,results});
}catch(e){document.body.dataset.status='failed';document.getElementById('result').textContent=String(e)}})();</script></html>`
const path = join(output, 'stroke-fills.html')
writeFileSync(path, html)
const screenshotPath = join(output, 'stroke-fills.png')
const profile = mkdtempSync(join(tmpdir(), 'podlink-strokes-'))
try {
  // A previous successful capture must not hide a missing screenshot.
  rmSync(screenshotPath, { force: true })
  const result = spawnSync(
    chrome,
    [
      '--headless=new',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-sync',
      '--force-color-profile=srgb',
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--window-size=960,3100',
      '--virtual-time-budget=1500',
      '--dump-dom',
      `--screenshot=${screenshotPath}`,
      pathToFileURL(path).href,
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000 },
  )
  const summary = result.stdout?.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1]
  if (result.status !== 0 || !result.stdout.includes('data-status="passed"'))
    throw Error(summary ?? result.stderr)
  // Chrome versions may handle dump-DOM and screenshot flags differently.
  // Fail rather than report success without a fresh, nonempty PNG.
  const png = readFileSync(screenshotPath)
  if (png.length < 33 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw Error('Chrome did not create a valid PNG screenshot')
  }
  writeFileSync(
    join(output, 'stroke-checks.json'),
    JSON.stringify(JSON.parse(summary), null, 2) + '\n',
  )
  console.log(summary)
} finally {
  rmSync(profile, { recursive: true, force: true })
}
