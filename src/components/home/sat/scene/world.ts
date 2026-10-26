import {
  CircleGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Vector3,
  type ColorRepresentation,
} from './three';
import { Builder, frustum, gableRoof, hipRoof, prism, seeded, xf } from './geo';
import { MAT } from './palette';

export type V2 = [number, number];

/* Harta satului, în unități de machetă (un om are cam 1). x spre dreapta, z spre privitor. */
export const ISLAND = { a: 11.8, b: 9.8, p: 2.6 };
export const TOWER = { x: -4.5, z: -2.2, legBase: 1.15, legTop: 0.78, deck: 6.3, booth: 1.5, roof: 8.55 };
/** Avizierul: mai mic decât un perete de casă, ridicat pe stâlpi ca oamenii din fața lui să nu acopere afișele. */
export const BOARD = { x: 1.3, z: 2.0, w: 5.1, h: 2.0, y: 2.75 };
export const SQUARE = { x: 0.7, z: 2.3, r: 4.5 };
export const MAILBOX = { x: 6.3, z: 3.1, slotY: 1.05 };
export const WELL = { x: -4.6, z: 4.6, r: 0.55, pivotY: 2.6, arm: 2.45, rope: 1.55 };
export const SENATE: V2 = [13.8, 6.4];

type House = { x: number; z: number; r: number; w: number; d: number; hip: boolean; roof: string; door: string; gableFront?: boolean };

export const HOUSES: House[] = [
  { x: -7.9, z: -4.8, r: 0.5, w: 2.8, d: 1.8, hip: true, roof: MAT.navy, door: MAT.navy },
  { x: -1.8, z: -7.0, r: 0.08, w: 2.6, d: 2.0, hip: false, roof: MAT.slate, door: MAT.navy, gableFront: true },
  { x: 3.6, z: -6.8, r: -0.12, w: 2.8, d: 1.8, hip: true, roof: MAT.navy, door: MAT.ink },
  { x: 8.0, z: -4.2, r: -0.55, w: 2.4, d: 1.9, hip: false, roof: MAT.navy, door: MAT.navy, gableFront: true },
  { x: -9.2, z: 0.9, r: 1.4, w: 2.8, d: 1.8, hip: true, roof: MAT.slate, door: MAT.navy },
  { x: 9.3, z: 0.6, r: -1.4, w: 2.8, d: 1.8, hip: true, roof: MAT.navy, door: MAT.ink },
  { x: -6.6, z: 6.4, r: 0.2, w: 2.9, d: 1.8, hip: true, roof: MAT.navy, door: MAT.navy },
  { x: 6.8, z: 6.4, r: -0.2, w: 2.8, d: 1.8, hip: true, roof: MAT.slate, door: MAT.navy },
];
const WALL_H = 1.3;
const PORCH = 0.7;
const ROOF_H = 1.55;

export const GARDENS = [
  { x: -8.9, z: -1.8, w: 2.4, d: 1.4, r: 0.05 },
  { x: 8.4, z: -1.9, w: 2.4, d: 1.2, r: -0.05 },
  { x: 0.9, z: -7.0, w: 1.8, d: 1.4, r: 0 },
];

export const POND = { x: -2.4, z: 7.3, rx: 1.5, rz: 0.88 };
export const KIDS_TREE: V2 = [3.6, 6.3];
export const HAYSTACKS: V2[] = [
  [9.7, 3.0],
  [10.6, 3.8],
  [10.7, 2.3],
];
export const BLOCK: V2 = [-6.6, -1.5];

