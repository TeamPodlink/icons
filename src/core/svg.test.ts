import { describe, it, expect } from 'vitest'
import { extractSvgContent, extractViewBox, prefixIds, minifySvg } from './svg.js'

describe('extractSvgContent', () => {
  it('extracts content between svg tags', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0"/></svg>'
    expect(extractSvgContent(svg)).toBe('<path d="M0 0"/>')
  })

  it('strips xml declaration', () => {
    const svg = '<?xml version="1.0"?><svg viewBox="0 0 32 32"><rect/></svg>'
    expect(extractSvgContent(svg)).toBe('<rect/>')
  })

  it('throws on invalid SVG', () => {
    expect(() => extractSvgContent('<div>not svg</div>')).toThrow('Invalid SVG')
  })
})

describe('extractViewBox', () => {
  it('extracts viewBox from svg', () => {
    const svg = '<svg viewBox="0 0 24 24"><path/></svg>'
    expect(extractViewBox(svg)).toBe('0 0 24 24')
  })

  it('returns default when no viewBox', () => {
    const svg = '<svg><path/></svg>'
    expect(extractViewBox(svg)).toBe('0 0 32 32')
  })
})

describe('prefixIds', () => {
  it('prefixes IDs and references', () => {
    const content = '<defs><linearGradient id="a"/></defs><rect fill="url(#a)"/>'
    const result = prefixIds(content, 'test')
    expect(result).toContain('id="test_a"')
    expect(result).toContain('url(#test_a)')
  })

  it('prefixes href references', () => {
    const content = '<use href="#icon"/><symbol id="icon"/>'
    const result = prefixIds(content, 'p')
    expect(result).toContain('href="#p_icon"')
    expect(result).toContain('id="p_icon"')
  })

  it('handles content with no IDs', () => {
    const content = '<path d="M0 0"/>'
    expect(prefixIds(content, 'test')).toBe(content)
  })
})

describe('minifySvg', () => {
  it('removes newlines and excess whitespace', () => {
    const svg = '<svg>\n  <path/>\n  <rect/>\n</svg>'
    expect(minifySvg(svg)).toBe('<svg><path/><rect/></svg>')
  })

  it('collapses multiple spaces', () => {
    expect(minifySvg('a  b   c')).toBe('a b c')
  })
})
