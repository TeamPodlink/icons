// Native Figma metadata and styling, matched to component-set-example.fig.
// OpenPencil 0.16 only writes a private plugin marker for newly created sets.
export function configureComponentSet(graph, set, { name, url, description }) {
  const parsedUrl = new URL(url)
  if (!['https:', 'http:'].includes(parsedUrl.protocol))
    throw new Error(`Invalid documentation URL for ${name}: ${url}`)
  set.fills = []
  set.cornerRadius = 5
  set.strokes = [{ type: 'SOLID', color: { r: 138 / 255, g: 56 / 255, b: 245 / 255, a: 1 }, opacity: 1, visible: true }]
  set.strokeWeight = 1
  set.strokeAlign = 'INSIDE'
  set.dashPattern = [10, 5]

  // These wire-format fields are not exposed by the OpenPencil Figma API facade.
  const node = graph.getNode(set.id)
  node.symbolDescription = description
  node.symbolLinks = [{ uri: url, displayName: `${name} website`, displayText: `${name} website` }]
  Object.assign(node.source.fig.rawNodeFields, {
    isStateGroup: true,
    stateGroupPropertyValueOrders: [{ property: 'Shape', values: ['Square', 'Circle'] }],
  })
}