export type TreeSpec = { x: number; z: number; fir: boolean; s: number; tone: number };
export const TREES: TreeSpec[] = [
  { x: -10.2, z: -3.4, fir: false, s: 1.05, tone: 0 },
  { x: -5.2, z: -7.6, fir: true, s: 1.0, tone: 0 },
  { x: -4.0, z: -8.6, fir: false, s: 0.8, tone: 1 },
  { x: 1.0, z: -8.9, fir: true, s: 1.1, tone: 1 },
  { x: 6.2, z: -8.0, fir: false, s: 1.05, tone: 0 },
  { x: 9.5, z: -6.3, fir: true, s: 1.1, tone: 0 },
  { x: 10.7, z: -1.9, fir: false, s: 0.9, tone: 1 },
  { x: -10.8, z: 3.2, fir: false, s: 0.9, tone: 1 },
  { x: -9.6, z: 6.0, fir: true, s: 0.95, tone: 1 },
  { x: -4.4, z: 8.9, fir: false, s: 0.8, tone: 0 },
  { x: KIDS_TREE[0], z: KIDS_TREE[1], fir: false, s: 1.2, tone: 0 },
  { x: 2.9, z: 9.0, fir: true, s: 0.8, tone: 0 },
  { x: 9.6, z: 6.0, fir: false, s: 0.95, tone: 1 },
  { x: 8.3, z: -7.4, fir: false, s: 0.8, tone: 1 },
  { x: -7.4, z: -7.2, fir: false, s: 0.85, tone: 0 },
];

const PATHS: V2[][] = [
  [[0.8, 6.4], [0.8, 10.4]],
  [[-6.0, 7.9], [-2.6, 8.75], [0.8, 8.85], [4.0, 8.75], [6.3, 7.9]],
  [[-3.4, 1.6], [-6.0, 0.1], [-7.1, -3.0]],
  [[-1.4, 0.0], [-2.4, -1.6]],
  [[-1.0, -1.0], [-1.6, -5.2]],
  [[2.6, -1.4], [3.4, -5.0]],
  [[4.9, 0.4], [7.0, -2.6]],
  [[-3.8, 2.2], [-7.4, 1.3]],
  [[5.0, 1.6], [7.5, 1.0]],
  [[4.9, 3.3], [8.0, 4.4], [11.6, 5.6]],
];
const PATH_W = 0.85;

export type WorldOut = {
  /** Satul static, culori pe vârfuri. */
  solid: Builder;
  /** Geamurile: aprinse noaptea. */
  panes: Builder;
  /** Unde strălucesc ferestrele noaptea. */
  glows: Vector3[];
  /** Vârful fiecărui coș, pentru fum. */
  chimneys: Vector3[];
  /** Băncile de pe prispă: poziția și direcția în care privește cel care stă jos. */
  benches: { x: number; z: number; yaw: number }[];
};

/** Conturul insulei: un superelipsoid puțin neregulat. */
export function islandOutline(scale: number, seed: number, n = 44): V2[] {
  const rnd = seeded(seed);
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = scale * (1 + (rnd() - 0.5) * 0.035);
    pts.push([ISLAND.a * k * Math.sign(c) * Math.abs(c) ** (2 / ISLAND.p), ISLAND.b * k * Math.sign(s) * Math.abs(s) ** (2 / ISLAND.p)]);
  }
  return pts;
}

/** Dacă un punct e pe insulă (cu o margine de siguranță). */
export function onIsland(x: number, z: number, margin = 0.6) {
  return Math.abs(x / (ISLAND.a - margin)) ** ISLAND.p + Math.abs(z / (ISLAND.b - margin)) ** ISLAND.p <= 1;
}

function slab(b: Builder, pts: V2[], top: number, depth: number, color: ColorRepresentation) {
  b.add(prism(pts, top, depth), color);
}

function island(b: Builder) {
  // Straturi de carton și balsa, ca la o machetă tăiată din plăci.
  const layers = [
    { scale: 1, depth: 0.36 },
    { scale: 0.996, depth: 0.42 },
    { scale: 0.99, depth: 0.32 },
    { scale: 0.975, depth: 0.5 },
    { scale: 0.952, depth: 0.55 },
    { scale: 0.925, depth: 0.42 },
  ];
  let top = 0;
  layers.forEach((l, i) => {
    slab(b, islandOutline(l.scale, 7 + i * 3), top, l.depth, MAT.strata[i]);
    top -= l.depth;
  });
}

function ribbon(b: Builder, pts: V2[], w: number, y: number, color: string) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    b.box(color, w, 0.04, len, xf((x1 + x2) / 2, y, (z1 + z2) / 2, Math.atan2(x2 - x1, z2 - z1)));
  }
  for (const [x, z] of pts) b.cyl(color, w / 2, w / 2, 0.04, 10, xf(x, y, z));
}

