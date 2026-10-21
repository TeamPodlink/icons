// Native material sweep against refreshed store rasters. Candidates are staged;
// this command never adopts them into platforms/ automatically.
// node pipeline/review-store-materials.mjs [--only slug]
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import sharp from 'sharp'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
const out = resolve('dist/material-review-2026-10')
const review = JSON.parse(
  readFileSync(new URL('./liquid-glass-review-2026-10.json', import.meta.url)),
)
const targets = review.targets.map((t) => ({
  ...t,
  baseline: join(out, 'baseline', t.id, basename(t.bundle)),
}))
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null
const ictool =
  '/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool'
const get = (o, k, f) =>
  o[k] ?? o[`${k}-specializations`]?.find((s) => !s.appearance && !s.idiom)?.value ?? f
const set = (o, k, v) => {
  o[k] = v
  delete o[`${k}-specializations`]
}
const defaultOnly = (o, k, v, old) => {
  const specs = o[`${k}-specializations`] ?? []
  delete o[k]
  o[`${k}-specializations`] = [
    { value: v },
    ...specs.filter((s) => s.appearance || s.idiom),
    ...['dark', 'tinted']
      .filter((a) => !specs.some((s) => s.appearance === a))
      .map((appearance) => ({ appearance, value: old })),
  ]
}
const plate = (l) => /^(plate|bg(?:_.*)?|dark canvas|shadow)$/i.test(l.name ?? '')
const configs = []
for (const glass of [false, true])
  for (const specular of [false, true])
    for (const translucency of [0, 0.25, 0.5])
      for (const shadow of ['none', 'neutral', 'layer-color'])
        configs.push({ glass, specular, translucency, shadow, opacity: 0.5 })
