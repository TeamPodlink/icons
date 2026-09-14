import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PlatformIcon } from './PlatformIcon.js'
import { PlatformBadge } from './PlatformBadge.js'

// These tests require codegen to have been run (pnpm codegen).
// The generated icons module is imported transitively via PlatformIcon/PlatformBadge.

describe('PlatformIcon', () => {
  it('renders null for unknown platform', () => {
    const { container } = render(<PlatformIcon platform="nonexistent" />)
    expect(container.innerHTML).toBe('')
  })

  it('renders an SVG for a known platform', () => {
    const { container } = render(<PlatformIcon platform="spotify" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
  })

  it('applies custom size', () => {
    const { container } = render(<PlatformIcon platform="spotify" size={48} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('48')
  })

  it('does not add defs for square shape', () => {
    const { container } = render(<PlatformIcon platform="spotify" shape="square" />)
    const svg = container.querySelector('svg')
    // Not ':scope > defs' — jsdom returns null for that on SVG elements even
    // when the <defs> is a direct child, so the assertion would always pass.
    const defs = [...(svg?.children ?? [])].filter((c) => c.tagName === 'defs')
    expect(defs).toHaveLength(0)
  })

  it('adds defs for a non-square shape', () => {
    const { container } = render(<PlatformIcon platform="spotify" shape="circle" />)
    const svg = container.querySelector('svg')
    const defs = [...(svg?.children ?? [])].filter((c) => c.tagName === 'defs')
    expect(defs).toHaveLength(1)
  })

  it('adds defs with clipPath for circle shape', () => {
    const { container } = render(<PlatformIcon platform="spotify" shape="circle" />)
    const html = container.innerHTML
    // Should have a clipPath with an arc path (circle as path data)
    expect(html).toContain('clipPath')
    expect(html).toContain('clip-path="url(#')
  })

  it('sets aria-label by default', () => {
    const { container } = render(<PlatformIcon platform="spotify" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-label')).toBe('Spotify icon')
  })

  it('sets aria-hidden when decorative', () => {
    const { container } = render(<PlatformIcon platform="spotify" decorative />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('PlatformBadge', () => {
  it('renders null for unknown platform', () => {
    const { container } = render(<PlatformBadge platform="nonexistent" />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a badge span', () => {
    const { container } = render(<PlatformBadge platform="spotify" />)
    const badge = container.querySelector('.podlink-badge')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('Listen on')
    expect(badge?.textContent).toContain('Spotify')
  })

  it('uses light theme by default', () => {
    const { container } = render(<PlatformBadge platform="spotify" />)
    const badge = container.querySelector('.podlink-badge') as HTMLElement
    expect(badge?.style.backgroundColor).toBe('rgb(255, 255, 255)')
  })

  it('renders dark theme', () => {
    const { container } = render(<PlatformBadge platform="spotify" theme="dark" />)
    const badge = container.querySelector('.podlink-badge') as HTMLElement
    expect(badge?.style.backgroundColor).toBe('rgb(0, 0, 0)')
  })

  it('renders custom label', () => {
    const { container } = render(<PlatformBadge platform="spotify" label="Escuchar en" />)
    expect(container.textContent).toContain('Escuchar en')
  })

  it('renders RTL direction', () => {
    const { container } = render(<PlatformBadge platform="spotify" dir="rtl" />)
    const badge = container.querySelector('.podlink-badge') as HTMLElement
    expect(badge?.getAttribute('dir')).toBe('rtl')
    expect(badge?.style.flexDirection).toBe('row-reverse')
  })

  it('overrides platform name', () => {
    const { container } = render(<PlatformBadge platform="spotify" platformName="Custom Name" />)
    expect(container.textContent).toContain('Custom Name')
  })

  // Badge artwork carries its own shape, so shape only applies to the
  // icon.svg fallback. Every platform ships badge.svg today, so in practice
  // it is inert — assert that rather than let it drift back.
  it('ignores shape for platforms that ship badge artwork', () => {
    for (const shape of ['square', 'circle', 'superellipse'] as const) {
      const { container } = render(<PlatformBadge platform="spotify" shape={shape} />)
      const outer = container.querySelector('svg')
      const defs = [...(outer?.children ?? [])].filter((c) => c.tagName === 'defs')
      expect(defs, `shape="${shape}"`).toHaveLength(0)
    }
  })

  it('warns in dev when an ignored shape is passed explicitly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<PlatformBadge platform="deezer" shape="circle" />)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('shape is ignored'))
    warn.mockRestore()
  })

  it('does not warn when shape is left at its default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<PlatformBadge platform="pandora" />)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
