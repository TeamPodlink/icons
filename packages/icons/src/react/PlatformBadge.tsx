import { useId, type CSSProperties } from 'react'
import { getIconData } from '../core/index.js'
import { getPlatform } from '../core/platforms.js'
import {
  resolveBadgeContent,
  resolveBadgeViewBox,
  resolveBadgeRootFill,
  hasBadgeArtwork,
} from '../core/resolve.js'
import { shapes } from '../core/shapes.js'
import type { IconShape } from '../core/types.js'

export interface PlatformBadgeProps {
  platform: string
  theme?: 'light' | 'dark'
  label?: string
  platformName?: string
  shape?: IconShape
  dir?: 'ltr' | 'rtl'
  height?: number
  className?: string
  style?: CSSProperties
  'aria-label'?: string
  decorative?: boolean
}

const FONT_FAMILY = "'Inter', system-ui, sans-serif"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __DEV__ = (globalThis as any).process?.env?.NODE_ENV !== 'production'
const warnedShapes = new Set<string>()

export function PlatformBadge({
  platform,
  theme: themeProp,
  label: labelProp,
  platformName: nameProp,
  shape: shapeProp,
  dir: dirProp,
  height: heightProp,
  className,
  style,
  'aria-label': ariaLabel,
  decorative = false,
}: PlatformBadgeProps) {
  const theme = themeProp ?? 'light'
  const label = labelProp ?? 'Listen on'
  const dir = dirProp ?? 'ltr'
  const shape = shapeProp ?? 'superellipse'
  const height = heightProp ?? 40

  const clipId = useId()

  const data = getIconData(platform)
  if (!data) return null

  const platformInfo = getPlatform(platform)
  const displayName = nameProp ?? platformInfo?.name ?? platform
  const fullLabel = ariaLabel ?? `${label} ${displayName}`

  const isDark = theme === 'dark'
  const bg = isDark ? '#000' : '#fff'
  const fg = isDark ? '#fff' : '#000'
  const isRtl = dir === 'rtl'

  // Scale everything proportionally to height (base = 40)
  const scale = height / 40
  const iconSize = Math.round(24 * scale)
  const padding = 8 * scale
  const gap = 6 * scale
  const padRight = 10 * scale
  const borderRadius = 5 * scale

  const smallFontSize = 8.5 * scale
  const largeFontSize = 17.5 * scale

  // Resolve badge icon content, the viewBox it was authored in, and the root
  // fill it was authored under. The fill has to come along because the source
  // file's root <svg> is not part of `content`: gpodder and podurama both draw
  // stroke-only paths that fill black without the inherited fill="none".
  // generateBadge() in scripts/build-static.ts puts it on the same element.
  let iconContent = resolveBadgeContent(data, theme)
  const iconViewBox = resolveBadgeViewBox(data, theme)
  const iconRootFill = resolveBadgeRootFill(data, theme)
  // Replace currentColor with foreground
  iconContent = iconContent.split('currentColor').join(fg)

  // Badge artwork already carries its own clipping — squircle, circle, or
  // deliberately none for a bare mark — so only the icon.svg fallback gets a
  // shape applied. This mirrors generateBadge() in scripts/build-static.ts,
  // which is what produces the static badges under static/badges/.
  const isArtwork = hasBadgeArtwork(data, theme)
  const needsClip = !isArtwork && shape !== 'square'
  const shapeDef = shapes[shape]

  if (__DEV__ && isArtwork && shapeProp !== undefined && !warnedShapes.has(platform)) {
    warnedShapes.add(platform)
    console.warn(
      `[@podlink/icons] <PlatformBadge platform="${platform}" shape="${shapeProp}"> — ` +
        `shape is ignored because this platform ships badge artwork that already ` +
        `carries its own shape. It applies only to platforms that fall back to icon.svg.`,
    )
  }

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    flexDirection: isRtl ? 'row-reverse' : 'row',
    height: `${height}px`,
    padding: `0 ${padRight}px 0 ${padding}px`,
    gap: `${gap}px`,
    backgroundColor: bg,
    border: '1px solid #A6A6A6',
    borderRadius: `${borderRadius}px`,
    textDecoration: 'none',
    color: fg,
    boxSizing: 'border-box',
    ...style,
  }

  // Flip padding for RTL
  if (isRtl) {
    badgeStyle.padding = `0 ${padding}px 0 ${padRight}px`
  }

  const textContainerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    textAlign: isRtl ? 'right' : 'left',
    lineHeight: 1,
  }

  const smallTextStyle: CSSProperties = {
    fontSize: `${smallFontSize}px`,
    fontFamily: FONT_FAMILY,
    fontWeight: 400,
    letterSpacing: '0px',
    lineHeight: `${8 * scale}px`,
    color: fg,
  }

  const largeTextStyle: CSSProperties = {
    fontSize: `${largeFontSize}px`,
    fontFamily: FONT_FAMILY,
    fontWeight: 400,
    letterSpacing: '-0.25px',
    lineHeight: `${16 * scale}px`,
    color: fg,
  }

  return (
    <span
      className={className ? `podlink-badge ${className}` : 'podlink-badge'}
      style={badgeStyle}
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : fullLabel}
      aria-hidden={decorative ? true : undefined}
      dir={dir}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={iconSize}
        height={iconSize}
        viewBox={`0 0 ${iconSize} ${iconSize}`}
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        {needsClip && (
          <defs>
            <clipPath id={clipId}>
              <path d={shapeDef.svgPath(iconSize)} />
            </clipPath>
          </defs>
        )}
        <g clipPath={needsClip ? `url(#${clipId})` : undefined}>
          <svg
            viewBox={iconViewBox}
            width={iconSize}
            height={iconSize}
            fill={iconRootFill}
            dangerouslySetInnerHTML={{ __html: iconContent }}
          />
        </g>
      </svg>
      <span style={textContainerStyle}>
        <span style={smallTextStyle}>{label}</span>
        <span style={largeTextStyle}>{displayName}</span>
      </span>
    </span>
  )
}
