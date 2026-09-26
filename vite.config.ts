/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** Writes the build's file list and a build hash into dist/sw.js, so the offline cache has every file. */
function swAssets(): Plugin {
  let assets: string[] = []
  let outDir = 'dist'
  return {
    name: 'sw-assets',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir },
    generateBundle(_, bundle) { assets = Object.keys(bundle).filter((f) => f.startsWith('assets/')).map((f) => `/${f}`).sort() },
    closeBundle() {
      const file = join(outDir, 'sw.js')
      const hash = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 10)
      const src = readFileSync(file, 'utf8')
      const out = src.replace("/*__BUILD_HASH__*/'dev'", JSON.stringify(hash)).replace('/*__BUILD_ASSETS__*/[]', JSON.stringify(assets))
      if (out === src) throw new Error('sw-assets: placeholders not found in sw.js')
      writeFileSync(file, out)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), swAssets()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
