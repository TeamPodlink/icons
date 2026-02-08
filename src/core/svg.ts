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
 * Extract viewBox attribute from an SVG string
 */
export function extractViewBox(svg: string): string {
  const m = svg.match(/viewBox=["']([^"']+)["']/)
  return m ? m[1] : '0 0 32 32'
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
 * Minify SVG string by removing unnecessary whitespace
 */
export function minifySvg(svg: string): string {
  return svg
    .replace(/\n\s*/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
