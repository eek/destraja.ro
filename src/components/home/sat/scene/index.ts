import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PointLight,
  Points,
  Scene,
  SpotLight,
  Sprite,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { resolvedTheme } from '@/lib/theme';
import type { RiskLevel } from '@/lib/types';
import { boardGrid, type Notice, type SceneOptions, type VillageScene } from '../types';
import { BALL, BOX, Kit, Pen } from './kit';
import { C, MAT, readTokens, type Tokens } from './palette';
import { Beam, Bubbles, floatShadow, NightLights, Smoke } from './fx';
import { Village } from './people';
import { BOARD, BOARD_LAMP, buildWorld, FLAG_TOP, islandOutline, POND, TOWER, TREES, treeGeometries } from './world';

const FOV = 24;
const ELEVATION = (37 * Math.PI) / 180;
/** Camera privește puțin din stânga, ca turnul să nu stea niciodată în spatele avizierului. */
const AZ0 = (-6 * Math.PI) / 180;
const ORBIT = (21 * Math.PI) / 180;
const ORBIT_PERIOD = 46;
const THEME_FADE = 0.7;
const POP_S = 0.45;
const MAX_DPR = 2;
/** De unde începem să căutăm cadrul static: satul a pornit deja de-a binelea. */
const STILL_AT = 24;

const DAY = {
  sky: new Color('#ffffff'),
  ground: new Color('#d9d1c0'),
  sun: new Color('#fff7ea'),
  hemi: 1.2,
  sunI: 2.5,
  shadow: 0.6,
  sunPos: new Vector3(-9, 16, 9),
};
const NIGHT = {
  sky: new Color('#93a3cc'),
  ground: new Color('#222a3b'),
  sun: new Color('#b4c2ec'),
  hemi: 0.8,
  sunI: 1.0,
  shadow: 0.75,
  sunPos: new Vector3(8, 15, -4),
};

type NoticeSlot = { x: number; y: number; z: number; level: RiskLevel; id: string };