function ground(b: Builder) {
  // Piața pavată, cu un șir de dale de piatră pe margine.
  b.cyl(MAT.square, SQUARE.r, SQUARE.r, 0.05, 28, xf(SQUARE.x, 0.025, SQUARE.z));
  const slabs = 34;
  for (let i = 0; i < slabs; i++) {
    const a = (i / slabs) * Math.PI * 2;
    b.box(i % 2 ? MAT.stone : MAT.paperWarm, 0.62, 0.07, 0.3, xf(SQUARE.x + Math.cos(a) * (SQUARE.r - 0.12), 0.04, SQUARE.z + Math.sin(a) * (SQUARE.r - 0.12), -a + Math.PI / 2));
  }
  for (const p of PATHS) ribbon(b, p, PATH_W, 0.02, MAT.path);

  // Iazul, cu pietre și papură.
  const rnd = seeded(31);
  b.add(new CircleGeometry(1, 18).rotateX(-Math.PI / 2).scale(POND.rx, 1, POND.rz), MAT.water, xf(POND.x, 0.035, POND.z));
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rnd() * 0.1;
    const s = 0.12 + rnd() * 0.1;
    b.add(new IcosahedronGeometry(s, 0), i % 3 ? MAT.stone : MAT.paperWarm, xf(POND.x + Math.cos(a) * (POND.rx + 0.08), 0.04, POND.z + Math.sin(a) * (POND.rz + 0.08), rnd() * 3));
  }
  for (let i = 0; i < 9; i++) {
    const a = -0.4 + i * 0.12;
    b.cone(MAT.balsaDark, 0.04, 0.6 + rnd() * 0.35, 4, xf(POND.x + Math.cos(a) * POND.rx * 0.92, 0.3, POND.z + Math.sin(a) * POND.rz * 0.92));
  }
}

function fence(b: Builder, pts: V2[], gapAt = -1) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (i === gapAt) continue;
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / 0.55));
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      b.box(MAT.balsaDark, 0.08, 0.6, 0.08, xf(x1 + (x2 - x1) * t, 0.3, z1 + (z2 - z1) * t));
    }
    for (const y of [0.24, 0.46]) b.box(MAT.balsa, 0.04, 0.05, len, xf((x1 + x2) / 2, y, (z1 + z2) / 2, yaw));
  }
}

function gardens(b: Builder) {
  const rnd = seeded(5);
  for (const g of GARDENS) {
    const m = xf(g.x, 0, g.z, g.r);
    const local = (x: number, z: number): V2 => {
      const v = new Vector3(x, 0, z).applyMatrix4(m);
      return [v.x, v.z];
    };
    b.box(MAT.soil, g.w, 0.06, g.d, xf(0, 0.03, 0).premultiply(m));
    const rows = Math.floor(g.d / 0.32);
    for (let i = 0; i < rows; i++) {
      const z = -g.d / 2 + 0.18 + i * ((g.d - 0.36) / Math.max(1, rows - 1));
      b.box(MAT.soilDark, g.w - 0.25, 0.09, 0.13, xf(0, 0.07, z).premultiply(m));
      if (i % 2 === 0) {
        for (let x = -g.w / 2 + 0.3; x < g.w / 2 - 0.2; x += 0.34) {
          b.add(new IcosahedronGeometry(0.1 + rnd() * 0.04, 0), rnd() > 0.5 ? MAT.paper : MAT.canopyWarm, xf(x, 0.15, z, rnd() * 3).premultiply(m));
        }
      }
    }
    const hw = g.w / 2 + 0.15;
    const hd = g.d / 2 + 0.15;
    fence(b, [local(-hw, -hd), local(hw, -hd), local(hw, hd), local(-hw, hd), local(-hw, -hd)], 2);
  }
}

