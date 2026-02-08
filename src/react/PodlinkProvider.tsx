import { createContext, useContext, type ReactNode } from 'react'
import type { IconShape } from '../core/types.js'

export interface PodlinkConfig {
  theme?: 'light' | 'dark'
  shape?: IconShape
  label?: string
  dir?: 'ltr' | 'rtl'
}

const PodlinkContext = createContext<PodlinkConfig>({})

export function usePodlinkConfig(): PodlinkConfig {
  return useContext(PodlinkContext)
}

export interface PodlinkProviderProps extends PodlinkConfig {
  children: ReactNode
}

export function PodlinkProvider({
  children,
  ...config
}: PodlinkProviderProps) {
  return (
    <PodlinkContext.Provider value={config}>{children}</PodlinkContext.Provider>
  )
}
