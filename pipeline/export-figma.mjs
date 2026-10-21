// Generate a local .fig library: vectors, except Apple Podcasts' Liquid Glass PNGs.
// Usage: pnpm export:figma [--all] [--out path/to/Podcast-Apps.fig]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import {
  SceneGraph,
  FigmaAPI,
  exportFigFile,
  parseFigFile,
  headlessRenderNodes,
} from '@open-pencil/core'
import { readPlatforms, root } from './lib.mjs'
import { importIconSVG } from './figma-svg.mjs'
import { configureComponentSet } from './figma-component-set.mjs'

const { values: args } = parseArgs({
  options: { all: { type: 'boolean' }, out: { type: 'string' }, help: { type: 'boolean' } },
})
if (args.help) {
  console.log(
    'pnpm export:figma [--all] [--out path/to/Podcast-Apps.fig]\nDefaults to current Linktree Podcast platforms plus curated additions.\n--all exports every active repository platform to Podcast-Apps-All.fig.\nEach platform has one component set with Square/Circle variants.\nApple Podcasts embeds Liquid Glass PNGs; every other platform uses vectors.',
  )
  process.exit(0)
}
const out = resolve(args.out ?? join(root, `dist/figma/Podcast-Apps${args.all ? '-All' : ''}.fig`))
if (!out.endsWith('.fig')) throw new Error('Output must end in .fig')
const catalog = readPlatforms()
const manifest = JSON.parse(readFileSync(join(root, 'pipeline/figma-podcast-linkapp.json'), 'utf8'))
const included = [...manifest.current, ...Object.keys(manifest.additions)]
const reviewed = [...included, ...Object.keys(manifest.excluded)]
if (new Set(reviewed).size !== reviewed.length)
  throw new Error('Duplicate or conflicting platform in Figma scope manifest')
for (const id of reviewed)
  if (!catalog.some((p) => p.id === id)) throw new Error(`Unknown Figma scope platform: ${id}`)
const platforms = catalog
  .filter((p) => p.meta.active !== false && (args.all || included.includes(p.id)))
  .sort((a, b) => a.meta.name.localeCompare(b.meta.name, 'en'))
if (!platforms.length) throw new Error('Figma scope contains no active platforms')
const selection = {
  scope: args.all ? 'all' : 'podcast-linkapp',
  reviewedAt: manifest.reviewedAt,
  manifest: 'pipeline/figma-podcast-linkapp.json',
  included: platforms.map((p) => ({
    platform: p.id,
    category: manifest.current.includes(p.id) ? 'current' : manifest.additions[p.id] ? 'addition' : 'full-library-only',
    reason: manifest.current.includes(p.id) ? 'Listed by Linktree as a supported Podcast platform.' : manifest.additions[p.id]?.reason ?? 'Included by --all.',
    source: manifest.current.includes(p.id) ? manifest.currentSource : manifest.additions[p.id]?.source,
  })),
  excluded: catalog.filter((p) => !platforms.includes(p)).map((p) => ({
    platform: p.id,
    reason: p.meta.active === false ? 'Inactive in repository metadata.' : manifest.excluded[p.id] ?? 'Not yet reviewed for the Podcast linkapp.',
  })),
}
execFileSync('corepack', ['pnpm', '--filter', '@podlink/icons', 'codegen'], {
  cwd: root,
  stdio: 'inherit',
})
execFileSync('corepack', ['pnpm', '--filter', '@podlink/icons', 'build:static'], {
  cwd: root,
  stdio: 'inherit',
})