function house(b: Builder, panes: Builder, out: WorldOut, h: House, idx: number) {
  const m = xf(h.x, 0, h.z, h.r);
  const P = (x: number, y: number, z: number, ry = 0) => xf(x, y, z, ry).premultiply(m);
  const world = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(m);
  const hw = h.w / 2;
  const hd = h.d / 2;

  // Soclul vopsit bleumarin, pereții albi, prispa de lemn.
  b.box(MAT.navy, h.w + 0.06, 0.24, h.d + 0.06, P(0, 0.12, 0));
  b.box(MAT.paper, h.w, WALL_H, h.d, P(0, WALL_H / 2 + 0.06, 0));
  b.box(MAT.balsa, h.w + 0.1, 0.14, PORCH, P(0, 0.07, hd + PORCH / 2));
  b.box(MAT.balsaLight, 0.6, 0.07, 0.25, P(0, 0.035, hd + PORCH + 0.12));
  const posts = 4;
  for (let i = 0; i < posts; i++) {
    const x = -hw + 0.08 + (i * (h.w - 0.16)) / (posts - 1);
    b.box(MAT.balsaDark, 0.1, WALL_H, 0.1, P(x, WALL_H / 2 + 0.1, hd + PORCH - 0.08));
  }
  for (const side of [-1, 1]) b.box(MAT.balsa, h.w / 2 - 0.55, 0.06, 0.05, P(side * (hw / 2 + 0.28), 0.48, hd + PORCH - 0.08));
  // Grinda prispei și acoperișul care o cuprinde.
  b.box(MAT.balsaDark, h.w + 0.1, 0.1, 0.1, P(0, WALL_H + 0.1, hd + PORCH - 0.08));
  const roofD = h.d + PORCH + 0.5;
  const roofW = h.w + 0.5;
  if (h.hip) b.add(hipRoof(roofW, roofD, ROOF_H), h.roof, P(0, WALL_H + 0.12, PORCH / 2));
  else if (h.gableFront) {
    // Coama spre privitor: frontonul alb, cu streașina bleumarin în jur, stă deasupra prispei.
    b.add(gableRoof(roofD, roofW, ROOF_H + 0.2).rotateY(Math.PI / 2), h.roof, P(0, WALL_H + 0.12, PORCH / 2));
    for (const side of [-1, 1]) {
      b.add(gableRoof(0.03, roofW - 0.45, ROOF_H - 0.02).rotateY(Math.PI / 2), MAT.paperWarm, P(0, WALL_H + 0.2, PORCH / 2 + side * (roofD / 2 + 0.015)));
    }
  } else {
    b.add(gableRoof(roofW, roofD, ROOF_H), h.roof, P(0, WALL_H + 0.12, PORCH / 2));
    for (const side of [-1, 1]) {
      b.add(gableRoof(0.03, roofD - 0.45, ROOF_H - 0.22), MAT.paperWarm, P(side * (roofW / 2 + 0.015), WALL_H + 0.2, PORCH / 2));
    }
  }
  // Ușa și ferestrele, cu obloane bleumarin.
  b.box(h.door, 0.44, 0.88, 0.05, P(0, 0.6, hd + 0.02));
  const win = (x: number, y: number, z: number, ry: number) => {
    panes.box(MAT.pane, 0.34, 0.4, 0.04, P(x, y, z, ry));
    const dx = Math.cos(ry);
    const dz = -Math.sin(ry);
    for (const s of [-1, 1]) b.box(MAT.navy, 0.13, 0.42, 0.04, P(x + s * dx * 0.25, y, z + s * dz * 0.25, ry));
    b.box(MAT.paperWarm, 0.44, 0.06, 0.08, P(x, y - 0.24, z, ry));
    const g = world(x, y, z);
    const n = new Vector3(Math.sin(ry), 0, Math.cos(ry)).applyAxisAngle(new Vector3(0, 1, 0), h.r).multiplyScalar(0.25);
    out.glows.push(g.add(n));
  };
  win(-hw * 0.55, 0.78, hd + 0.02, 0);
  win(hw * 0.55, 0.78, hd + 0.02, 0);
  win(-hw - 0.02, 0.78, 0, -Math.PI / 2);
  win(hw + 0.02, 0.78, 0, Math.PI / 2);
  if (idx % 2 === 0) win(hw * 0.4, 0.78, -hd - 0.02, Math.PI);

  // Coșul.
  const cx = hw * (idx % 2 ? -0.42 : 0.42);
  const cz = -0.15;
  b.box(MAT.paper, 0.26, 1.0, 0.26, P(cx, WALL_H + ROOF_H * 0.62, cz));
  b.box(MAT.ink, 0.32, 0.08, 0.32, P(cx, WALL_H + ROOF_H * 0.62 + 0.52, cz));
  out.chimneys.push(world(cx, WALL_H + ROOF_H * 0.62 + 0.6, cz));

  // Banca de pe prispă.
  const bx = idx % 2 ? hw * 0.5 : -hw * 0.5;
  b.box(MAT.balsaDark, 0.85, 0.06, 0.26, P(bx, 0.42, hd + 0.2));
  for (const s of [-1, 1]) b.box(MAT.balsaDark, 0.06, 0.28, 0.2, P(bx + s * 0.35, 0.28, hd + 0.2));
  const bp = world(bx, 0, hd + 0.2);
  out.benches.push({ x: bp.x, z: bp.z, yaw: h.r });
}

