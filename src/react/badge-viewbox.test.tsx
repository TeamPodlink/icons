import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import * as core from '../core/index.js'
import { PlatformBadge } from './PlatformBadge.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PlatformBadge source coordinates', () => {
  it.each(['8 8 24 24', '-12 6 48 24', '5 -10 12 48'])(
    'renders %s at each height and theme',
    (viewBox) => {
      vi.spyOn(core, 'getIconData').mockReturnValue({
        viewBox: '0 0 32 32',
        content: '<path id="icon"/>',
        badge: '<path id="light"/>',
        badgeViewBox: viewBox,
        badgeDark: '<path id="dark"/>',
        badgeDarkViewBox: '-4 -8 16 48',
      })
      for (const height of [40, 80]) {
        for (const theme of ['light', 'dark'] as const) {
          const { container, unmount } = render(
            <PlatformBadge platform="spotify" theme={theme} height={height} />,
          )
          const artwork = container.querySelector('svg > g > svg')!
          expect(artwork.getAttribute('viewBox')).toBe(theme === 'light' ? viewBox : '-4 -8 16 48')
          expect(artwork.getAttribute('width')).toBe(String((height * 24) / 40))
          expect(artwork.getAttribute('height')).toBe(String((height * 24) / 40))
          expect(artwork.querySelector(`#${theme}`)).not.toBeNull()
          unmount()
        }
      }
    },
  )

  it.each(['spotify', 'youtube', 'netflix', 'apple', 'facebook'])(
    'renders generated %s badge coordinates',
    (platform) => {
      for (const theme of ['light', 'dark'] as const) {
        const { container, unmount } = render(<PlatformBadge platform={platform} theme={theme} />)
        expect(container.querySelector('svg > g > svg')?.getAttribute('viewBox')).toBe(
          core.resolveBadgeViewBox(core.getIconData(platform)!, theme),
        )
        unmount()
      }
    },
  )
})
