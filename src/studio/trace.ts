/**
 * Ray-traced photo of the current 3D view (three-gpu-pathtracer): light bounces off walls, floors and
 * furniture, sunlight and sky come in through the windows, lamps light the room. Loaded only when a
 * photo is rendered. The view is restored afterwards.
 */
import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export interface TraceOptions {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera
  width: number; height: number; samples: number
  /** Sky seen through the windows, which also lights the room. */
  sky: { top: THREE.ColorRepresentation; bottom: THREE.ColorRepresentation; intensity: number }
  /** Exposure for the photo (interiors need more than the outside view). */
  exposure: number
  /** How strongly to smooth the remaining grain, 0–1. */
  denoise: number
  onProgress: (phase: 'prepare' | 'render', done: number, total: number) => void
  stopped: () => boolean
}

/** Render and return the photo on a 2D canvas, or null if stopped before anything useful. */
export async function trace(o: TraceOptions): Promise<HTMLCanvasElement | null> {
  const { WebGLPathTracer, GradientEquirectTexture, DenoiseMaterial } = await import('three-gpu-pathtracer')
  const { renderer, scene, camera, width: W, height: H } = o
  const oldSize = renderer.getSize(new THREE.Vector2()), oldPR = renderer.getPixelRatio(), oldExp = renderer.toneMappingExposure
  const oldEnv = scene.environment, oldEnvI = scene.environmentIntensity, oldBg = scene.background, oldAsp = camera.aspect
  const sky = new GradientEquirectTexture(128)
  sky.topColor.set(o.sky.top); sky.bottomColor.set(o.sky.bottom); sky.exponent = 0.6; sky.update()
  const pt = new WebGLPathTracer(renderer)
  let quad: FullScreenQuad | null = null
  // See-through materials (windows, shower screens, glass doors) are faded in the live view; here they
  // become clear glass that refracts light, so the sky and sun come through.
  const glass = new Map<THREE.Material, Record<string, unknown>>()
  scene.traverse((m) => {
    const mat = (m as THREE.Mesh).isMesh ? (m as THREE.Mesh).material as THREE.MeshStandardMaterial : null
    if (!mat || Array.isArray(mat) || !mat.transparent || mat.opacity >= 0.5 || glass.has(mat)) return
    const g = mat as unknown as Record<string, unknown>
    glass.set(mat, { transparent: g.transparent, opacity: g.opacity, roughness: g.roughness, transmission: g.transmission, ior: g.ior })
    Object.assign(g, { transparent: false, opacity: 1, roughness: 0.02, transmission: 1, ior: 1.5 })
  })
  try {
    renderer.setPixelRatio(1); renderer.setSize(W, H, false)
    camera.aspect = W / H; camera.updateProjectionMatrix()
    // The sky lights the room and is what you see through the windows.
    scene.environment = sky; scene.environmentIntensity = o.sky.intensity; scene.background = sky
    Object.assign(pt, { renderToCanvas: false, rasterizeScene: false, renderDelay: 0, minSamples: 0, fadeDuration: 0, bounces: 6, filterGlossyFactor: 0.5 })
    // Each sample in 3 × 3 tiles, so the page stays responsive between them.
    pt.tiles.set(3, 3)
    // Build the scene's ray-tracing structure (a flat is small enough to do on the main thread).
    o.onProgress('prepare', 0, 1)
    await new Promise((r) => setTimeout(r, 30))
    pt.setScene(scene, camera)
    o.onProgress('prepare', 1, 1)
    // Shown through a light edge-preserving smooth, tone mapped like the live view.
    const dm = new DenoiseMaterial({ map: pt.target.texture, sigma: 2 + 3 * o.denoise, threshold: 0.01 + 0.04 * o.denoise, kSigma: 1 })
    dm.toneMapped = true
    quad = new FullScreenQuad(dm)
    const show = () => { renderer.toneMappingExposure = o.exposure; renderer.setRenderTarget(null); renderer.clear(); quad!.render(renderer); renderer.toneMappingExposure = oldExp }
    let last = -1
    while (pt.samples < o.samples && !o.stopped()) {
      pt.renderSample()
      const n = Math.floor(pt.samples)
      // The 3D view shows the photo building up.
      if (n !== last) { last = n; o.onProgress('render', n, o.samples); if (n % 4 === 0) show() }
      await new Promise((r) => requestAnimationFrame(r))
    }
    if (pt.samples < 1) return null
    renderer.toneMappingExposure = o.exposure
    renderer.setRenderTarget(null); renderer.clear(); quad.render(renderer)
    // Copy straight away: the canvas is cleared once the browser composites it.
    const out = document.createElement('canvas'); out.width = W; out.height = H
    out.getContext('2d')!.drawImage(renderer.domElement, 0, 0, W, H)
    return out
  } finally {
    quad?.material.dispose(); quad?.dispose(); pt.dispose(); sky.dispose()
    for (const [m, v] of glass) Object.assign(m, v)
    scene.environment = oldEnv; scene.environmentIntensity = oldEnvI; scene.background = oldBg
    renderer.toneMappingExposure = oldExp; renderer.setPixelRatio(oldPR); renderer.setSize(oldSize.x, oldSize.y, false)
    camera.aspect = oldAsp; camera.updateProjectionMatrix()
  }
}
