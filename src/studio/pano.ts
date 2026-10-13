/** 360° panorama: render a cube map from a point and unwrap it to an equirectangular image. */
import * as THREE from 'three'

export function renderPanorama(renderer: THREE.WebGLRenderer, scene: THREE.Scene, at: THREE.Vector3, yaw: number, width = 4096): HTMLCanvasElement {
  const size = Math.min(2048, width / 4)
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false })
  const cubeCam = new THREE.CubeCamera(0.05, 100, cubeRT)
  cubeCam.position.copy(at)
  cubeCam.update(renderer, scene)
  const W = width, H = width / 2
  const out = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace })
  // Each output pixel looks along a direction given by its longitude/latitude; yaw turns the
  // panorama so its centre is where the walk camera faces.
  const mat = new THREE.ShaderMaterial({
    uniforms: { cube: { value: cubeRT.texture }, yaw: { value: yaw } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform samplerCube cube; uniform float yaw; varying vec2 vUv;
      void main(){
        float lon = (vUv.x - 0.5) * 6.2831853 + yaw, lat = (vUv.y - 0.5) * 3.1415927;
        vec3 d = vec3(-sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat));
        gl_FragColor = textureCube(cube, vec3(-d.x, d.y, d.z));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    toneMapped: true, depthTest: false, depthWrite: false,
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  sc.add(quad)
  const prev = renderer.getRenderTarget()
  renderer.setRenderTarget(out)
  renderer.render(sc, cam)
  const px = new Uint8Array(W * H * 4)
  renderer.readRenderTargetPixels(out, 0, 0, W, H, px)
  renderer.setRenderTarget(prev)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const img = c.getContext('2d')!.createImageData(W, H)
  // WebGL rows run bottom-up.
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)
  c.getContext('2d')!.putImageData(img, 0, 0)
  cubeRT.dispose(); out.dispose(); mat.dispose(); quad.geometry.dispose()
  return c
}
