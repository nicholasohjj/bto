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
  let wrote = false
  return {
    name: 'sw-assets',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir },
    // Only the money plan's files (its entry, imports, lazy chunks and CSS). Flat Studio's and the
    // Surroundings page's files are cached when they're first opened.
    generateBundle(_, bundle) {
      const keep = new Set<string>()
      const walk = (f: string) => {
        const c = bundle[f]
        if (!c || keep.has(f)) return
        keep.add(f)
        if (c.type !== 'chunk') return
        for (const css of (c as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss ?? []) keep.add(css)
        for (const i of [...c.imports, ...c.dynamicImports]) walk(i)
      }
      for (const [f, c] of Object.entries(bundle)) if (c.type === 'chunk' && c.isEntry && c.name === 'main') walk(f)
      assets = [...keep].filter((f) => f.startsWith('assets/')).map((f) => `/${f}`).sort()
    },
    writeBundle() { wrote = true },
    closeBundle() {
      // On a failed build nothing was written: leave the real error to be reported.
      if (!wrote) return
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
  build: {
    // The money plan (/), Flat Studio (/studio/), Surroundings (/surroundings/) and upcoming sites (/surroundings/area/).
    rolldownOptions: { input: { main: 'index.html', studio: 'studio/index.html', surroundings: 'surroundings/index.html', area: 'surroundings/area/index.html' } },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
