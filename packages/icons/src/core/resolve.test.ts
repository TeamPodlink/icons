import { describe, it, expect } from 'vitest'
import { resolveBadgeContent, resolveBadgeViewBox } from './resolve.js'
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

describe('resolveBadgeViewBox', () => {
  // Mirrors the real shape of the data: badge artwork is authored with a
  // tighter viewBox than the 0 0 32 32 icon.
  const fullData: IconData = {
    viewBox: '0 0 32 32',
    content: '<path d="icon"/>',
    badge: '<path d="badge"/>',
    badgeViewBox: '8 8 24 24',
    badgeDark: '<path d="badge-dark"/>',
    badgeDarkViewBox: '2 2 28 28',
  }

  it('returns the badge viewBox for light variant', () => {
    expect(resolveBadgeViewBox(fullData, 'light')).toBe('8 8 24 24')
  })

  it('returns the badgeDark viewBox for dark variant', () => {
    expect(resolveBadgeViewBox(fullData, 'dark')).toBe('2 2 28 28')
  })

  it('falls back to the badge viewBox for dark when no badgeDark', () => {
    const data: IconData = {
      viewBox: '0 0 32 32',
      content: '<path d="icon"/>',
      badge: '<path d="badge"/>',
      badgeViewBox: '8 8 24 24',
    }
    expect(resolveBadgeViewBox(data, 'dark')).toBe('8 8 24 24')
  })

  it('falls back to the icon viewBox when no badge variants', () => {
    const data: IconData = {
      viewBox: '0 0 32 32',
      content: '<path d="icon"/>',
    }
    expect(resolveBadgeViewBox(data, 'light')).toBe('0 0 32 32')
    expect(resolveBadgeViewBox(data, 'dark')).toBe('0 0 32 32')
  })

  it('falls back to the icon viewBox when badge content carries none', () => {
    const data: IconData = {
      viewBox: '0 0 32 32',
      content: '<path d="icon"/>',
      badge: '<path d="badge"/>',
    }
    expect(resolveBadgeViewBox(data, 'light')).toBe('0 0 32 32')
  })

  it('steps in lockstep with resolveBadgeContent', () => {
    // Every fallback step must hand back the viewBox belonging to the content
    // that step selected, or badge art renders in the wrong box.
    const cases: Array<[IconData, 'light' | 'dark', string, string]> = [
      [fullData, 'light', '<path d="badge"/>', '8 8 24 24'],
      [fullData, 'dark', '<path d="badge-dark"/>', '2 2 28 28'],
      [
        { ...fullData, badgeDark: undefined, badgeDarkViewBox: undefined },
        'dark',
        '<path d="badge"/>',
        '8 8 24 24',
      ],
      [
        { viewBox: '0 0 32 32', content: '<path d="icon"/>' },
        'light',
        '<path d="icon"/>',
        '0 0 32 32',
      ],
    ]
    for (const [data, variant, content, viewBox] of cases) {
      expect(resolveBadgeContent(data, variant)).toBe(content)
      expect(resolveBadgeViewBox(data, variant)).toBe(viewBox)
    }
  })
})
