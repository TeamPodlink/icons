import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PlatformIcon } from './PlatformIcon.js'
import { shapes } from '../core/shapes.js'
import type { IconShape } from '../core/types.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

// Compare the public React API with the exact assets served by the gallery
// and downloads, including a stroke-only source and every custom circle.
describe('icon shape parity', () => {
  for (const id of readdirSync(join(root, '../../platforms')).filter(id =>
    existsSync(join(root, '../../platforms', id, 'icon-circle.svg'))
  )) {
    for (const shape of ['square', 'superellipse', 'circle'] as IconShape[]) {
      it(`${id} ${shape} uses the same artwork and silhouette as its download`, () => {
        const suffix = shape === 'superellipse' ? '' : `-${shape}`
        const source = readFileSync(join(root, `static/icons/${id}${suffix}.svg`), 'utf8')
        const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
        expect(doc.querySelector('parsererror')).toBeNull()
        // Use the same HTML serialization as React after checking the file's XML.
        const staticContainer = document.createElement('div')
        staticContainer.innerHTML = source
        const staticArt = staticContainer.querySelector('g > svg')!
        const { container, unmount } = render(<PlatformIcon platform={id} shape={shape} />)
        const reactArt = container.querySelector('g > svg')!
        const normalize = (s: string) => s
          .replaceAll(`${id}-${shape}_`, 'art_')
          .replaceAll(`${id}_`, 'art_')
          .replace(/\s+/g, ' ')
          .replace(/>\s+</g, '><')
          .trim()
        expect(normalize(reactArt.innerHTML)).toBe(normalize(staticArt.innerHTML))
        expect(reactArt.getAttribute('viewBox')).toBe(staticArt.getAttribute('viewBox'))
        expect(reactArt.getAttribute('fill')).toBe(staticArt.getAttribute('fill'))
        expect(doc.querySelector('mask > path')?.getAttribute('d')).toBe(shapes[shape].svgPath(32))
        if (shape !== 'square') {
          expect(container.querySelector('clipPath > path')?.getAttribute('d')).toBe(shapes[shape].svgPath(32))
        }
        unmount()
      })
    }
  }
})
