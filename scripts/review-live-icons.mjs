// Browser-rendered review: librsvg 2.61.2 paints CSS Display-P3 colors black.
// Use the built package and an isolated Chrome profile; no dependencies added.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getPlatform } from '../dist/core/index.js'
import { PlatformIcon } from '../dist/react/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? join(root, 'static/review'))
const chrome =
  process.env.CHROME_BIN ??
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync)
if (!chrome) throw new Error('Set CHROME_BIN to an installed Chrome/Chromium executable')
mkdirSync(output, { recursive: true })
const ids = [
  'twitch',
  'kick',
  'rumble',
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'x',
  'substack',
  'patreon',
  'gpodder',
  'podurama',
  'youtube',
  'tunestr',
]
const shapes = ['square', 'superellipse', 'circle']
const image = (svg, id, size) =>
  `<img data-platform="${id}" width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" alt="${id} ${size}px">`
const rows = ids
  .map((id) => {
    const cells = shapes.map(
      (shape) =>
        `<td>${[64, 24]
          .map((size) =>
            image(
              renderToStaticMarkup(createElement(PlatformIcon, { platform: id, shape, size })),
              id,
              size,
            ),
          )
          .join('')}</td>`,
    )
    const svg = readFileSync(join(root, `static/icons/${id}.svg`), 'utf8')
    cells.push(`<td>${[64, 24].map((size) => image(svg, id, size)).join('')}</td>`)
    return `<tr><th>${getPlatform(id).name}${['youtube', 'tunestr'].includes(id) ? '<small>unchanged reference</small>' : ''}</th>${cells.join('')}</tr>`
  })
  .join('')
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Local icon compatibility review</title>
<style>
body{margin:0;padding:30px;background:#e5e5e5;color:#151515;font:16px system-ui}
h1{font-size:26px;margin:0 0 8px}p{margin:6px 0 16px;color:#444}
table{width:100%;border-collapse:separate;border-spacing:10px 6px;table-layout:fixed}
th{font-weight:600;text-align:left;width:145px}thead th:not(:first-child){text-align:center;font-size:14px}
td{height:91px;text-align:center;background:#d8d8d8;border-radius:8px}tr:nth-child(even) td{background:#242424}
img{vertical-align:middle;margin:0 5px}small{display:block;font-size:11px;font-weight:400;color:#666}
#review-summary{display:none}
</style></head><body><h1>Live platform icons — local compatibility candidate</h1>
<p>95 icons: all 85 released IDs retained + 10 additions. Each sample is 64px / 24px.</p>
<p>Chrome rendering preserves Display-P3 artwork. Existing React and static masks remain unchanged.</p>
<table><thead><tr><th>Platform</th><th>React square</th><th>React squircle</th><th>React circle</th><th>Static 0.2 mask</th></tr></thead><tbody>${rows}</tbody></table>
<p id="review-caption">Checking image decode and color rendering…</p><pre id="review-summary"></pre>
<script>
(async () => {
  try {
    if (!CSS.supports('color', 'color(display-p3 1 0 0)')) throw Error('Display-P3 colors unsupported');
    await Promise.all(Array.from(document.images).map(img => img.decode()));
    const probe = new Image();
    probe.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="color(display-p3 1 0 0)"/></svg>');
    await probe.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(probe, 0, 0);
    const red = Array.from(ctx.getImageData(1, 1, 1, 1).data);
    if (red[0] < 240 || red[1] > 20 || red[2] > 20 || red[3] !== 255) throw Error('P3 probe did not render red: ' + red);
    const tunes = Array.from(document.querySelectorAll('img[data-platform="tunestr"]')).map(img => {
      canvas.width = canvas.height = img.width; ctx.drawImage(img, 0, 0, img.width, img.height);
      const data = ctx.getImageData(0, 0, img.width, img.height).data; let colorful = 0;
      for (let i = 0; i < data.length; i += 4) {
        const channels = [data[i], data[i + 1], data[i + 2]];
        if (data[i + 3] > 128 && Math.max(...channels) > 70 && Math.max(...channels) - Math.min(...channels) > 50) colorful++;
      }
      const fraction = colorful / (img.width * img.height);
      if (fraction < 0.1) throw Error('Tunestr color regression at ' + img.width + 'px: ' + fraction);
      return { size: img.width, colorfulPixels: colorful, fraction };
    });
    document.body.dataset.reviewStatus = 'passed';
    document.getElementById('review-summary').textContent = JSON.stringify({ status: 'PASS', p3RedPixel: red, decodedImages: document.images.length, tunestr: tunes });
    document.getElementById('review-caption').textContent = 'Verified: 112 images decoded; Tunestr colors visible at 24px and 64px in every shape. Local review only — unpublished.';
  } catch (error) {
    document.body.dataset.reviewStatus = 'failed';
    document.getElementById('review-summary').textContent = String(error);
  }
})();
</script></body></html>`
const htmlPath = join(output, 'contact-sheet.html')
const pngPath = join(output, 'contact-sheet.png')
writeFileSync(htmlPath, html)
const profile = mkdtempSync(join(tmpdir(), 'podlink-icon-review-'))
try {
  const rendered = spawnSync(
    chrome,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--force-color-profile=srgb',
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--window-size=1040,1770',
      '--virtual-time-budget=1500',
      '--dump-dom',
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000 },
  )
  if (rendered.error) throw rendered.error
  if (rendered.status !== 0 || !rendered.stdout.includes('data-review-status="passed"')) {
    throw new Error(
      `Browser review failed: ${rendered.stderr}\n${rendered.stdout.match(/<pre id="review-summary">([\s\S]*?)<\/pre>/)?.[1] ?? 'No verification result'}`,
    )
  }
  const summary = JSON.parse(rendered.stdout.match(/<pre id="review-summary">([\s\S]*?)<\/pre>/)[1])
  writeFileSync(join(output, 'visual-checks.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify({ ...summary, image: pngPath }, null, 2))
} finally {
  rmSync(profile, { recursive: true, force: true })
}