export function createVillageScene(canvas: HTMLCanvasElement, opts: SceneOptions): VillageScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.info.autoReset = true;
  // Unelte de verificare: #sat-bench măsoară cadrul cu tot cu GPU, #sat-record avansează cadru cu cadru (pentru video).
  const bench = location.hash.includes('sat-bench');
  const record = location.hash.includes('sat-record');

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 1, 200);
  const island = new Group();
  scene.add(island);

  // Satul static: un singur mesh cu culori pe vârfuri.
  const world = buildWorld();
  const solidMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const solid = new Mesh(world.solid.geometry(), solidMat);
  solid.castShadow = true;
  solid.receiveShadow = true;
  island.add(solid);
  const paneMat = new MeshLambertMaterial({ color: MAT.pane, flatShading: true, emissive: MAT.lamp, emissiveIntensity: 0 });
  const panes = new Mesh(world.panes.geometry(), paneMat);
  panes.receiveShadow = true;
  island.add(panes);

  // Copacii: instanțe care se leagănă ușor.
  const tg = treeGeometries();
  const treeMat = new MeshLambertMaterial({ flatShading: true });
  const trunks = new InstancedMesh(tg.trunk, treeMat, TREES.length);
  const crowns = new InstancedMesh(tg.crown, treeMat, TREES.length);
  const firs = new InstancedMesh(tg.fir, treeMat, TREES.length);
  for (const m of [trunks, crowns, firs]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    island.add(m);
  }
  {
    // Culorile urmează ordinea instanțelor: trunchiuri pentru toți, coroane și brazi separat.
    let nc = 0;
    let nf = 0;
    TREES.forEach((tr, i) => {
      trunks.setColorAt(i, C.wood);
      if (tr.fir) firs.setColorAt(nf++, tr.tone ? C.firDark : C.fir);
      else crowns.setColorAt(nc++, tr.tone ? C.canopyWarm : C.canopy);
    });
    crowns.count = nc;
    firs.count = nf;
  }
  const base = new Matrix4();
  const rot = new Matrix4();
  const part = new Matrix4();
  const placeTrees = (t: number) => {
    let nc = 0;
    let nf = 0;
    TREES.forEach((tr, i) => {
      const sway = Math.sin(t * 0.9 + tr.x * 0.7 + tr.z * 0.3) * 0.035;
      base.makeTranslation(tr.x, 0, tr.z).multiply(rot.makeRotationZ(sway)).multiply(rot.makeRotationY(tr.x * 3.1));
      if (tr.fir) {
        trunks.setMatrixAt(i, part.copy(base).multiply(rot.makeScale(tr.s * 1.1, tr.s * 0.7, tr.s * 1.1)));
        firs.setMatrixAt(nf++, part.copy(base).multiply(rot.makeScale(tr.s, tr.s * 1.1, tr.s)));
      } else {
        trunks.setMatrixAt(i, part.copy(base).multiply(rot.makeScale(tr.s, tr.s * 1.25, tr.s)));
        part.copy(base).multiply(rot.makeTranslation(0, 1.75 * tr.s, 0)).multiply(rot.makeScale(tr.s * 0.95, tr.s * 1.05, tr.s * 0.95));
        crowns.setMatrixAt(nc++, part);
      }
    });
    for (const m of [trunks, crowns, firs]) m.instanceMatrix.needsUpdate = true;
  };

  // Tot ce se mișcă: oamenii, animalele, uneltele, scrisorile.
  const kitMat = new MeshLambertMaterial({ flatShading: true });
  const kit = new Kit(kitMat, [1400, 520, 90, 160, 60]);
  for (const m of kit.meshes) island.add(m);
  const pen = new Pen(kit);
  const village = new Village(world.benches);

  // Afișele, nelucioase ca hârtia tipărită: culorile riscului rămân exacte.
  const noticeMat = new MeshBasicMaterial();
  const noticeKit = new Kit(noticeMat, [420, 80, 1, 1, 1], false);
  for (const m of noticeKit.meshes) island.add(m);
  const noticePen = new Pen(noticeKit);

  const smoke = new Smoke(world.chimneys);
  smoke.mesh.receiveShadow = false;
  island.add(smoke.mesh);
  const bubbles = new Bubbles();
  island.add(bubbles.group);
  const beam = new Beam();
  island.add(beam.cone, beam.sweep);
  const lights = new NightLights(world.glows, BOARD_LAMP, POND);
  island.add(lights.group);
  scene.add(lights.starField);
  const shadow = floatShadow();
  shadow.mesh.position.set(0.6, -6.5, 1.2);
  scene.add(shadow.mesh);

  const hemi = new HemisphereLight();
  scene.add(hemi);
  const sun = new DirectionalLight();
  sun.castShadow = true;
  // Pe telefoane, o hartă de umbre mai mică: umbrele rămân moi, cadrul mai ieftin.
  const shadowSize = window.matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const spot = new SpotLight(MAT.lamp, 0, 22, 0.24, 0.65, 0);
  const spotTarget = new Object3D();
  island.add(spot, spotTarget);
  spot.target = spotTarget;
  const boardLight = new PointLight(MAT.lamp, 0, 6, 1);
  boardLight.position.copy(BOARD_LAMP);
  island.add(boardLight);

  // Stare.
  let notices: NoticeSlot[] = [];
  let noticeW = 0.4;
  let noticeH = 0.5;
  let activeId = opts.activeId;
  let reduced = opts.reducedMotion || !!opts.poster;
  let visible = false;
  let disposed = false;
  let firstFrame = false;
  let tokens: Tokens = readTokens(resolvedTheme() === 'dark');
  let night = tokens.dark ? 1 : 0;
  let nightTarget = night;
  let clock = 0;
  let pickedAt = -9;
  let last = 0;
  let cssW = 1;
  let cssH = 1;
  let radius = 60;
  const target = new Vector3(0, 1.6, 0.6);
  let rects = new Float32Array(0);
  const statMs: number[] = [];

  village.newspaper = opts.newspaper;
  bubbles.paint(tokens);

  const layout = (list: Notice[]) => {
    const { rows, cols } = boardGrid(list.length);
    const iw = BOARD.w - 0.34;
    const ih = BOARD.h - 0.3;
    const cw = iw / cols;
    const ch = ih / rows;
    noticeW = Math.min(cw * 0.8, ch * 0.7);
    noticeH = Math.min(ch * 0.84, noticeW * 1.3);
    notices = list.map((n, i) => ({
      id: n.id,
      level: n.level,
      x: BOARD.x - iw / 2 + cw * ((i % cols) + 0.5),
      y: BOARD.y + ih / 2 - ch * (Math.floor(i / cols) + 0.5),
      z: BOARD.z + 0.085,
    }));
    rects = new Float32Array(list.length * 4);
    village.levels = list.map((n) => n.level);
  };
  layout(opts.notices);

  const lift = (i: number) => (notices[i]?.id === activeId ? 1 : 0);
  // Afișul ales sare puțin în față când e ales; cele cu risc ridicat pulsează discret.
  const pop = () => (reduced ? 0 : Math.max(0, 1 - (clock - pickedAt) / POP_S) ** 2 * 0.35);
  const noticeScale = (n: NoticeSlot, on: number) =>
    1 + on * (0.24 + pop()) + (n.level === 'red' && !reduced ? Math.max(0, Math.sin(clock * 3 + n.x)) * 0.07 : 0);

  const drawNotices = () => {
    noticeKit.begin();
    if (!opts.poster) {
      notices.forEach((n, i) => {
        const on = lift(i);
        const s = noticeScale(n, on);
        const col = tokens.risk[n.level];
        noticePen.reset().move(n.x, n.y, n.z + on * 0.14).scale(s);
        if (on) {
          const breathe = reduced ? 0.05 : 0.04 + Math.sin(clock * 4) * 0.035;
          noticePen.at(BOX, 0, 0, -0.012, noticeW + 0.09 + breathe * 2, noticeH + 0.09 + breathe * 2, 0.02, C.paper);
        }
        noticePen.put(BOX, noticeW, noticeH, 0.03, col);
        const w = noticeW;
        const h = noticeH;
        noticePen.at(BOX, 0, h * 0.1, 0.018, w * 0.64, h * 0.08, 0.01, C.paper);
        noticePen.at(BOX, 0, -h * 0.08, 0.018, w * 0.64, h * 0.05, 0.01, C.paper);
        noticePen.at(BOX, -w * 0.11, -h * 0.24, 0.018, w * 0.42, h * 0.05, 0.01, C.paper);
        noticePen.at(BALL, 0, h * 0.4, 0.02, 0.07, 0.07, 0.04, on ? C.navy : C.paper);
      });
    }
    noticeKit.end();
  };

  const applyNight = (n: number) => {
    hemi.color.copy(DAY.sky).lerp(NIGHT.sky, n);
    hemi.groundColor.copy(DAY.ground).lerp(NIGHT.ground, n);
    hemi.intensity = DAY.hemi + (NIGHT.hemi - DAY.hemi) * n;
    sun.color.copy(DAY.sun).lerp(NIGHT.sun, n);
    sun.intensity = DAY.sunI + (NIGHT.sunI - DAY.sunI) * n;
    sun.shadow.intensity = DAY.shadow + (NIGHT.shadow - DAY.shadow) * n;
    sun.position.copy(DAY.sunPos).lerp(NIGHT.sunPos, n).add(target);
    sun.target.position.copy(target);
    paneMat.emissiveIntensity = n * 1.05;
    paneMat.color.set(MAT.pane).lerp(C.lamp, n * 0.4);
    spot.intensity = n * 2.8;
    boardLight.intensity = n * 1.6;
    noticeMat.color.setScalar(1 - n * 0.12);
    shadow.mat.opacity = 0.22 + n * 0.25;
  };

  const orbit = (az: number) => {
    camera.position.set(Math.sin(az) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(az) * Math.cos(ELEVATION)).multiplyScalar(radius).add(target);
    camera.lookAt(target);
  };

  // Punctele care trebuie să încapă în cadru: conturul insulei sus și jos, vârful turnului.
  const framePts: Vector3[] = [
    ...islandOutline(1, 7, 24).map(([x, z]) => new Vector3(x, 0.2, z)),
    ...islandOutline(0.93, 7, 24).map(([x, z]) => new Vector3(x, -2.6, z)),
    new Vector3(TOWER.x, FLAG_TOP.y + 0.3, TOWER.z),
  ];
  const fit = () => {
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    const v = new Vector3();
    for (let pass = 0; pass < 3; pass++) {
      let lo = 20;
      let hi = 160;
      for (let it = 0; it < 22; it++) {
        radius = (lo + hi) / 2;
        let ok = true;
        let minY = 9;
        let maxY = -9;
        for (const az of [AZ0 - ORBIT, AZ0, AZ0 + ORBIT]) {
          orbit(az);
          camera.updateMatrixWorld();
          for (const p of framePts) {
            v.copy(p).project(camera);
            if (Math.abs(v.x) > 0.97 || Math.abs(v.y) > 0.95) ok = false;
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
          }
        }
        if (ok) hi = radius;
        else lo = radius;
        if (it === 21 && pass < 2) {
          // Centrează pe verticală: mută ținta pe direcția „sus” a camerei.
          const mid = (minY + maxY) / 2;
          target.y += mid * radius * Math.tan((FOV * Math.PI) / 360) * 0.9;
        }
      }
      radius = hi;
    }
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
    renderer.setSize(cssW, cssH, false);
    fit();
  };

  const v = new Vector3();
  const project = () => {
    island.updateMatrixWorld();
    notices.forEach((n, i) => {
      const s = noticeScale(n, lift(i));
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        v.set(n.x + (dx * noticeW * s) / 2, n.y + (dy * noticeH * s) / 2, n.z).applyMatrix4(island.matrixWorld).project(camera);
        const px = ((v.x + 1) / 2) * cssW;
        const py = ((1 - v.y) / 2) * cssH;
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
      rects[i * 4] = (x0 + x1) / 2;
      rects[i * 4 + 1] = (y0 + y1) / 2;
      rects[i * 4 + 2] = x1 - x0;
      rects[i * 4 + 3] = y1 - y0;
    });
    opts.onProject(rects);
  };

  const step = (dt: number) => {
    clock += dt;
    village.update(dt);
    if (night !== nightTarget) {
      const d = reduced ? 1 : dt / THEME_FADE;
      night = nightTarget > night ? Math.min(nightTarget, night + d) : Math.max(nightTarget, night - d);
      applyNight(night);
    }
  };

  const compose = () => {
    const t = clock;
    const az = AZ0 + (reduced ? 0.1 : Math.sin((t / ORBIT_PERIOD) * Math.PI * 2) * ORBIT);
    orbit(opts.poster ? AZ0 : az);
    const bob = reduced ? 0 : Math.sin(t * 0.7) * 0.12;
    island.position.y = bob;
    shadow.mesh.scale.setScalar(1 - bob * 0.25);
    placeTrees(reduced ? 0 : t);
    kit.begin();
    village.draw(pen, night);
    drawFlag(pen, t);
    kit.end();
    drawNotices();
    smoke.update(reduced ? 0.4 : t);
    bubbles.update(village.bubbles);
    lights.update(night, t, village.lantern);
    beam.update(night, village.lantern, village.guardYaw, village.beamPitch);
    spot.position.copy(village.lantern);
    const yaw = village.guardYaw;
    const pitch = village.beamPitch;
    spotTarget.position.set(
      village.lantern.x + Math.sin(yaw) * Math.cos(pitch) * 8,
      village.lantern.y - Math.sin(pitch) * 8,
      village.lantern.z + Math.cos(yaw) * Math.cos(pitch) * 8,
    );
  };

  const render = () => {
    const t0 = performance.now();
    compose();
    renderer.render(scene, camera);
    if (bench) {
      const px = new Uint8Array(4);
      const gl = renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    project();
    const ms = performance.now() - t0;
    statMs.push(ms);
    if (statMs.length >= 60) {
      canvas.dataset.frameMs = (statMs.reduce((a, b) => a + b, 0) / statMs.length).toFixed(2);
      canvas.dataset.calls = String(renderer.info.render.calls);
      canvas.dataset.tris = String(renderer.info.render.triangles);
      statMs.length = 0;
    }
    if (!firstFrame) {
      firstFrame = true;
      canvas.dataset.calls = String(renderer.info.render.calls);
      opts.onFirstFrame();
    }
  };

  const frame = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    render();
  };

  const playing = () => visible && !reduced && !disposed && !record;
  const sync = () => {
    last = 0;
    renderer.setAnimationLoop(playing() ? frame : null);
    if (!playing() && !disposed) render();
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
    opts.onContextLost();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  const onStep = (e: Event) => {
    if (!(e instanceof CustomEvent) || typeof e.detail !== 'number') return;
    step(e.detail);
    render();
  };
  if (record) window.addEventListener('sat-step', onStep);
  const ro = new ResizeObserver(() => {
    resize();
    if (!playing()) render();
  });
  ro.observe(canvas);

  applyNight(night);
  resize();
  if (reduced) clock = village.settle(STILL_AT);
  render();

  return {
    setNotices(list, newspaper) {
      layout(list);
      village.newspaper = newspaper;
      if (!playing()) render();
    },
    setActive(id, fromUser) {
      if (id !== activeId) pickedAt = clock;
      activeId = id;
      const n = notices.find((x) => x.id === id);
      if (n && fromUser && !reduced) village.focus(n.x, n.y, n.z);
      if (!playing()) render();
    },
    setTheme() {
      tokens = readTokens(resolvedTheme() === 'dark');
      bubbles.paint(tokens);
      nightTarget = tokens.dark ? 1 : 0;
      if (!playing()) {
        night = nightTarget;
        applyNight(night);
        render();
      }
    },
    setVisible(on) {
      visible = on;
      sync();
    },
    setReducedMotion(on) {
      reduced = on || !!opts.poster;
      if (reduced) {
        night = nightTarget;
        applyNight(night);
      }
      sync();
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      window.removeEventListener('sat-step', onStep);
      const mats = new Set<Material>();
      scene.traverse((o) => {
        if (o instanceof Mesh || o instanceof Points || o instanceof InstancedMesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
        } else if (o instanceof Sprite) {
          mats.add(o.material);
        }
        if (o instanceof InstancedMesh) o.dispose();
      });
      for (const m of mats) m.dispose();
      bubbles.dispose();
      lights.dispose();
      smoke.dispose();
      beam.dispose();
      kit.dispose();
      noticeKit.dispose();
      shadow.tex.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}

/** Fanionul alb din vârful turnului, fluturând. */
function drawFlag(pen: Pen, t: number) {
  pen.reset().move(FLAG_TOP.x, FLAG_TOP.y - 0.2, FLAG_TOP.z);
  for (let i = 0; i < 4; i++) {
    const a = Math.sin(t * 3.2 - i * 0.9) * 0.28 * (i + 1) * 0.35;
    pen.ry(a).at(BOX, 0.16, 0, 0, 0.32, 0.36 - i * 0.07, 0.025, C.paper).move(0.3, 0, 0);
  }
}
