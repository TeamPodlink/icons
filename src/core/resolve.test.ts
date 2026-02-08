import { describe, it, expect } from 'vitest'
import { resolveBadgeContent } from './resolve.js'
import type { IconData } from './types.js'

describe('resolveBadgeContent', () => {
  const fullData: IconData = {
    viewBox: '0 0 32 32',
    content: '<path d="icon"/>',
    badge: '<path d="badge"/>',
    badgeDark: '<path d="badge-dark"/>',
  }

  it('returns badge content for light variant', () => {
    expect(resolveBadgeContent(fullData, 'light')).toBe('<path d="badge"/>')
  })

  it('returns badgeDark content for dark variant', () => {
    expect(resolveBadgeContent(fullData, 'dark')).toBe('<path d="badge-dark"/>')
  })

  it('falls back to badge for dark when no badgeDark', () => {
    const data: IconData = {
      viewBox: '0 0 32 32',
      content: '<path d="icon"/>',
      badge: '<path d="badge"/>',
    }
    expect(resolveBadgeContent(data, 'dark')).toBe('<path d="badge"/>')
  })

  it('falls back to content for dark when no badge variants', () => {
    const data: IconData = {
      viewBox: '0 0 32 32',
      content: '<path d="icon"/>',
    }
    expect(resolveBadgeContent(data, 'dark')).toBe('<path d="icon"/>')
  })

  it('falls back to content for light when no badge', () => {
    const data: IconData = {
      viewBox: '0 0 32 32',
      content: '<path d="icon"/>',
    }
    expect(resolveBadgeContent(data, 'light')).toBe('<path d="icon"/>')
  })
})
