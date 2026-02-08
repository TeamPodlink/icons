import type { IconShape, ShapeDefinition } from './types.js'

// iOS 26 superellipse (n=4 squircle) inset ratio:
// At size 32: inset = 1.455, half = 16  →  ratio = 1.455 / 16
const SQUIRCLE_RATIO = 1.455 / 16

// Precomputed superellipse paths for common sizes
const SQUIRCLE_PATHS: Record<number, string> = {
  24: 'M12 0C22.909 0 24 1.091 24 12S22.909 24 12 24S0 22.909 0 12S1.091 0 12 0Z',
  32: 'M16 0C30.545 0 32 1.455 32 16S30.545 32 16 32S0 30.545 0 16S1.455 0 16 0Z',
  48: 'M24 0C45.817 0 48 2.183 48 24S45.817 48 24 48S0 45.817 0 24S2.183 0 24 0Z',
  64: 'M32 0C61.09 0 64 2.91 64 32S61.09 64 32 64S0 61.09 0 32S2.91 0 32 0Z',
}

function superellipsePath(size: number): string {
  if (SQUIRCLE_PATHS[size]) return SQUIRCLE_PATHS[size]

  const half = size / 2
  const inset = half * SQUIRCLE_RATIO
  const r = (n: number) => Math.round(n * 1000) / 1000

  // Generate the path following the same pattern as the precomputed ones
  return [
    `M${r(half)} 0`,
    `C${r(size - inset)} 0 ${size} ${r(inset)} ${size} ${r(half)}`,
    `S${r(size - inset)} ${size} ${r(half)} ${size}`,
    `S0 ${r(size - inset)} 0 ${r(half)}`,
    `S${r(inset)} 0 ${r(half)} 0Z`,
  ].join('')
}

function circlePath(size: number): string {
  const r = size / 2
  return `M${r},0A${r},${r},0,1,1,${r},${size}A${r},${r},0,1,1,${r},0Z`
}

function squarePath(size: number): string {
  return `M0 0h${size}v${size}H0z`
}

const superellipse: ShapeDefinition = {
  svgPath: superellipsePath,
  clipPath(size: number) {
    return `<clipPath id="shape"><path d="${this.svgPath(size)}"/></clipPath>`
  },
}

const circle: ShapeDefinition = {
  svgPath: circlePath,
  clipPath(size: number) {
    const r = size / 2
    return `<clipPath id="shape"><circle cx="${r}" cy="${r}" r="${r}"/></clipPath>`
  },
}

const square: ShapeDefinition = {
  svgPath: squarePath,
  clipPath(size: number) {
    return `<clipPath id="shape"><rect width="${size}" height="${size}"/></clipPath>`
  },
}

export const shapes: Record<IconShape, ShapeDefinition> = {
  superellipse,
  circle,
  square,
}