function legAt(sx: number, sz: number, y: number) {
  const t = y / TOWER.deck;
  const r = TOWER.legBase + (TOWER.legTop - TOWER.legBase) * t;
  return new Vector3(TOWER.x + sx * r, y, TOWER.z + sz * r);
}

function tower(b: Builder) {
  const corners: V2[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sz] of corners) {
    b.box(MAT.stone, 0.5, 0.3, 0.5, xf(TOWER.x + sx * TOWER.legBase, 0.15, TOWER.z + sz * TOWER.legBase));
    b.beam(MAT.wood, legAt(sx, sz, 0), legAt(sx, sz, TOWER.deck), 0.22);
  }
  const tiers = [0.3, 2.2, 4.2, TOWER.deck - 0.15];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    for (let k = 0; k < tiers.length; k++) {
      b.beam(MAT.balsaDark, legAt(ax, az, tiers[k]), legAt(bx, bz, tiers[k]), 0.12);
      if (k < tiers.length - 1) {
        b.beam(MAT.balsa, legAt(ax, az, tiers[k]), legAt(bx, bz, tiers[k + 1]), 0.08);
        b.beam(MAT.balsa, legAt(bx, bz, tiers[k]), legAt(ax, az, tiers[k + 1]), 0.08);
      }
    }
  }
  // Scara, pe latura din dreapta.
  const lx = TOWER.x + TOWER.legBase + 0.35;
  for (const dz of [-0.28, 0.28]) b.beam(MAT.balsaDark, new Vector3(lx + 0.5, 0, TOWER.z + dz), new Vector3(lx - 0.38, TOWER.deck, TOWER.z + dz), 0.07);
  for (let y = 0.4; y < TOWER.deck; y += 0.45) {
    const x = lx + 0.5 - (0.88 * y) / TOWER.deck;
    b.box(MAT.balsa, 0.06, 0.05, 0.62, xf(x, y, TOWER.z));
  }

  // Podina, console, balustrada.
  const deckR = TOWER.booth + 0.05;
  b.box(MAT.balsa, deckR * 2, 0.18, deckR * 2, xf(TOWER.x, TOWER.deck, TOWER.z));
  for (const [sx, sz] of corners) {
    b.beam(MAT.balsaDark, legAt(sx, sz, TOWER.deck - 0.9), new Vector3(TOWER.x + sx * deckR * 0.9, TOWER.deck - 0.08, TOWER.z + sz * deckR * 0.9), 0.1);
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const a = new Vector3(TOWER.x + ax * TOWER.booth, TOWER.deck + 0.5, TOWER.z + az * TOWER.booth);
    const c = new Vector3(TOWER.x + bx * TOWER.booth, TOWER.deck + 0.5, TOWER.z + bz * TOWER.booth);
    b.beam(MAT.balsaDark, a, c, 0.09);
    for (let k = 1; k < 6; k++) {
      const p = a.clone().lerp(c, k / 6);
      b.box(MAT.balsa, 0.05, 0.45, 0.05, xf(p.x, TOWER.deck + 0.3, p.z));
    }
  }
  // Stâlpii foișorului și acoperișul în pantă, cu poale.
  for (const [sx, sz] of corners) {
    b.box(MAT.wood, 0.13, TOWER.roof - TOWER.deck, 0.13, xf(TOWER.x + sx * TOWER.booth, (TOWER.roof + TOWER.deck) / 2, TOWER.z + sz * TOWER.booth));
  }
  // Grinda de sub streașină, apoi acoperișul cu poale.
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const y = TOWER.roof - 0.08;
    b.beam(MAT.balsaDark, new Vector3(TOWER.x + ax * TOWER.booth, y, TOWER.z + az * TOWER.booth), new Vector3(TOWER.x + bx * TOWER.booth, y, TOWER.z + bz * TOWER.booth), 0.12);
  }
  b.add(frustum(2.95, 2.1, 0.32, 4).rotateY(Math.PI / 4), MAT.navy, xf(TOWER.x, TOWER.roof - 0.02, TOWER.z));
  b.add(frustum(2.2, 0.02, 2.0, 4).rotateY(Math.PI / 4), MAT.navy, xf(TOWER.x, TOWER.roof + 0.28, TOWER.z));
  b.box(MAT.ink, 0.06, 0.9, 0.06, xf(TOWER.x, TOWER.roof + 2.6, TOWER.z));
  b.add(new IcosahedronGeometry(0.11, 0), MAT.balsa, xf(TOWER.x, TOWER.roof + 2.25, TOWER.z));
}