const graph = new SceneGraph()
const figma = new FigmaAPI(graph)
figma.currentPage.name = 'Podcast Apps'
const section = figma.createSection()
section.name = 'Podcast Apps'
const components = []
// Use the native renders without cropping, recoloring, or downsampling.
// Square retains Apple's authored squircle silhouette; Circle uses watchOS artwork.
const appleRasters = { square: 'apple.png', circle: 'apple-circle.png' }
const expectedImages = new Map()
const report = {
  selection,
  platforms: platforms.length,
  componentSets: platforms.length,
  variants: 0,
  rasterVariants: 0,
  vectorVariants: 0,
  documentationLinks: [],
  masks: 0,
  filters: 0,
  filterApproximations: [],
  sources: [],
}
for (const [i, platform] of platforms.entries()) {
  const platformComponents = []
  const raster = platform.id === 'apple'
  for (const [j, shape] of ['square', 'circle'].entries()) {
    const source = raster
      ? join(root, 'packages/refraction/assets', appleRasters[shape])
      : join(root, 'packages/icons/static/icons', `${platform.id}-${shape}.svg`)
    const component = figma.createComponent()
    component.name = `Shape=${shape === 'square' ? 'Square' : 'Circle'}`
    component.description = `${platform.meta.name} — ${shape}, ${raster ? 'Liquid Glass raster' : 'vector'}. Source: ${source.replace(root + '/', '')}. ${platform.meta.url ?? ''}`
    graph.getNode(component.id).symbolDescription = component.description
    component.resize(32, 32)
    component.fills = []
    component.clipsContent = true
    const sourceRecord = { platform: platform.id, shape, format: raster ? 'raster' : 'vector', source: source.replace(root + '/', '') }
    if (raster) {
      let png
      try { png = readFileSync(source) }
      catch { throw new Error(`Missing Apple Liquid Glass raster: ${source}. Run node pipeline/build-assets.mjs --only apple first.`) }
      const metadata = await sharp(png).metadata()
      if (metadata.format !== 'png' || metadata.width !== 1024 || metadata.height !== 1024)
        throw new Error(`Expected a 1024 × 1024 Apple Liquid Glass PNG: ${source}`)
      const { hash } = figma.createImage(new Uint8Array(png))
      const artwork = figma.createRectangle()
      artwork.name = 'Apple Podcasts — Liquid Glass'
      artwork.resize(32, 32)
      artwork.fills = [{ type: 'IMAGE', imageHash: hash, imageScaleMode: 'FIT', opacity: 1, visible: true }]
      component.appendChild(artwork)
      expectedImages.set(component.name, { hash, png })
      Object.assign(sourceRecord, { width: metadata.width, height: metadata.height, imageHash: hash })
      report.rasterVariants++
    } else {
      component.appendChild(await importIconSVG(figma, readFileSync(source, 'utf8'), report))
      report.vectorVariants++
    }
    component.x = 20 + j * 48
    component.y = 20
    components.push(component)
    platformComponents.push(component)
    report.sources.push(sourceRecord)
  }
  const set = figma.combineAsVariants(platformComponents, section)
  set.name = platform.meta.name
  set.description = `${platform.meta.name} ${raster ? 'Liquid Glass raster' : 'vector'} artwork. Shape: Square or Circle.`
  set.resizeWithoutConstraints(120, 72)
  // Normalize the two variants after combineAsVariants reparents them.
  platformComponents.forEach((component, j) => {
    component.x = 20 + j * 48
    component.y = 20
  })
  set.x = 40 + (i % 8) * 160
  set.y = 40 + Math.floor(i / 8) * 112
  configureComponentSet(graph, set, {
    name: platform.meta.name,
    url: platform.meta.url,
    description: set.description,
  })
  report.documentationLinks.push({ platform: platform.id, url: platform.meta.url })
}
section.resizeWithoutConstraints(8 * 160 + 40, Math.ceil(platforms.length / 8) * 112 + 40)
report.variants = components.length
// The SVG importer calls opaque clip masks VECTOR, but the .fig encoder
// expects ALPHA/OUTLINE/LUMINANCE. These solid clip paths are equivalent alpha masks.
for (const node of graph.nodes.values())
  if (node.isMask && node.maskType === 'VECTOR') node.maskType = 'ALPHA'
