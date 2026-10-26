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
} from './three';
import { resolvedTheme } from '@/lib/theme';
import type { RiskLevel } from '@/lib/types';
import { boardGrid, type Notice, type SceneOptions, type VillageScene } from '../types';
import { BALL, BOX, Kit, Pen } from './kit';
import { C, MAT, readTokens, type Tokens } from './palette';
import { Beam, Blobs, Bubbles, floatShadow, Glint, NightLights, Smoke } from './fx';
import { Village } from './people';
import { BOARD, BOARD_LAMP, buildWorld, FLAG_TOP, islandOutline, POND, TOWER, TREES, treeGeometries } from './world';

const DEG = Math.PI / 180;
const FOV = 24;
const ELEVATION = 37 * DEG;
/** Unghiul de bază: puțin din stânga, ca turnul să nu stea în spatele avizierului. */
const AZ0 = -6 * DEG;
const THEME_FADE = 0.7;
const POP_S = 0.45;
const MAX_DPR = 2;
const LOW_DPR = 1.5;
/** De unde începem să căutăm cadrul de pornire: satul a pornit deja de-a binelea (la fel ca posterul). */
const STILL_AT = 24;

/** O tragere pe toată lățimea scenei rotește satul cu o jumătate de tură. */
const DRAG_TURN = Math.PI;
const DRAG_START_PX = 6;
const INERTIA_DECAY = 5.5;
const MAX_SPIN = 7;
/** Peste atât, tabla e prea întoarsă ca să citești afișele: la o alegere, camera revine spre ea. */
const FACE_LIMIT = 60 * DEG;
const RETURN_S = 0.8;
const ZOOM_S = 0.6;
const ZOOM_ELEVATION = 11 * DEG;

/** Adaptarea calității: primele cadre arată dacă dispozitivul ține pasul. */
const PROBE_FRAMES = 90;
const SLOW_FRAME_MS = 12;
const SLOW_GAP_MS = 24;
const LOW_FPS_MS = 1000 / 30;

const DAY = {
  sky: new Color('#ffffff'),
  ground: new Color('#d9d1c0'),
  sun: new Color('#fff7ea'),
  hemi: 1.2,
  sunI: 2.5,
  shadow: 0.6,
  spot: 1.5,
  sunPos: new Vector3(-9, 16, 9),
};
const NIGHT = {
  sky: new Color('#93a3cc'),
  ground: new Color('#222a3b'),
  sun: new Color('#b4c2ec'),
  hemi: 0.8,
  sunI: 1.0,
  shadow: 0.75,
  spot: 2.8,
  sunPos: new Vector3(8, 15, -4),
};

type NoticeSlot = { x: number; y: number; z: number; level: RiskLevel; id: string };
type NavigatorHints = Navigator & { deviceMemory?: number };

const easeInOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Obiectele care nu se mișcă: matricea se calculează o singură dată. */
function freeze(...objs: Object3D[]) {
  for (const o of objs) {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  }
}

