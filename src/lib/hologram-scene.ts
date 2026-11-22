// Escena 3D del holograma de YO (solo web, con three.js). El cuerpo es un modelo .glb (public/modelos/) con un
// material propio de holograma: relieve de su textura, borde brillante, líneas finas, franja de escaneo que sube y
// baja y respiración. Alrededor: plataforma con anillos y partículas que suben. Se gira arrastrando.
// La pantalla la crea con `createHologram` y la controla con `setRunning` (pausa) y `resize`.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type HologramOptions = {
  modelUrl: string;
  /** Colores (de los tokens): el del holograma, el brillo del escaneo y el fondo. */
  color: string;
  glint: string;
  background: string;
  width: number;
  height: number;
  onError: (e: unknown) => void;
};

export type HologramController = {
  setRunning: (on: boolean) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

const STEP = 1 / 30 - 0.002; // 30 cuadros por segundo bastan para un giro lento

const VERT = /* glsl */ `
  uniform float uBreath;
  varying vec3 vNormal; varying vec3 vView; varying float vY; varying vec2 vUv; varying vec3 vViewPos;
  void main() {
    // Respiración: el tórax (entre 1,16 y 1,5 m, cerca del centro) sale unos milímetros.
    float chest = smoothstep(1.16, 1.3, position.y) * (1.0 - smoothstep(1.4, 1.5, position.y)) * (1.0 - smoothstep(0.12, 0.2, abs(position.x)));
    vec3 pos = position + normal * chest * uBreath * 0.005;
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vY = wp.y;
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = viewMatrix * wp;
    vViewPos = mv.xyz;
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uGlint; uniform float uTime; uniform float uScanY; uniform float uScanOn; uniform float uOpacity;
  uniform float uUseMaps; uniform sampler2D uNormalMap; uniform sampler2D uMap; uniform vec2 uNormalScale;
  varying vec3 vNormal; varying vec3 vView; varying float vY; varying vec2 vUv; varying vec3 vViewPos;
  // Relieve desde el mapa de normales sin tangentes (el método que usa three.js).
  vec3 perturb(vec3 eyePos, vec3 n, vec3 mapN) {
    vec3 q0 = dFdx(eyePos); vec3 q1 = dFdy(eyePos);
    vec2 st0 = dFdx(vUv); vec2 st1 = dFdy(vUv);
    vec3 q1perp = cross(q1, n); vec3 q0perp = cross(n, q0);
    vec3 T = q1perp * st0.x + q0perp * st1.x;
    vec3 B = q1perp * st0.y + q0perp * st1.y;
    float det = max(dot(T, T), dot(B, B));
    float scale = det == 0.0 ? 0.0 : inversesqrt(det);
    return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + mapN.z * n);
  }
  void main() {
    vec3 n = normalize(vNormal);
    float neon = 0.0;
    if (uUseMaps > 0.5) {
      vec3 mapN = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
      mapN.xy *= uNormalScale;
      n = perturb(vViewPos, n, mapN);
      vec3 base = texture2D(uMap, vUv).rgb;
      neon = smoothstep(0.55, 0.9, dot(base, vec3(0.299, 0.587, 0.114)));
    }
    float rim = pow(1.0 - abs(dot(n, normalize(vView))), 2.4);
    float diff = max(dot(n, normalize(vec3(-0.45, 0.65, 0.6))), 0.0);
    float lines = 0.86 + 0.14 * step(0.5, fract(vY * 140.0 - uTime * 0.5));
    float band = uScanOn * smoothstep(0.07, 0.0, abs(vY - uScanY));
    float flicker = 0.95 + 0.05 * sin(uTime * 21.0 + vY * 37.0);
    vec3 c = uColor * (0.16 + diff * 0.7 + rim * 1.25 + neon * 0.9) * lines * flicker + uGlint * (band * 0.9 + neon * 0.25);
    float a = clamp((0.26 + diff * 0.34 + rim * 0.8 + neon * 0.4) * uOpacity * lines + band * 0.6, 0.0, 1.0);
    gl_FragColor = vec4(c, a);
  }`;

/**
 * Deja solo el cuerpo, a 1,78 m de alto, centrado y con los pies en el suelo: quita la placa de piso que traen
 * algunos modelos pegada a los pies (los triángulos que quedan por completo a menos de 4 mm del suelo) y, si hay
 * piezas sueltas (anillos, base), se queda con la más grande.
 */
function bodyOnly(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position.array as Float32Array;
  const all = geo.index ? Array.from(geo.index.array) : Array.from({ length: pos.length / 3 }, (_, i) => i);
  let floorY = Infinity;
  for (let i = 1; i < pos.length; i += 3) floorY = Math.min(floorY, pos[i]);
  const index: number[] = [];
  for (let t = 0; t < all.length; t += 3) {
    const low = [0, 1, 2].every((k) => pos[all[t + k] * 3 + 1] < floorY + 0.0042);
    if (!low) index.push(all[t], all[t + 1], all[t + 2]);
  }
  // Piezas: los vértices repetidos en las costuras de la textura se unen por posición.
  const ids = new Map<string, number>();
  const weld = new Int32Array(pos.length / 3);
  for (let i = 0; i < weld.length; i++) {
    const key = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    weld[i] = ids.get(key)!;
  }
  const parent = new Int32Array(ids.size).map((_, i) => i);
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (let t = 0; t < index.length; t += 3) {
    const a = find(weld[index[t]]);
    parent[find(weld[index[t + 1]])] = a;
    parent[find(weld[index[t + 2]])] = a;
  }
  const count = new Map<number, number>();
  for (let t = 0; t < index.length; t += 3) {
    const r = find(weld[index[t]]);
    count.set(r, (count.get(r) ?? 0) + 1);
  }
  const biggest = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const kept: number[] = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < index.length; t += 3) {
    if (find(weld[index[t]]) !== biggest) continue;
    for (let k = 0; k < 3; k++) {
      const v = index[t + k];
      kept.push(v);
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], pos[v * 3 + a]);
        max[a] = Math.max(max[a], pos[v * 3 + a]);
      }
    }
  }
  geo.setIndex(kept);
  const s = 1.78 / (max[1] - min[1]);
  geo.translate(-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2);
  geo.scale(s, s, s);
  return geo;
}