const bytes = await exportFigFile(graph)
// Read the serialized file back before writing it: catch variant/schema loss.
const parsed = await parseFigFile(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
)
const sets = [...parsed.nodes.values()].filter((node) => node.type === 'COMPONENT_SET')
const variants = [...parsed.nodes.values()].filter((node) => node.type === 'COMPONENT')
if (sets.length !== platforms.length || variants.length !== platforms.length * 2)
  throw new Error('Figma round-trip lost component variants')
for (const platform of platforms) {
  const set = sets.find((node) => node.name === platform.meta.name)
  const children = variants.filter((node) => node.parentId === set?.id)
  if (
    !set ||
    children.length !== 2 ||
    children
      .map((node) => node.name)
      .sort()
      .join() !== 'Shape=Circle,Shape=Square' ||
    set.componentPropertyDefinitions.length !== 1 ||
    set.componentPropertyDefinitions[0].name !== 'Shape' ||
    set.componentPropertyDefinitions[0].variantOptions.join() !== 'Square,Circle'
  )
    throw new Error(`Figma round-trip lost ${platform.meta.name}'s Shape variants`)
  const native = set.source.fig.rawNodeFields
  if (native.isStateGroup !== true ||
      JSON.stringify(native.stateGroupPropertyValueOrders) !== JSON.stringify([{ property: 'Shape', values: ['Square', 'Circle'] }]))
    throw new Error(`Missing native Figma component-set metadata for ${platform.meta.name}`)
  if (set.symbolLinks.length !== 1 || set.symbolLinks[0].uri !== platform.meta.url)
    throw new Error(`Figma round-trip lost ${platform.meta.name}'s documentation link`)
  if (set.cornerRadius !== 5 || set.dashPattern.join() !== '10,5' || set.strokes.length !== 1)
    throw new Error(`Figma round-trip lost ${platform.meta.name}'s component-set outline`)
}
// Raster is an explicit Apple-only exception. Check ownership, both variants,
// and byte-identical embedded PNGs; do not relax the vector-only rule globally.
const imageNodes = [...parsed.nodes.values()].filter((node) => node.fills?.some((fill) => fill.type === 'IMAGE'))
if (imageNodes.length !== expectedImages.size || parsed.images.size !== expectedImages.size)
  throw new Error('Figma round-trip lost or added raster artwork')
const appleSet = sets.find((node) => node.name === 'Apple Podcasts')
for (const [variantName, expected] of expectedImages) {
  const variant = variants.find((node) => node.parentId === appleSet?.id && node.name === variantName)
  const artwork = imageNodes.filter((node) => node.parentId === variant?.id)
  if (artwork.length !== 1 || artwork[0].fills.length !== 1 || artwork[0].fills[0].imageHash !== expected.hash)
    throw new Error(`Apple Podcasts ${variantName} must contain its Liquid Glass raster`)
  const embedded = parsed.images.get(expected.hash)
  if (!embedded || !Buffer.from(embedded).equals(expected.png))
    throw new Error(`Apple Podcasts ${variantName} raster changed during serialization`)
}
const liveStrokes = [...parsed.nodes.values()].filter(
  (node) => node.type === 'VECTOR' && node.strokes?.length,
)
if (liveStrokes.length)
  throw new Error(
    `Unexpected live stroke in outlined vector export: ${liveStrokes.map((n) => n.name).join(', ')}`,
  )
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, bytes)
writeFileSync(out.replace(/\.fig$/, '.json'), JSON.stringify(report, null, 2) + '\n')
const page = [...parsed.nodes.values()].find((node) => node.type === 'CANVAS' && !node.internalOnly)
const preview = await headlessRenderNodes(
  parsed,
  page.id,
  sets.map((set) => set.id),
  { scale: 2 },
)
if (!preview) throw new Error('Could not render the exported Figma artwork')
writeFileSync(out.replace(/\.fig$/, '.png'), preview)
console.log(
  `Exported ${out}: ${sets.length} platform component sets, ${report.variants} variants (Square/Circle).`,
)
if (report.filterApproximations.length)
  console.log(
    `${report.filterApproximations.length} SVG filter chains approximated with native effects; see the JSON report.`,
  )
