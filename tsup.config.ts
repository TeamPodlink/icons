import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/core/index.ts' },
    outDir: 'dist/core',
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    splitting: false,
    minify: true,
  },
  {
    entry: { index: 'src/react/index.ts' },
    outDir: 'dist/react',
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    splitting: false,
    minify: true,
    external: ['react', 'react-dom'],
  },
])
