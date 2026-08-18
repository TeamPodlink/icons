/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Liquid Glass raster base URL (R2 release prefix); unset = /library. */
  readonly VITE_ASSET_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
