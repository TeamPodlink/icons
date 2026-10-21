import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SceneGraph, FigmaAPI, exportFigFile, parseFigFile } from '@open-pencil/core'
import { configureComponentSet } from './figma-component-set.mjs'

test('component sets retain native Figma flags, variant order, documentation links, and example styling', async () => {
  const graph = new SceneGraph()
  const figma = new FigmaAPI(graph)
  const variants = ['Square', 'Circle'].map((shape) => {
    const component = figma.createComponent()
    component.name = `Shape=${shape}`
    component.resize(32, 32)
    return component
  })
  const set = figma.combineAsVariants(variants, figma.currentPage)
  set.name = 'Spotify'
  configureComponentSet(graph, set, { name: 'Spotify', url: 'https://spotify.com', description: 'Spotify vector artwork.' })
  const bytes = await exportFigFile(graph)
  const parsed = await parseFigFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const result = [...parsed.nodes.values()].find((n) => n.type === 'COMPONENT_SET')
  // Check Figma's native fields, not just OpenPencil's own plugin marker.
  assert.equal(result.source.fig.rawNodeFields.isStateGroup, true)
  assert.deepEqual(result.source.fig.rawNodeFields.stateGroupPropertyValueOrders, [{ property: 'Shape', values: ['Square', 'Circle'] }])
  assert.equal(result.symbolLinks[0].uri, 'https://spotify.com')
  assert.equal(result.symbolLinks[0].displayName, 'Spotify website')
  assert.equal(result.symbolDescription, 'Spotify vector artwork.')
  assert.equal(result.cornerRadius, 5)
  assert.deepEqual(result.dashPattern, [10, 5])
  assert.equal(result.strokeWeight, 1)
  assert.equal(result.strokeAlign, 'INSIDE')
  assert.equal(result.strokes.length, 1)
  assert.deepEqual(result.childIds.map((id) => parsed.getNode(id).name), ['Shape=Square', 'Shape=Circle'])
})
