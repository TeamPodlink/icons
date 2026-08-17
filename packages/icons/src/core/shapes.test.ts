import { describe, it, expect } from 'vitest'
import { shapes } from './shapes.js'

describe('shapes', () => {
  describe('superellipse', () => {
    it('returns precomputed path for size 32', () => {
      const path = shapes.superellipse.svgPath(32)
      expect(path).toBe('M16 0C30.545 0 32 1.455 32 16S30.545 32 16 32S0 30.545 0 16S1.455 0 16 0Z')
    })

    it('returns precomputed path for size 24', () => {
      const path = shapes.superellipse.svgPath(24)
      expect(path).toBe('M12 0C22.909 0 24 1.091 24 12S22.909 24 12 24S0 22.909 0 12S1.091 0 12 0Z')
    })

    it('returns precomputed path for size 48', () => {
      const path = shapes.superellipse.svgPath(48)
      expect(path).toBe('M24 0C45.817 0 48 2.183 48 24S45.817 48 24 48S0 45.817 0 24S2.183 0 24 0Z')
    })

    it('returns precomputed path for size 64', () => {
      const path = shapes.superellipse.svgPath(64)
      expect(path).toBe('M32 0C61.09 0 64 2.91 64 32S61.09 64 32 64S0 61.09 0 32S2.91 0 32 0Z')
    })

    it('generates path for non-precomputed size', () => {
      const path = shapes.superellipse.svgPath(40)
      expect(path).toContain('M20 0')
      expect(path).toContain('C')
      expect(path).toContain('S')
    })

    it('generates clipPath XML', () => {
      const clip = shapes.superellipse.clipPath(32)
      expect(clip).toContain('<clipPath')
      expect(clip).toContain('</clipPath>')
    })
  })

  describe('circle', () => {
    it('returns circle path for given size', () => {
      const path = shapes.circle.svgPath(32)
      expect(path).toContain('16')
      expect(path).toContain('A')
    })

    it('generates clipPath with circle element', () => {
      const clip = shapes.circle.clipPath(32)
      expect(clip).toContain('<circle')
      expect(clip).toContain('cx="16"')
      expect(clip).toContain('r="16"')
    })
  })

  describe('square', () => {
    it('returns rect path for given size', () => {
      const path = shapes.square.svgPath(32)
      expect(path).toBe('M0 0h32v32H0z')
    })

    it('generates clipPath with rect element', () => {
      const clip = shapes.square.clipPath(32)
      expect(clip).toContain('<rect')
      expect(clip).toContain('width="32"')
    })
  })
})