/** Vârful prăjinii de pe turn, unde flutură fanionul. */
export const FLAG_TOP = new Vector3(TOWER.x, TOWER.roof + 3.0, TOWER.z);

function board(b: Builder) {
  const { x, z, w, h, y } = BOARD;
  const postH = y + h / 2 + 0.55;
  for (const s of [-1, 1]) {
    b.box(MAT.wood, 0.2, postH, 0.2, xf(x + s * (w / 2 + 0.2), postH / 2, z));
    b.box(MAT.stone, 0.4, 0.2, 0.4, xf(x + s * (w / 2 + 0.2), 0.1, z));
  }
  b.box(MAT.balsa, w + 0.34, h + 0.34, 0.12, xf(x, y, z - 0.03));
  b.box(MAT.ink, w, h, 0.14, xf(x, y, z));
  b.box(MAT.balsaDark, w + 0.6, 0.12, 0.2, xf(x, y - h / 2 - 0.22, z + 0.02));
  b.add(gableRoof(w + 1.1, 1.05, 0.62), MAT.navy, xf(x, postH, z));
  for (const s of [-1, 1]) b.add(gableRoof(0.03, 0.62, 0.4), MAT.paperWarm, xf(x + s * (w / 2 + 0.565), postH + 0.07, z));
  // Felinarul de deasupra avizierului (se aprinde noaptea).
  b.box(MAT.ink, 0.03, 0.25, 0.03, xf(x, postH - 0.12, z + 0.45));
}

/** Felinarul de la avizier, pentru lumina de noapte. */
export const BOARD_LAMP = new Vector3(BOARD.x, BOARD.y + BOARD.h / 2 + 0.25, BOARD.z + 0.45);

function mailbox(b: Builder) {
  const { x, z } = MAILBOX;
  b.box(MAT.wood, 0.12, 0.9, 0.12, xf(x, 0.45, z));
  b.box(MAT.navy, 0.42, 0.42, 0.52, xf(x, 1.05, z, -0.35));
  b.add(new CylinderGeometry(0.21, 0.21, 0.52, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), MAT.navy, xf(x, 1.26, z, -0.35));
  b.box(MAT.ink, 0.04, 0.05, 0.3, xf(x - 0.21 * Math.cos(0.35), 1.18, z - 0.21 * Math.sin(0.35), -0.35));
  b.box(MAT.paper, 0.02, 0.14, 0.2, xf(x - 0.215 * Math.cos(0.35), 0.98, z - 0.215 * Math.sin(0.35), -0.35));
}

function well(b: Builder) {
  const { x, z, r } = WELL;
  b.cyl(MAT.stone, r + 0.05, r + 0.12, 0.62, 10, xf(x, 0.31, z));
  b.cyl(MAT.water, r - 0.08, r - 0.08, 0.02, 10, xf(x, 0.55, z));
  b.cyl(MAT.paperWarm, r + 0.1, r + 0.1, 0.06, 10, xf(x, 0.63, z));
  // Furca cumpenei.
  const px = x - WELL.arm;
  b.box(MAT.wood, 0.2, WELL.pivotY - 0.2, 0.2, xf(px, (WELL.pivotY - 0.2) / 2, z));
  for (const s of [-1, 1]) b.box(MAT.wood, 0.08, 0.5, 0.08, xf(px, WELL.pivotY - 0.05, z + s * 0.12, 0, s * -0.18));
  b.box(MAT.stone, 0.4, 0.14, 0.4, xf(px, 0.07, z));
}

