/** The 3D estate: blocks at their heights, roads, parks, reserved sites, your unit, the sun. */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { azDir, blockMasses, ellipsePoly, sunPosition, sgTime, type Amenity, type Osm, type Pt, type Site, type UnitPos } from './analysis'

export interface SceneApi {
  setSite(site: Site): void
  /** Existing buildings and streets around the estate (OpenStreetMap). */
  setOsm(osm: Osm): void
  setFuture(storeys: number): void
  setUnit(u: UnitPos | null): void
  setSun(y: number, m: number, d: number, hours: number): void
  windowView(on: boolean): void
  /** Called each frame with the camera's heading (degrees clockwise from north) for a compass. */
  onHeading(fn: (deg: number) => void): void
  /** The distance line under each place's label (e.g. walking time); straight-line distance otherwise. */
  labelText(fn: (a: Amenity) => string): void
  /** Called when someone clicks a block (not a drag): which block, where on the ground plan, and at what height. */
  onPick(fn: (block: string, at: Pt, heightM: number) => void): void
  reset(): void
  resize(): void
}

export function createScene(canvas: HTMLCanvasElement): SceneApi | null {
  let renderer: THREE.WebGLRenderer
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }) } catch { return null }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 6000)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI * 0.49
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a9a8a, 1.2), sun = new THREE.DirectionalLight(0xfff2dd, 2.6)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  const sc = sun.shadow.camera
  sc.left = -450; sc.right = 450; sc.top = 450; sc.bottom = -450; sc.near = 10; sc.far = 3000
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6
  scene.add(hemi, sun, sun.target)
  const world = new THREE.Group(), futureG = new THREE.Group(), unitG = new THREE.Group(), labelG = new THREE.Group(), osmG = new THREE.Group()
  scene.add(world, futureG, unitG, labelG, osmG)
  let osmData: Osm | null = null
  let labelFn: ((a: Amenity) => string) | null = null

  let site: Site | null = null, centre: Pt = [200, 180], future = 40, unit: UnitPos | null = null, winMode = false
  const look = { yaw: 0, pitch: 0 }
  const V = (p: Pt, y = 0) => new THREE.Vector3(p[0] - centre[0], y, p[1] - centre[1])
  /** Shapes are drawn in the x/z plane: build in x/y then rotate so +y becomes -z (south becomes +z). */
  const shape = (poly: Pt[]) => new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0] - centre[0], -(p[1] - centre[1]))))
  const extrude = (poly: Pt[], h: number, mat: THREE.Material) => {
    const g = new THREE.ExtrudeGeometry(shape(poly), { depth: h, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    const m = new THREE.Mesh(g, mat)
    m.castShadow = true; m.receiveShadow = true
    return m
  }
  const flat = (poly: Pt[], y: number, mat: THREE.Material) => {
    const g = new THREE.ShapeGeometry(shape(poly))
    g.rotateX(-Math.PI / 2)
    const m = new THREE.Mesh(g, mat)
    m.position.y = y; m.receiveShadow = true
    return m
  }
  const ribbon = (line: Pt[], w: number, y: number, mat: THREE.Material) => {
    const pos: number[] = [], idx: number[] = []
    line.forEach((p, i) => {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
      const nx = -dy / L * w / 2, ny = dx / L * w / 2
      pos.push(p[0] + nx - centre[0], y, p[1] + ny - centre[1], p[0] - nx - centre[0], y, p[1] - ny - centre[1])
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k) }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
    const m = new THREE.Mesh(g, mat)
    m.receiveShadow = true
    return m
  }
  const mats = {
    ground: new THREE.MeshStandardMaterial({ color: '#b9c9a4', roughness: 1 }),
    park: new THREE.MeshStandardMaterial({ color: '#8fb57a', roughness: 1 }),
    road: new THREE.MeshStandardMaterial({ color: '#7d8386', roughness: 0.9 }),
    exp: new THREE.MeshStandardMaterial({ color: '#5f6568', roughness: 0.9 }),
    block: new THREE.MeshStandardMaterial({ color: '#efece6', roughness: 0.85 }),
    mine: new THREE.MeshStandardMaterial({ color: '#f6e7b8', roughness: 0.85 }),
    bldg: new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.9 }),
    future: new THREE.MeshStandardMaterial({ color: '#9fb4c8', roughness: 1, transparent: true, opacity: 0.22, depthWrite: false }),
    futureFlat: new THREE.MeshStandardMaterial({ color: '#c9d3dc', roughness: 1 }),
    unit: new THREE.MeshStandardMaterial({ color: '#ff8a00', emissive: '#ff6a00', emissiveIntensity: 0.8 }),
    osm: new THREE.MeshStandardMaterial({ color: '#c9cdd0', roughness: 0.9 }),
    osmGuess: new THREE.MeshStandardMaterial({ color: '#d9dcde', roughness: 0.9, transparent: true, opacity: 0.6 }),
  }

  function build() {
    world.clear()
    if (!site) return
    const g = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), mats.ground)
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true
    world.add(g)
    for (const z of site.zones) if (z.kind === 'park') world.add(flat(z.poly, 0.05, mats.park))
    for (const r of site.roads) world.add(ribbon(r.line, r.w, 0.1, r.kind === 'expressway' ? mats.exp : mats.road))
    for (const b of site.buildings) world.add(extrude(b.poly ?? ellipsePoly(...b.ellipse!), b.h, mats.bldg))
    const S = site
    for (const b of S.blocks) for (const part of blockMasses(b)) {
      const m = extrude(part.poly, part.storeys * S.storeyM + 2, unit && unit.block.id === b.id ? mats.mine : mats.block)
      m.userData.block = b.id
      world.add(m)
      // Storey lines: thin rings every 5 storeys so heights read at a glance.
      for (let s = 5; s < part.storeys; s += 5) {
        const pts = part.poly.map((p) => V(p, s * S.storeyM))
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#b9b4aa' }))
        world.add(line)
      }
    }
    buildFuture()
  }
  /** A text label that stays the same size on screen. */
  function label(text: string, sub: string, color: string) {
    const c = document.createElement('canvas'), x = c.getContext('2d')!, f = 'IBM Plex Sans, system-ui, sans-serif'
    x.font = `600 28px ${f}`
    const w = Math.max(x.measureText(text).width, sub ? (x.font = `400 22px ${f}`, x.measureText(sub).width) : 0) + 34
    c.width = Math.ceil(w); c.height = sub ? 76 : 48
    x.fillStyle = 'rgba(255,255,255,.92)'; x.strokeStyle = color; x.lineWidth = 3
    x.beginPath(); x.roundRect(2, 2, c.width - 4, c.height - 4, 10); x.fill(); x.stroke()
    x.fillStyle = '#14242a'; x.font = `600 28px ${f}`; x.fillText(text, 16, 34)
    if (sub) { x.fillStyle = '#54686f'; x.font = `400 22px ${f}`; x.fillText(sub, 16, 64) }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, sizeAttenuation: false, depthTest: false, transparent: true }))
    sp.scale.set(c.width / c.height * 0.045, 0.045, 1); sp.center.set(0.5, 0)
    sp.userData.base = sp.scale.clone()
    sp.renderOrder = 10
    return sp
  }
  const KIND_COL: Record<string, string> = { mrt: '#d22f45', bus: '#7a5aa6', school: '#2f6db5', park: '#3f8f4e', shops: '#c07a14', community: '#5a7380', health: '#c0392b' }
  /** Labels in priority order (your unit, then nearest first) for hiding the ones that would overlap. */
  let sprites: THREE.Sprite[] = []
  function buildLabels() {
    labelG.clear()
    sprites = []
    if (!site) return
    const ranked: [number, THREE.Sprite][] = []
    for (const a of site.amenities) {
      const dist = unit ? Math.hypot(a.at[0] - unit.eye[0], a.at[1] - unit.eye[1]) : 0
      const sub = !unit ? '' : labelFn ? labelFn(a) : dist < 1000 ? `${Math.round(dist / 10) * 10} m` : `${(dist / 1000).toFixed(1)} km`
      const sp = label(a.name.replace(/ \(.*\)$/, ''), sub, KIND_COL[a.kind] ?? '#5a7380')
      sp.position.copy(V(a.at, 25))
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 25, 6), new THREE.MeshBasicMaterial({ color: KIND_COL[a.kind] ?? '#5a7380' }))
      pin.position.copy(V(a.at, 12.5))
      labelG.add(sp, pin)
      ranked.push([dist, sp])
    }
    if (unit) { const sp = label('Your unit', `#${String(unit.storey).padStart(2, '0')}-${unit.unit.no}, faces ${unit.facing}`, '#ff8a00'); sp.position.copy(V(unit.unit.win, unit.floorZ + site.storeyM + 2)); labelG.add(sp); ranked.push([-1, sp]) }
    sprites = ranked.sort((p, q) => p[0] - q[0]).map((r) => r[1])
  }
  /** Show labels greedily by priority, skipping any that would overlap a shown one or sit under the top buttons. */
  const ndc = new THREE.Vector3()
  function declutter() {
    const t = Math.tan(camera.fov * Math.PI / 360), H = canvas.clientHeight || 1, top = 1 - 2 * 48 / H
    // Same size on screen whatever the field of view (the window view is wider).
    const k = t / Math.tan(45 * Math.PI / 360)
    const shown: number[][] = []
    for (const sp of sprites) {
      sp.scale.copy(sp.userData.base).multiplyScalar(k)
      ndc.copy(sp.position).project(camera)
      const w = sp.scale.x / (t * camera.aspect), h = sp.scale.y / t
      const r = [ndc.x - w / 2, ndc.y, ndc.x + w / 2, ndc.y + h]
      const ok = ndc.z < 1 && r[3] < top && r[1] > -1 && r[2] > -1 && r[0] < 1 && !shown.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])
      sp.visible = ok
      if (ok) shown.push(r)
    }
  }
  /** OpenStreetMap buildings as two merged meshes (known heights, guessed heights) and streets as lines. */
  function buildOsm() {
    osmG.clear()
    if (!osmData || !site) return
    const known: THREE.BufferGeometry[] = [], guess: THREE.BufferGeometry[] = []
    for (const b of osmData.buildings) {
      const pts: Pt[] = []
      for (let i = 0; i < b.p.length; i += 2) pts.push([b.p[i], b.p[i + 1]])
      if (pts.length < 3) continue
      const g = new THREE.ExtrudeGeometry(shape(pts), { depth: b.h, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      ;(b.a ? guess : known).push(g.toNonIndexed())
    }
    for (const [list, mat] of [[known, mats.osm], [guess, mats.osmGuess]] as const) {
      if (!list.length) continue
      const m = new THREE.Mesh(mergeGeometries(list as THREE.BufferGeometry[]), mat)
      m.castShadow = mat === mats.osm; m.receiveShadow = true
      osmG.add(m)
    }
    const w = osmData.walk, seg: number[] = []
    for (const way of w.ways) for (let k = 1; k < way.length; k++) {
      const a = way[k - 1], b = way[k]
      seg.push(w.nodes[2 * a] - centre[0], 0.2, w.nodes[2 * a + 1] - centre[1], w.nodes[2 * b] - centre[0], 0.2, w.nodes[2 * b + 1] - centre[1])
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
    osmG.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#f3f1ea', transparent: true, opacity: 0.7 })))
  }
  function buildFuture() {
    futureG.clear()
    if (!site) return
    for (const z of site.zones) {
      if (z.kind !== 'future') continue
      if (future > 0) {
        const m = extrude(z.poly, future * site.storeyM, mats.future)
        m.castShadow = false
        futureG.add(m, new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: '#7f93a8', transparent: true, opacity: 0.6 })))
      } else futureG.add(flat(z.poly, 0.06, mats.futureFlat))
    }
  }
  function buildUnit() {
    unitG.clear()
    if (!unit || !site) return
    const { eye, n, floorZ } = unit, along: Pt = [-n[1], n[0]]
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats.unit)
    box.scale.set(Math.abs(along[0]) * 7 + Math.abs(n[0]) * 0.6, site.storeyM * 0.9, Math.abs(along[1]) * 7 + Math.abs(n[1]) * 0.6)
    box.position.copy(V([unit.unit.win[0] + n[0] * 0.3, unit.unit.win[1] + n[1] * 0.3], floorZ + site.storeyM / 2))
    unitG.add(box)
    // A beam out from the window, so the facing direction is obvious from above.
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 8), mats.unit)
    beam.rotation.z = Math.PI / 2
    beam.rotation.y = -Math.atan2(n[1], n[0])
    beam.position.copy(V([eye[0] + n[0] * 15, eye[1] + n[1] * 15], floorZ + 1.4))
    unitG.add(beam)
  }
  function lookFromWindow() {
    if (!unit) return
    const { eye, n } = unit
    camera.position.copy(V([eye[0] + n[0] * 0.6, eye[1] + n[1] * 0.6], eye[2]))
    const yaw = Math.atan2(n[1], n[0]) + look.yaw, dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(look.pitch), Math.sin(look.pitch), Math.sin(yaw) * Math.cos(look.pitch))
    camera.lookAt(camera.position.clone().add(dir))
  }
  function reset() {
    if (!site) return
    // Look at the unit from the side it faces, a little to one side and above.
    const target = unit ? V(unit.unit.win, unit.floorZ) : new THREE.Vector3(0, 0, 0), n = unit ? unit.n : [0, 1] as Pt
    controls.target.copy(target)
    camera.position.copy(target.clone().add(new THREE.Vector3(n[0] * 330 - n[1] * 140, 220, n[1] * 330 + n[0] * 140)))
    camera.fov = 45; camera.updateProjectionMatrix()
    controls.update()
  }

  // Looking around from the window: drag to turn.
  let drag: { x: number; y: number } | null = null
  canvas.addEventListener('pointerdown', (e) => { if (winMode) { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId) } })
  canvas.addEventListener('pointermove', (e) => {
    if (!winMode || !drag) return
    look.yaw += (e.clientX - drag.x) * 0.004; look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - (e.clientY - drag.y) * 0.004))
    drag = { x: e.clientX, y: e.clientY }
    lookFromWindow()
  })
  canvas.addEventListener('pointerup', () => { drag = null })

  // Clicking a block picks a unit there; a press that moves (orbiting) or lingers doesn't count.
  let pickFn: ((block: string, at: Pt, heightM: number) => void) | null = null, press: { x: number; y: number; t: number } | null = null
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
  const blockAt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1)
    ray.setFromCamera(ptr, camera)
    return ray.intersectObjects(world.children.filter((o) => o.userData.block), false)[0] ?? null
  }
  canvas.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY, t: performance.now() } })
  canvas.addEventListener('pointerup', (e) => {
    const p = press; press = null
    if (winMode || !pickFn || !p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6 || performance.now() - p.t > 500) return
    const hit = blockAt(e)
    if (hit) pickFn(hit.object.userData.block, [hit.point.x + centre[0], hit.point.z + centre[1]], hit.point.y)
  })
  // A pointer over a block shows it can be clicked (checked at most once a frame).
  let hoverQueued = false
  canvas.addEventListener('pointermove', (e) => {
    if (winMode || press || hoverQueued || e.pointerType !== 'mouse') return
    hoverQueued = true
    requestAnimationFrame(() => { hoverQueued = false; canvas.style.cursor = pickFn && blockAt(e) ? 'pointer' : '' })
  })

  let heading: ((deg: number) => void) | null = null
  const fwd = new THREE.Vector3()
  function frame() {
    requestAnimationFrame(frame)
    if (!winMode) controls.update()
    declutter()
    renderer.render(scene, camera)
    // Heading: north is -z.
    camera.getWorldDirection(fwd)
    heading?.((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI + 360) % 360)
  }
  const api: SceneApi = {
    setSite(s) {
      site = s
      const xs = s.blocks.flatMap((b) => b.footprint.map((p) => p[0])), ys = s.blocks.flatMap((b) => b.footprint.map((p) => p[1]))
      centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
      build(); reset()
    },
    setOsm(o) { osmData = o; buildOsm() },
    setFuture(st) { future = st; buildFuture() },
    setUnit(u) {
      const changedBlock = unit?.block.id !== u?.block.id
      unit = u
      if (changedBlock) build()
      buildUnit()
      buildLabels()
      if (winMode) lookFromWindow()
    },
    setSun(y, m, d, hours) {
      if (!site) return
      const s = sunPosition(sgTime(y, m, d, hours), site.lat, site.lon), dir = azDir(s.az), up = Math.sin(Math.max(0, s.alt) * Math.PI / 180), flatR = Math.cos(Math.max(0, s.alt) * Math.PI / 180)
      sun.position.set(dir[0] * flatR * 1200, up * 1200 + 1, dir[1] * flatR * 1200)
      sun.intensity = s.alt > 0 ? 2.6 * Math.min(1, s.alt / 15 + 0.2) : 0
      hemi.intensity = s.alt > 0 ? 1.2 : 0.35
      const day = new THREE.Color('#cfe0ea'), dusk = new THREE.Color('#e9c7a6'), night = new THREE.Color('#1c2433')
      scene.background = s.alt > 8 ? day : s.alt > 0 ? dusk.lerp(day, s.alt / 8) : night
      sun.color.set(s.alt < 10 ? '#ffd2a1' : '#fff2dd')
    },
    windowView(on) {
      winMode = on && !!unit
      controls.enabled = !winMode
      look.yaw = 0; look.pitch = 0
      if (winMode) { camera.fov = 70; camera.updateProjectionMatrix(); lookFromWindow() } else reset()
    },
    reset,
    onHeading(fn) { heading = fn },
    labelText(fn) { labelFn = fn; buildLabels() },
    onPick(fn) { pickFn = fn },
    resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
    },
  }
  new ResizeObserver(() => api.resize()).observe(canvas)
  frame()
  return api
}