export function createHologram(canvas: HTMLCanvasElement, o: HologramOptions): HologramController {
  // Colores tal cual (sin conversión de espacio de color), como en el prototipo aprobado.
  THREE.ColorManagement.enabled = false;
  // Fondo transparente: detrás se ve la red de fondo de la app.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new THREE.Color(o.background), 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const color = new THREE.Color(o.color);
  const glow = (opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const uniforms = {
    uColor: { value: color },
    uGlint: { value: new THREE.Color(o.glint) },
    uTime: { value: 0 },
    uScanY: { value: 0 },
    uScanOn: { value: 1 },
    uOpacity: { value: 0.72 },
    uBreath: { value: 0 },
    uUseMaps: { value: 0 },
    uNormalMap: { value: null as THREE.Texture | null },
    uMap: { value: null as THREE.Texture | null },
    uNormalScale: { value: new THREE.Vector2(1, 1) },
  };
  const holoMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    blending: THREE.AdditiveBlending,
  });
  // Primero se pinta solo la profundidad: así el holograma muestra la superficie de afuera (un solo cuerpo).
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });

  const figure = new THREE.Group();
  scene.add(figure);

  // Plataforma: disco, dos anillos y un anillo punteado que gira.
  const platform = new THREE.Group();
  const dashed = new THREE.Group();
  for (let i = 0; i < 48; i++) {
    dashed.add(new THREE.Mesh(new THREE.RingGeometry(0.53, 0.55, 3, 1, (i / 48) * Math.PI * 2, ((Math.PI * 2) / 48) * 0.45), glow(0.5)));
  }
  for (const m of [new THREE.Mesh(new THREE.CircleGeometry(0.4, 64), glow(0.14)), new THREE.Mesh(new THREE.RingGeometry(0.4, 0.413, 96), glow(0.85)), new THREE.Mesh(new THREE.RingGeometry(0.48, 0.486, 96), glow(0.4)), dashed]) {
    m.rotation.x = -Math.PI / 2;
    platform.add(m);
  }
  scene.add(platform);

  // Partículas que suben alrededor del cuerpo.
  const N = 300;
  const pArr = new Float32Array(N * 3);
  const speed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.26 + Math.random() * 0.3;
    pArr[i * 3] = Math.cos(a) * r;
    pArr[i * 3 + 1] = Math.random() * 1.9;
    pArr[i * 3 + 2] = Math.sin(a) * r;
    speed[i] = 0.05 + Math.random() * 0.16;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
  scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ color, size: 0.011, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending })));

  // El cuerpo.
  let disposed = false;
  new GLTFLoader().load(
    o.modelUrl,
    (gltf) => {
      if (disposed) return;
      let src: THREE.Mesh | null = null;
      gltf.scene.traverse((obj) => {
        if (!src && (obj as THREE.Mesh).isMesh) src = obj as THREE.Mesh;
      });
      if (!src) return o.onError(new Error('El modelo no trae una malla.'));
      const mesh = src as THREE.Mesh;
      const geo = bodyOnly(mesh.geometry);
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m.normalMap && m.map) {
        m.map.colorSpace = THREE.NoColorSpace; // se lee el brillo de la textura tal cual
        m.map.needsUpdate = true;
        uniforms.uNormalMap.value = m.normalMap;
        uniforms.uMap.value = m.map;
        uniforms.uNormalScale.value.copy(m.normalScale);
        uniforms.uUseMaps.value = 1;
      }
      const depth = new THREE.Mesh(geo, depthMat);
      depth.renderOrder = 0;
      const holo = new THREE.Mesh(geo, holoMat);
      holo.renderOrder = 1;
      figure.add(depth, holo);
      draw();
    },
    undefined,
    (e) => !disposed && o.onError(e),
  );

  // Girar arrastrando (con inercia).
  let yaw = 0.45;
  let vel = 0;
  let dragging = false;
  let lastX = 0;
  const down = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    yaw += dx * 0.01;
    vel = dx * 0.01;
    if (!running) draw();
  };
  const up = () => {
    dragging = false;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const resize = (w: number, h: number) => {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Cabe el cuerpo entero con la plataforma, con un poco de aire.
    camera.position.set(0, 1.0, w / h < 0.7 ? 4.15 : 3.9);
    camera.lookAt(0, 0.93, 0);
    camera.updateProjectionMatrix();
    draw();
  };

  let time = 0;
  let scanT = 0;
  const draw = () => {
    if (disposed) return;
    figure.rotation.y = yaw;
    uniforms.uTime.value = time;
    renderer.render(scene, camera);
  };

  const step = (dt: number) => {
    time += dt;
    if (!dragging) {
      yaw += dt * 0.32 + vel;
      vel *= 0.92;
    }
    dashed.rotation.z = -time * 0.3;
    scanT = (scanT + dt * 0.25) % 1;
    uniforms.uScanY.value = 0.02 + (1 - Math.abs(scanT * 2 - 1)) * 1.8;
    uniforms.uBreath.value = 0.5 + 0.5 * Math.sin(time * 1.4);
    for (let i = 0; i < N; i++) {
      pArr[i * 3 + 1] += speed[i] * dt;
      if (pArr[i * 3 + 1] > 1.95) pArr[i * 3 + 1] = 0;
    }
    pGeo.attributes.position.needsUpdate = true;
    draw();
  };

  let running = false;
  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = (now - last) / 1000;
    if (dt < STEP) return;
    last = now;
    step(Math.min(dt, 0.05));
  };
  const setRunning = (on: boolean) => {
    if (on === running || disposed) return;
    running = on;
    // Quieta (animaciones en OFF, fuera de vista): sin escaneo ni respiración, un solo cuadro.
    uniforms.uScanOn.value = on ? 1 : 0;
    uniforms.uBreath.value = 0;
    if (on) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
      draw();
    }
  };

  resize(o.width, o.height);

  return {
    setRunning,
    resize,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
    },
  };
}