function haystack(b: Builder, x: number, z: number, s: number, ry: number) {
  b.add(frustum(0.75, 0.62, 0.7, 9), MAT.balsa, xf(x, 0, z, ry, 0, 0, s));
  b.add(frustum(0.64, 0.02, 1.2, 9), MAT.balsaLight, xf(x, 0.7 * s, z, ry + 0.2, 0, 0, s));
  b.box(MAT.wood, 0.05, 0.6, 0.05, xf(x, 2.0 * s, z));
}

function props(b: Builder) {
  const rnd = seeded(11);
  HAYSTACKS.forEach(([x, z], i) => haystack(b, x, z, i === 1 ? 0.85 : 1, rnd() * 3));
  // Butucul și stiva de lemne, lângă casa din stânga.
  b.cyl(MAT.wood, 0.3, 0.33, 0.42, 9, xf(BLOCK[0], 0.21, BLOCK[1]));
  b.cyl(MAT.balsaLight, 0.29, 0.29, 0.02, 9, xf(BLOCK[0], 0.43, BLOCK[1]));
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const g = new CylinderGeometry(0.16, 0.16, 1.1, 7).rotateX(Math.PI / 2);
      b.add(g, i % 2 ? MAT.balsaDark : MAT.wood, xf(-5.75 + (i - (3 - row) / 2) * 0.33 * Math.cos(0.5), 0.16 + row * 0.28, -5.6 - (i - (3 - row) / 2) * 0.33 * Math.sin(0.5), 0.5));
    }
  }
  // Indicatorul spre Senat, la marginea satului.
  const [sx, sz] = [10.6, 4.9];
  b.box(MAT.wood, 0.1, 1.5, 0.1, xf(sx, 0.75, sz));
  b.box(MAT.paper, 0.85, 0.24, 0.05, xf(sx + 0.2, 1.3, sz, -0.3));
  b.add(new CylinderGeometry(0, 0.17, 0.24, 3).rotateZ(-Math.PI / 2).scale(1, 1, 0.2), MAT.paper, xf(sx + 0.62 * Math.cos(0.3), 1.3, sz + 0.62 * Math.sin(0.3), -0.3));
  // Pietre risipite și tufe albe de machetă.
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - 0.5) * 21;
    const z = (rnd() - 0.5) * 17;
    if (!onIsland(x, z, 1) || Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r + 0.6) continue;
    if (HOUSES.some((h) => Math.hypot(x - h.x, z - h.z) < 2.4)) continue;
    if (Math.abs(x) < 0.8 && z > 4) continue;
    const bush = rnd() > 0.45;
    b.add(new IcosahedronGeometry(bush ? 0.22 + rnd() * 0.12 : 0.1 + rnd() * 0.06, 0), bush ? (rnd() > 0.5 ? MAT.canopy : MAT.canopyWarm) : MAT.stone, xf(x, bush ? 0.14 : 0.04, z, rnd() * 3));
  }
}

export function buildWorld(): WorldOut {
  const out: WorldOut = { solid: new Builder(), panes: new Builder(), glows: [], chimneys: [], benches: [] };
  const b = out.solid;
  island(b);
  ground(b);
  gardens(b);
  HOUSES.forEach((h, i) => house(b, out.panes, out, h, i));
  tower(b);
  board(b);
  mailbox(b);
  well(b);
  props(b);
  return out;
}

/** Copacii: trunchi și coroană, instanțiați ca să se legene în vânt. */
export function treeGeometries() {
  const trunk = new CylinderGeometry(0.11, 0.15, 1, 6).translate(0, 0.5, 0);
  const crown = new IcosahedronGeometry(1, 0);
  const tiers = [
    { r: 0.95, h: 1.2, y: 0.55 },
    { r: 0.75, h: 1.05, y: 1.25 },
    { r: 0.5, h: 0.9, y: 1.9 },
  ];
  const b = new Builder();
  for (const t of tiers) b.cone('#ffffff', t.r, t.h, 7, xf(0, t.y + t.h / 2, 0));
  return { trunk, crown, fir: b.geometry() };
}