export function createVillageScene(canvas: HTMLCanvasElement, opts: SceneOptions): VillageScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // Lumina stă pe loc față de sat: harta de umbre se desenează o dată (și la schimbarea temei), nu la fiecare cadru.
  renderer.shadowMap.autoUpdate = false;
  // Unelte de verificare: #sat-bench măsoară cadrul cu tot cu GPU, #sat-record avansează cadru cu cadru (pentru video).
  const bench = location.hash.includes('sat-bench');
  const record = location.hash.includes('sat-record');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const nav = navigator as NavigatorHints;
  let low = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || (coarse && window.devicePixelRatio >= 3);

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

  // Copacii: instanțe care se leagănă ușor (umbra lor rămâne cea din poziția de repaus).
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

  // Tot ce se mișcă: oamenii, animalele, uneltele, scrisorile. Nu aruncă umbre calculate, au umbre moi dedesubt.
  const kitMat = new MeshLambertMaterial({ flatShading: true });
  const kit = new Kit(kitMat, [1400, 520, 90, 160, 60], false);
  for (const m of kit.meshes) {
    m.receiveShadow = true;
    island.add(m);
  }
  const pen = new Pen(kit);
  const village = new Village(world.benches);

  // Afișele, nelucioase ca hârtia tipărită: culorile riscului rămân exacte.
  const noticeMat = new MeshBasicMaterial();
  const noticeKit = new Kit(noticeMat, [420, 80, 1, 1, 1], false);
  for (const m of noticeKit.meshes) island.add(m);
  const noticePen = new Pen(noticeKit);

  const smoke = new Smoke(world.chimneys);
  island.add(smoke.mesh);
  const blobs = new Blobs();
  island.add(blobs.mesh);
  const bubbles = new Bubbles();
  island.add(bubbles.group);
  const beam = new Beam();
  island.add(beam.cone, beam.sweep);
  const glint = new Glint();
  island.add(glint.points);
  const lights = new NightLights(world.glows, BOARD_LAMP, POND);
  island.add(lights.group);
  scene.add(lights.starField);
  const shadow = floatShadow();
  shadow.mesh.position.set(0.6, -6.5, 1.2);
  scene.add(shadow.mesh);
  freeze(island, solid, panes, trunks, crowns, firs, ...kit.meshes, ...noticeKit.meshes, smoke.mesh, blobs.mesh, glint.points, lights.group, ...lights.group.children, lights.starField, shadow.mesh);

  const hemi = new HemisphereLight();
  scene.add(hemi);
  const sun = new DirectionalLight();
  sun.castShadow = true;
  const shadowSize = coarse ? 1024 : 2048;
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
  let shadowDirty = true;
  let clock = 0;
  let pickedAt = -9;
  let last = 0;
  let cssW = 1;
  let cssH = 1;
  let rects = new Float32Array(0);
  const statMs: number[] = [];
  const probe: { cpu: number; gap: number }[] = [];

  // Camera: unghiul îl hotărăște cine privește; fără rotire automată.
  let az = AZ0;
  let spin = 0;
  let dragging = false;
  let pendingDrag = 0;
  let dragVel = 0;
  let azTween: { from: number; to: number; t: number } | null = null;
  let zoom = 0;
  let zoomFrom = 0;
  let zoomTo = 0;
  let zoomT = 1;
  // Încadrarea satului pentru fiecare unghi (la fiecare 10°): la rotire camera se apropie sau se depărtează lin.
  const FIT_STEPS = 36;
  const fitR = new Float32Array(FIT_STEPS).fill(60);
  const fitY = new Float32Array(FIT_STEPS).fill(1.6);
  const villageTarget = new Vector3(0, 1.6, 0.6);
  const sampleFit = (a: number) => {
    const u = ((((a - AZ0) / (Math.PI * 2)) % 1) + 1) % 1 * FIT_STEPS;
    const i = Math.floor(u) % FIT_STEPS;
    const k = u - Math.floor(u);
    const j = (i + 1) % FIT_STEPS;
    villageTarget.y = lerp(fitY[i], fitY[j], k);
    return lerp(fitR[i], fitR[j], k);
  };
  let boardRadius = 12;
  const boardTarget = new Vector3(BOARD.x, BOARD.y - 0.05, BOARD.z);
  const camTarget = new Vector3();

  village.newspaper = opts.newspaper;
  bubbles.paint(tokens);

  const layout = (list: Notice[]) => {
    const { rows, cols } = boardGrid(list.length);
    const iw = BOARD.w - 0.3;
    const ih = BOARD.h - 0.26;
    const cw = iw / cols;
    const ch = ih / rows;
    noticeW = Math.min(cw * 0.82, ch * 0.95);
    noticeH = Math.min(ch * 0.84, noticeW * 1.35);
    notices = list.map((n, i) => ({
      id: n.id,
      level: n.level,
      x: BOARD.x - iw / 2 + cw * ((i % cols) + 0.5),
      y: BOARD.y + ih / 2 - ch * (Math.floor(i / cols) + 0.5),
      z: BOARD.z + 0.085,
    }));
    rects = new Float32Array((list.length + 1) * 4);
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
        noticePen.reset().move(n.x, n.y, n.z + on * 0.12).scale(s);
        if (on) {
          const breathe = reduced ? 0.04 : 0.035 + Math.sin(clock * 4) * 0.03;
          noticePen.at(BOX, 0, 0, -0.012, noticeW + 0.08 + breathe * 2, noticeH + 0.08 + breathe * 2, 0.02, C.paper);
        }
        noticePen.put(BOX, noticeW, noticeH, 0.03, col);
        const w = noticeW;
        const h = noticeH;
        noticePen.at(BOX, 0, h * 0.1, 0.018, w * 0.64, h * 0.08, 0.01, C.paper);
        noticePen.at(BOX, 0, -h * 0.08, 0.018, w * 0.64, h * 0.05, 0.01, C.paper);
        noticePen.at(BOX, -w * 0.11, -h * 0.24, 0.018, w * 0.42, h * 0.05, 0.01, C.paper);
        noticePen.at(BALL, 0, h * 0.4, 0.02, 0.06, 0.06, 0.035, on ? C.navy : C.paper);
      });
    }
    noticeKit.end();
  };

  const applyNight = (n: number) => {
    hemi.color.copy(DAY.sky).lerp(NIGHT.sky, n);
    hemi.groundColor.copy(DAY.ground).lerp(NIGHT.ground, n);
    hemi.intensity = lerp(DAY.hemi, NIGHT.hemi, n);
    sun.color.copy(DAY.sun).lerp(NIGHT.sun, n);
    sun.intensity = lerp(DAY.sunI, NIGHT.sunI, n);
    sun.shadow.intensity = lerp(DAY.shadow, NIGHT.shadow, n);
    sun.position.copy(DAY.sunPos).lerp(NIGHT.sunPos, n).add(villageTarget);
    sun.target.position.copy(villageTarget);
    paneMat.emissiveIntensity = n * 1.05;
    paneMat.color.set(MAT.pane).lerp(C.lamp, n * 0.4);
    spot.intensity = lerp(DAY.spot, NIGHT.spot, n);
    boardLight.intensity = n * 1.6;
    noticeMat.color.setScalar(1 - n * 0.12);
    shadow.mat.opacity = 0.22 + n * 0.25;
    shadowDirty = true;
  };

  const place = (azimuth: number, target: Vector3, radius: number, elevation: number) => {
    camera.position
      .set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
      .multiplyScalar(radius)
      .add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };

  // Ce trebuie să încapă în cadru la orice unghi: conturul insulei sus și jos, vârful turnului.
  const framePts: Vector3[] = [
    ...islandOutline(1, 7, 24).map(([x, z]) => new Vector3(x, 0.2, z)),
    ...islandOutline(0.93, 7, 24).map(([x, z]) => new Vector3(x, -2.6, z)),
    new Vector3(TOWER.x, FLAG_TOP.y + 0.3, TOWER.z),
  ];
  const boardPts: Vector3[] = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => new Vector3(BOARD.x + sx * (BOARD.w / 2 + 0.3), BOARD.y + sy * (BOARD.h / 2 + 0.3), BOARD.z)),
  );
  const fitRadius = (pts: Vector3[], azs: number[], target: Vector3, elevation: number, limX: number, limY: number, center: boolean) => {
    const v = new Vector3();
    let radius = 60;
    for (let pass = 0; pass < (center ? 3 : 1); pass++) {
      let lo = 4;
      let hi = 200;
      let minY = 9;
      let maxY = -9;
      for (let it = 0; it < 24; it++) {
        radius = (lo + hi) / 2;
        let ok = true;
        minY = 9;
        maxY = -9;
        for (const a of azs) {
          place(a, target, radius, elevation);
          for (const p of pts) {
            v.copy(p).project(camera);
            if (Math.abs(v.x) > limX || Math.abs(v.y) > limY) ok = false;
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
          }
        }
        if (ok) hi = radius;
        else lo = radius;
      }
      radius = hi;
      // Centrează pe verticală: mută ținta pe direcția „sus” a camerei.
      if (center) target.y += ((minY + maxY) / 2) * radius * Math.tan((FOV * DEG) / 2) * 0.9;
    }
    return radius;
  };
  const fit = () => {
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    for (let i = 0; i < FIT_STEPS; i++) {
      const a = AZ0 + (i / FIT_STEPS) * Math.PI * 2;
      villageTarget.y = 1.6;
      // Fiecare unghi și vecinii lui, ca interpolarea dintre eșantioane să nu taie marginile.
      fitR[i] = fitRadius(framePts, [a - 0.09, a, a + 0.09], villageTarget, ELEVATION, 0.96, 0.95, true);
      fitY[i] = villageTarget.y;
    }
    boardRadius = fitRadius(boardPts, [0], boardTarget, ZOOM_ELEVATION, 0.95, 0.8, false);
  };

  const pixelRatio = () => Math.min(low ? LOW_DPR : MAX_DPR, window.devicePixelRatio || 1);
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(cssW, cssH, false);
    fit();
    canvas.dataset.quality = low ? 'low' : 'high';
  };

  const v = new Vector3();
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const projectRect = (i: number, x: number, y: number, z: number, w: number, h: number) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [dx, dy] of corners) {
      v.set(x + (dx * w) / 2, y + (dy * h) / 2, z).applyMatrix4(island.matrixWorld).project(camera);
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
  };
  const project = () => {
    notices.forEach((n, i) => {
      const s = noticeScale(n, lift(i));
      projectRect(i, n.x, n.y, n.z, noticeW * s, noticeH * s);
    });
    const b = notices.length;
    projectRect(b, BOARD.x, BOARD.y, BOARD.z + 0.07, BOARD.w, BOARD.h);
    // Tabla se vede din față doar cât camera nu e în spatele ei.
    const facing = Math.cos(az) > 0.12;
    opts.onProject(rects, facing);
    if (opts.poster) {
      canvas.dataset.board = [
        ((rects[b * 4] - rects[b * 4 + 2] / 2) / cssW) * 100,
        ((rects[b * 4 + 1] - rects[b * 4 + 3] / 2) / cssH) * 100,
        (rects[b * 4 + 2] / cssW) * 100,
        (rects[b * 4 + 3] / cssH) * 100,
      ]
        .map((n) => n.toFixed(2))
        .join(',');
    }
  };

  const step = (dt: number) => {
    clock += dt;
    village.update(dt);
    if (dragging) {
      if (dt > 0) dragVel = lerp(dragVel, pendingDrag / dt, 0.5);
      az += pendingDrag;
      pendingDrag = 0;
    } else if (spin) {
      az += spin * dt;
      spin *= Math.exp(-INERTIA_DECAY * dt);
      if (Math.abs(spin) < 0.02) spin = 0;
    }
    if (azTween) {
      azTween.t = Math.min(1, azTween.t + dt / RETURN_S);
      az = lerp(azTween.from, azTween.to, easeInOut(azTween.t));
      if (azTween.t >= 1) azTween = null;
    }
    if (zoomT < 1) {
      zoomT = Math.min(1, zoomT + dt / ZOOM_S);
      zoom = lerp(zoomFrom, zoomTo, easeInOut(zoomT));
    }
    if (night !== nightTarget) {
      const d = reduced ? 1 : dt / THEME_FADE;
      night = nightTarget > night ? Math.min(nightTarget, night + d) : Math.max(nightTarget, night - d);
      applyNight(night);
    }
  };

  const compose = () => {
    const t = clock;
    const a = opts.poster ? AZ0 : az;
    const villageRadius = sampleFit(a);
    camTarget.copy(villageTarget).lerp(boardTarget, zoom);
    place(a, camTarget, lerp(villageRadius, boardRadius, zoom), lerp(ELEVATION, ZOOM_ELEVATION, zoom));
    placeTrees(t);
    kit.begin();
    village.draw(pen, night);
    drawFlag(pen, t);
    kit.end();
    drawNotices();
    smoke.update(t);
    blobs.update(village.blobs, night);
    bubbles.update(village.bubbles);
    lights.update(night, t, village.lantern);
    beam.update(night, village.lantern, village.guardYaw, village.beamPitch);
    glint.update(village.glint, Math.cos(village.guardYaw - az), night);
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
    if (shadowDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowDirty = false;
    }
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
    return ms;
  };

  let raf = 0;
  const requestRender = () => {
    if (raf || disposed) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      render();
    });
  };

  const frame = (now: number) => {
    const gap = last ? now - last : 1000 / 60;
    // Pe dispozitivele slabe desenăm la 30 de cadre pe secundă.
    if (low && last && gap < LOW_FPS_MS - 3) return;
    last = now;
    step(Math.min(0.05, gap / 1000));
    const cpu = render();
    if (!low && probe.length < PROBE_FRAMES) {
      probe.push({ cpu, gap });
      if (probe.length === PROBE_FRAMES) {
        const tail = probe.slice(10);
        const avg = (k: 'cpu' | 'gap') => tail.reduce((a, p) => a + p[k], 0) / tail.length;
        if (avg('cpu') > SLOW_FRAME_MS || avg('gap') > SLOW_GAP_MS) {
          low = true;
          resize();
        }
      }
    }
  };

  const animated = () => visible && !reduced && !disposed;
  const playing = () => animated() && !record;
  const sync = () => {
    last = 0;
    renderer.setAnimationLoop(playing() ? frame : null);
    if (!playing() && !disposed) render();
  };

  // Rotirea cu mâna: orizontal rotește satul, vertical rămâne derularea paginii.
  const surface = opts.surface;
  let track: { id: number; x: number; y: number; lastX: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary || zoomTo === 1 || opts.poster || (e.pointerType === 'mouse' && e.button !== 0)) return;
    track = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX };
  };
  const onMove = (e: PointerEvent) => {
    if (!track || e.pointerId !== track.id) return;
    if (!dragging) {
      const dx = e.clientX - track.x;
      const dy = e.clientY - track.y;
      if (Math.abs(dx) < DRAG_START_PX && Math.abs(dy) < DRAG_START_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        track = null;
        return;
      }
      dragging = true;
      spin = 0;
      azTween = null;
      dragVel = 0;
      try {
        surface.setPointerCapture(e.pointerId);
      } catch {
        // Fără captură, tragerea merge cât timp degetul rămâne pe scenă.
      }
      surface.dataset.dragging = '';
      opts.onRotate();
    }
    const turn = -((e.clientX - track.lastX) / cssW) * DRAG_TURN;
    track.lastX = e.clientX;
    if (animated() || record) pendingDrag += turn;
    else {
      az += turn;
      requestRender();
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!track || e.pointerId !== track.id) return;
    if (dragging) {
      dragging = false;
      delete surface.dataset.dragging;
      az += pendingDrag;
      pendingDrag = 0;
      spin = reduced || e.type === 'pointercancel' ? 0 : Math.max(-MAX_SPIN, Math.min(MAX_SPIN, dragVel));
    }
    track = null;
  };
  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onUp);

  /** Întoarce camera spre un unghi, pe drumul cel mai scurt. */
  const turnTo = (target: number) => {
    const to = az + wrap(target - az);
    spin = 0;
    if (reduced || !animated()) {
      az = to;
      azTween = null;
    } else azTween = { from: az, to, t: 0 };
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
  // #sat-bench: n cadre desenate unul după altul, cu o singură sincronizare la final = cât costă un cadru, cu tot cu GPU.
  const onBurst = (e: Event) => {
    if (!(e instanceof CustomEvent) || typeof e.detail !== 'number') return;
    const px = new Uint8Array(4);
    const gl = renderer.getContext();
    const t0 = performance.now();
    for (let i = 0; i < e.detail; i++) {
      step(1 / 60);
      compose();
      renderer.render(scene, camera);
    }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    canvas.dataset.burstMs = ((performance.now() - t0) / e.detail).toFixed(3);
  };
  if (bench) window.addEventListener('sat-burst', onBurst);
  const ro = new ResizeObserver(() => {
    resize();
    if (!playing()) render();
  });
  ro.observe(canvas);

  applyNight(night);
  resize();
  // Pornim din același moment ca posterul, ca trecerea de la poster la scena vie să nu se vadă.
  clock = village.settle(STILL_AT);
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
      if (n && fromUser) {
        if (!reduced) village.focus(n.x, n.y, n.z);
        if (Math.abs(wrap(az)) > FACE_LIMIT && zoomTo === 0) turnTo(AZ0);
      }
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
      spin = 0;
      if (reduced) {
        night = nightTarget;
        applyNight(night);
      }
      sync();
    },
    setZoom(on) {
      const to = on ? 1 : 0;
      if (to === zoomTo) return;
      zoomFrom = zoom;
      zoomTo = to;
      turnTo(on ? 0 : AZ0);
      if (reduced || !animated()) {
        zoom = to;
        zoomT = 1;
      } else zoomT = 0;
      opts.onZoom(on);
      if (!playing()) render();
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      window.removeEventListener('sat-step', onStep);
      window.removeEventListener('sat-burst', onBurst);
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onUp);
      delete surface.dataset.dragging;
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
      blobs.dispose();
      glint.dispose();
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
