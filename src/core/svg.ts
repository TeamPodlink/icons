/**
 * Extract inner content from an SVG string (everything between <svg> tags)
 */
export function extractSvgContent(svg: string): string {
  svg = svg.replace(/<\?xml[^>]*\?>/g, '')
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)
  if (!m) throw new Error('Invalid SVG: no <svg> element found')
  return m[1].trim()
}

/**
 * Extract viewBox attribute from an SVG string.
 * Returns '0 0 32 32' with a warning if no viewBox is found.
 */
export function extractViewBox(svg: string): string {
  const m = svg.match(/viewBox=["']([^"']+)["']/)
  if (!m) {
    console.warn('[@podlink/icons] SVG is missing a viewBox attribute, defaulting to "0 0 32 32".')
    return '0 0 32 32'
  }
  return m[1]
}

/**
 * Prefix all IDs in SVG content to avoid collisions when embedding multiple icons
 */
export function prefixIds(content: string, prefix: string): string {
  const ids = new Set<string>()
  for (const m of content.matchAll(/id="([^"]+)"/g)) ids.add(m[1])

  let result = content
  for (const id of ids) {
    const pid = `${prefix}_${id}`
    result = result.split(`id="${id}"`).join(`id="${pid}"`)
    result = result.split(`url(#${id})`).join(`url(#${pid})`)
    result = result.split(`href="#${id}"`).join(`href="#${pid}"`)
    result = result.split(`xlink:href="#${id}"`).join(`xlink:href="#${pid}"`)
  }
  return result
}

/**
 * Extract the root fill attribute from an SVG string
 */
export function extractRootFill(svg: string): string | null {
  const m = svg.match(/<svg[^>]*\sfill=["']([^"']+)["']/)
  return m ? m[1] : null
}

/**
 * Minify SVG string by removing unnecessary whitespace
 */
export function minifySvg(svg: string): string {
  return svg
    .replace(/\n\s*/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
