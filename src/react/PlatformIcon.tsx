import type { CSSProperties } from 'react'
import { getIconData } from '../core/index.js'
import { getPlatform } from '../core/platforms.js'
import { shapes } from '../core/shapes.js'
import type { IconShape } from '../core/types.js'
import { usePodlinkConfig } from './PodlinkProvider.js'

export interface PlatformIconProps {
  platform: string
  shape?: IconShape
  size?: number
  className?: string
  style?: CSSProperties
  'aria-label'?: string
  decorative?: boolean
}

let clipIdCounter = 0

export function PlatformIcon({
  platform,
  shape: shapeProp,
  size: sizeProp,
  className,
  style,
  'aria-label': ariaLabel,
  decorative = false,
}: PlatformIconProps) {
  const config = usePodlinkConfig()
  const shape = shapeProp ?? config.shape ?? 'superellipse'
  const size = sizeProp ?? 32

  const data = getIconData(platform)
  if (!data) return null

  const platformInfo = getPlatform(platform)
  const label = ariaLabel ?? `${platformInfo?.name ?? platform} icon`

  const clipId = `pi_${platform}_${++clipIdCounter}`
  const needsClip = shape !== 'square'
  const shapeDef = shapes[shape]

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      className={className}
      style={style}
    >
      {needsClip && (
        <defs>
          <clipPath id={clipId}>
            <path d={shapeDef.svgPath(size)} />
          </clipPath>
        </defs>
      )}
      <g clipPath={needsClip ? `url(#${clipId})` : undefined}>
        <svg
          viewBox={data.viewBox}
          width={size}
          height={size}
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
      </g>
    </svg>
  )
}