const key = (c) => `g${+c.glass}-s${+c.specular}-t${c.translucency}-${c.shadow}-${c.opacity}`
async function pixels(file) {
  return sharp(file)
    .withIccProfile('srgb', { attach: false })
    .resize(256, 256)
    .flatten({ background: { r: 128, g: 128, b: 128 } })
    .removeAlpha()
    .raw()
    .toBuffer()
}
function score(a, b) {
  let sum = 0,
    n = 0,
    inner = 0,
    ni = 0
  for (let y = 20; y < 236; y++)
    for (let x = 20; x < 236; x++)
      for (let c = 0; c < 3; c++) {
        const d = a[(y * 256 + x) * 3 + c] - b[(y * 256 + x) * 3 + c]
        inner += d * d
        ni++
        if (x >= 51 && x < 205 && y >= 51 && y < 205) {
          sum += d * d
          n++
        }
      }
  return { central: Math.sqrt(sum / n), interior: Math.sqrt(inner / ni) }
}
async function render(bundle, file) {
  execFileSync(
    ictool,
    [
      bundle,
      '--export-image',
      '--output-file',
      file,
      '--platform',
      'macOS',
      '--rendition',
      'Default',
      '--width',
      '1024',
      '--height',
      '1024',
      '--scale',
      '1',
      '--design-generation',
      '27',
    ],
    { stdio: 'pipe' },
  )
  const png = await sharp(file).withIccProfile('srgb', { attach: false }).png().toBuffer()
  writeFileSync(file, png)
  return pixels(file)
}
function prepare(t, dir) {
  const bundle = join(dir, 'Candidate.icon')
  cpSync(t.baseline, bundle, { recursive: true })
  let doc = JSON.parse(readFileSync(join(bundle, 'icon.json')))
  if (t.id === 'listnr') {
    const fit = review.listnrPlacement
    const l = doc.groups[0].layers[0]
    l.position.scale = 32 * fit.scale
    l.position['translation-in-points'] = fit.translation
  }
  if (
    ['snipd', 'pocketcasts', 'pandora'].includes(t.id) &&
    !doc.groups.some((g) => g.layers.some((l) => l['image-name'] === 'material-glyph.svg'))
  ) {
    const xml = new DOMParser().parseFromString(
      readFileSync(`platforms/${t.id}/icon.svg`, 'utf8'),
      'image/svg+xml',
    )
    const root = xml.documentElement
    const elements = [...root.childNodes].filter((n) => n.nodeType === 1)
    const background = elements.find(
      (n) => n.localName === 'path' && n.getAttribute('d') === 'M0 0h32v32H0z',
    )
    if (!background) throw Error(`No separable plate ${t.id}`)
    const plateSvg = root.cloneNode(false)
    for (const e of elements.filter((e) => e.localName === 'defs' || e === background))
      plateSvg.appendChild(e.cloneNode(true))
    background.parentNode.removeChild(background)
    const serial = new XMLSerializer()
    writeFileSync(join(bundle, 'Assets/material-glyph.svg'), serial.serializeToString(xml))
    writeFileSync(join(bundle, 'Assets/material-plate.svg'), serial.serializeToString(plateSvg))
    for (const g of doc.groups) defaultOnly(g, 'hidden', true, get(g, 'hidden', false))
    const foreground = {
      name: 'Store material foreground',
      layers: [
        {
          'image-name': 'material-glyph.svg',
          name: 'store-glyph',
          glass: false,
          position: { scale: 32, 'translation-in-points': [0, 0] },
        },
      ],
    }
    const backgroundGroup = {
      name: 'Store material background',
      specular: false,
      translucency: { enabled: false, value: 0 },
      shadow: { kind: 'none', opacity: 0 },
      layers: [
        {
          'image-name': 'material-plate.svg',
          name: 'plate',
          glass: false,
          'position-specializations': [
            { value: { scale: 32, 'translation-in-points': [0, 0] } },
            { idiom: 'watchOS', value: { scale: 32 / 0.94, 'translation-in-points': [0, 0] } },
          ],
        },
      ],
    }
    if (t.id === 'snipd') {
      const l = foreground.layers[0]
      delete l.position
      l['position-specializations'] = [
        { value: { scale: 32, 'translation-in-points': [0, 0] } },
        { idiom: 'watchOS', value: { scale: 32 / 0.94, 'translation-in-points': [0, 0] } },
      ]
    }
    for (const g of [foreground, backgroundGroup]) defaultOnly(g, 'hidden', false, true)
    doc.groups.unshift(foreground, backgroundGroup)
  }
  // A canvas plate needs its own material settings when it shares a glyph group.
  doc.groups = doc.groups.flatMap((g) => {
    const bg = g.layers.filter(plate),
      fg = g.layers.filter((l) => !plate(l))
    return bg.length && fg.length
      ? [
          { ...g, layers: fg },
          { ...structuredClone(g), name: 'Preserved background', layers: bg },
        ]
      : [g]
  })
  return { bundle, doc }
}
export function applyMaterial(doc, config) {
  const copy = structuredClone(doc)
  for (const g of copy.groups) {
    if (get(g, 'hidden', false) || !g.layers.some((l) => !plate(l))) continue
    set(g, 'specular', config.specular)
    set(g, 'translucency', { enabled: config.translucency > 0, value: config.translucency })
    set(g, 'shadow', { kind: config.shadow, opacity: config.opacity })
    for (const l of g.layers.filter((l) => !plate(l))) set(l, 'glass', config.glass)
  }
  return copy
}
for (const t of targets.filter((t) => !only || t.id === only)) {
  if (!existsSync(t.baseline)) {
    mkdirSync(join(out, 'baseline', t.id), { recursive: true })
    cpSync(t.bundle, t.baseline, { recursive: true })
  }
  const dir = join(out, t.id)
  mkdirSync(dir, { recursive: true })
  const ref = await pixels(`apps/web/public/raster/${t.id}.png`)
  const baselineFile = join(dir, 'baseline.png')
  const baseline = score(await render(t.baseline, baselineFile), ref)
  const { bundle, doc } = prepare(t, dir)
  writeFileSync(join(dir, 'prepared.json'), JSON.stringify(doc, null, 2) + '\n')
  const candidates = []
  for (const config of [null, ...configs]) {
    const name = config ? key(config) : 'prepared'
    const candidate = config ? applyMaterial(doc, config) : doc
    writeFileSync(join(bundle, 'icon.json'), JSON.stringify(candidate, null, 2) + '\n')
    const file = join(dir, name + '.png')
    const result = score(await render(bundle, file), ref)
    candidates.push({ name, config, ...result })
  }
  candidates.sort((a, b) => a.central - b.central)
  const best = candidates[0]
  writeFileSync(
    join(bundle, 'icon.json'),
    JSON.stringify(best.config ? applyMaterial(doc, best.config) : doc, null, 2) + '\n',
  )
  writeFileSync(
    join(dir, 'results.json'),
    JSON.stringify({ id: t.id, baseline, best, candidates }, null, 2) + '\n',
  )
  console.log(
    `${t.id}: ${baseline.central.toFixed(2)} → ${best.central.toFixed(2)} (${best.name}), interior ${baseline.interior.toFixed(2)} → ${best.interior.toFixed(2)}`,
  )
}
