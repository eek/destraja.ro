import {
  AddEquation,
  BufferGeometry,
  CanvasTexture,
  CustomBlending,
  RingGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  MeshLambertMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SrcAlphaFactor,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  DynamicDrawUsage,
  ZeroFactor,
} from 'three';
import type { RiskLevel } from '@/lib/types';
import type { BubbleKind, BubbleOut } from './people';
import { MAT, type Tokens } from './palette';
import { seeded } from './geo';
import { ISLAND, TOWER } from './world';

/** Lumină adăugată peste ce e dedesubt, fără să atingă canalul alfa: canvasul e transparent peste pagină. */
function glow<M extends MeshBasicMaterial | PointsMaterial>(m: M): M {
  m.blending = CustomBlending;
  m.blendEquation = AddEquation;
  m.blendSrc = SrcAlphaFactor;
  m.blendDst = OneFactor;
  m.blendSrcAlpha = ZeroFactor;
  m.blendDstAlpha = OneFactor;
  m.transparent = true;
  m.depthWrite = false;
  return m;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d');
  return { c, ctx };
}

function radial(size: number, stops: [number, string][]) {
  const { c, ctx } = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const BUBBLE_W = 128;
const BUBBLE_H = 150;
const BUBBLE_POOL = 12;
const BUBBLE_SIZE = 0.82;

/** Baloanele de deasupra sătenilor: „!” pentru veste, culoarea afișului pentru cine a citit. */
export class Bubbles {
  readonly group = new Group();
  private readonly textures = new Map<BubbleKind, CanvasTexture>();
  private readonly materials = new Map<BubbleKind, SpriteMaterial>();
  private readonly sprites: Sprite[] = [];

  constructor() {
    for (const k of ['news', 'red', 'yellow', 'green'] as BubbleKind[]) {
      const { c } = canvas(BUBBLE_W, BUBBLE_H);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      this.textures.set(k, tex);
      this.materials.set(k, new SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
    }
    for (let i = 0; i < BUBBLE_POOL; i++) {
      const s = new Sprite(this.materials.get('news'));
      s.center.set(0.5, 0);
      s.renderOrder = 10;
      s.visible = false;
      this.sprites.push(s);
      this.group.add(s);
    }
  }

  /** Redesenează baloanele cu culorile temei. */
  paint(tk: Tokens) {
    for (const [kind, tex] of this.textures) {
      const c = tex.image as HTMLCanvasElement;
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      ctx.clearRect(0, 0, BUBBLE_W, BUBBLE_H);
      const fill = kind === 'news' ? '#fffefb' : tk.riskHex[kind as RiskLevel];
      const stroke = '#121a2b';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.roundRect(8, 8, BUBBLE_W - 16, 100, 34);
      ctx.moveTo(52, 104);
      ctx.lineTo(64, 140);
      ctx.lineTo(80, 104);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.fillRect(50, 96, 32, 12);
      if (kind === 'news') {
        ctx.fillStyle = stroke;
        ctx.beginPath();
        ctx.roundRect(55, 24, 18, 50, 9);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(64, 88, 9.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Un afiș mic, alb, pe fondul culorii riscului.
        ctx.fillStyle = '#fffefb';
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(42, 24, 44, 62, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = fill;
        ctx.fillRect(50, 34, 28, 14);
        ctx.fillStyle = stroke;
        for (const y of [56, 66, 76]) ctx.fillRect(50, y, y === 76 ? 18 : 28, 4);
      }
      tex.needsUpdate = true;
    }
  }

  update(list: BubbleOut[]) {
    this.sprites.forEach((s, i) => {
      const b = list[i];
      s.visible = !!b && b.s > 0.01;
      if (!b || !s.visible) return;
      s.material = this.materials.get(b.kind) ?? s.material;
      s.position.set(b.x, b.y, b.z);
      s.scale.set(BUBBLE_SIZE * b.s, BUBBLE_SIZE * (BUBBLE_H / BUBBLE_W) * b.s, 1);
    });
  }

  dispose() {
    for (const t of this.textures.values()) t.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}

/** Strălucirea ferestrelor și a felinarelor noaptea, plus stelele. */
export class NightLights {
  readonly group = new Group();
  private readonly glowTex = radial(64, [
    [0, 'rgba(255,243,214,1)'],
    [0.25, 'rgba(255,243,214,0.55)'],
    [1, 'rgba(255,243,214,0)'],
  ]);
  private readonly windows: Points;
  private readonly lantern: Points;
  private readonly stars: Points;
  private readonly fireflies: Points;
  private readonly flyPos: Float32Array;
  private readonly winMat: PointsMaterial;
  private readonly lanternMat: PointsMaterial;
  private readonly starMat: PointsMaterial;
  private readonly flyMat: PointsMaterial;

  constructor(glows: Vector3[], boardLamp: Vector3, pond: { x: number; z: number; rx: number; rz: number }) {
    const pts = [...glows, boardLamp].flatMap((v) => [v.x, v.y, v.z]);
    const wg = new BufferGeometry();
    wg.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.winMat = glow(new PointsMaterial({ map: this.glowTex, size: 1.3, color: MAT.lamp, opacity: 0 }));
    this.windows = new Points(wg, this.winMat);

    const lg = new BufferGeometry();
    lg.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
    this.lanternMat = glow(new PointsMaterial({ map: this.glowTex, size: 1.4, color: MAT.lamp, opacity: 0 }));
    this.lantern = new Points(lg, this.lanternMat);

    const rnd = seeded(77);
    const stars: number[] = [];
    for (let i = 0; i < 170; i++) {
      // Un fundal de stele pe o calotă din spatele insulei.
      const az = (rnd() - 0.5) * 2.6 + Math.PI;
      const el = -0.95 + rnd() * 1.35;
      const r = 48 + rnd() * 10;
      stars.push(Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r);
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new Float32BufferAttribute(stars, 3));
    this.starMat = glow(new PointsMaterial({ map: this.glowTex, size: 0.55, color: '#eef0f5', opacity: 0 }));
    this.stars = new Points(sg, this.starMat);

    this.flyPos = new Float32Array(14 * 3);
    const fg = new BufferGeometry();
    const attr = new Float32BufferAttribute(this.flyPos, 3);
    attr.setUsage(DynamicDrawUsage);
    fg.setAttribute('position', attr);
    this.flyMat = glow(new PointsMaterial({ map: this.glowTex, size: 0.32, color: MAT.lamp, opacity: 0 }));
    this.fireflies = new Points(fg, this.flyMat);
    this.pond = pond;

    for (const p of [this.windows, this.lantern, this.stars, this.fireflies]) {
      p.frustumCulled = false;
      p.renderOrder = 5;
      this.group.add(p);
    }
  }

  private readonly pond: { x: number; z: number; rx: number; rz: number };

  /** Stelele stau pe loc față de lume, nu se leagănă cu insula. */
  get starField() {
    return this.stars;
  }

  update(night: number, t: number, lantern: Vector3) {
    this.group.visible = night > 0.01;
    this.stars.visible = night > 0.01;
    if (night <= 0.01) return;
    this.winMat.opacity = night * (0.85 + Math.sin(t * 3.1) * 0.03);
    this.lanternMat.opacity = night * (0.95 + Math.sin(t * 7.3) * 0.05);
    this.starMat.opacity = night * (0.75 + Math.sin(t * 0.7) * 0.08);
    this.flyMat.opacity = night * 0.9;
    const lp = this.lantern.geometry.getAttribute('position');
    lp.setXYZ(0, lantern.x, lantern.y, lantern.z);
    lp.needsUpdate = true;
    const { x, z, rx, rz } = this.pond;
    for (let i = 0; i < 14; i++) {
      const a = t * (0.2 + (i % 5) * 0.04) + i * 1.9;
      const r = 1 + 0.5 * Math.sin(t * 0.3 + i);
      const blink = Math.sin(t * (1.3 + (i % 3) * 0.4) + i) > -0.2 ? 1 : 0;
      this.flyPos[i * 3] = x + Math.cos(a) * (rx + 0.6) * r;
      this.flyPos[i * 3 + 1] = blink ? 0.5 + Math.sin(t * 1.1 + i * 2) * 0.35 : -50;
      this.flyPos[i * 3 + 2] = z + Math.sin(a) * (rz + 0.6) * r;
    }
    (this.fireflies.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.glowTex.dispose();
    for (const p of [this.windows, this.lantern, this.stars, this.fireflies]) {
      p.geometry.dispose();
      (p.material as PointsMaterial).dispose();
    }
  }
}

const PUFFS = 5;

/** Fumul din coșuri: ghemotoace albe care urcă, cresc și se topesc. */
export class Smoke {
  readonly mesh: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();

  constructor(private readonly chimneys: Vector3[]) {
    const mat = new MeshLambertMaterial({ color: MAT.paper, flatShading: true });
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 0), mat, chimneys.length * PUFFS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
  }

  update(t: number) {
    let i = 0;
    this.chimneys.forEach((c, k) => {
      for (let p = 0; p < PUFFS; p++) {
        const a = (t * 0.22 + p / PUFFS + k * 0.137) % 1;
        const r = (0.12 + a * 0.3) * Math.sin(Math.min(1, a * 1.15) * Math.PI) ** 0.6;
        this.v.set(c.x + a * a * 1.1 + Math.sin(t + p) * 0.05, c.y + a * 2.0, c.z - a * a * 0.5);
        this.q.set(0, 0, 0, 1);
        this.s.set(r, r * 0.9, r);
        this.mesh.setMatrixAt(i++, this.m.compose(this.v, this.q, this.s));
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
  }
}

const BEAM_LEN = 9;

/** Fasciculul felinarului (noaptea) și raza care mătură satul ca un radar (ziua). */
export class Beam {
  readonly cone: Mesh;
  readonly sweep: Mesh;
  private readonly coneMat: MeshBasicMaterial;
  private readonly sweepMat: MeshBasicMaterial;
  private readonly sweepAlpha: Float32Array;

  constructor() {
    const g = new ConeGeometry(1.35, BEAM_LEN, 24, 6, true).translate(0, -BEAM_LEN / 2, 0);
    const pos = g.getAttribute('position');
    const col: number[] = [];
    const lamp = new Color(MAT.lamp);
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + pos.getY(i) / BEAM_LEN;
      const f = k ** 2.4;
      col.push(lamp.r * f, lamp.g * f, lamp.b * f);
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.coneMat = glow(new MeshBasicMaterial({ vertexColors: true, opacity: 0 }));
    this.cone = new Mesh(g, this.coneMat);
    this.cone.renderOrder = 4;

    // Un sector pe pământ, mai închis la marginea din față, care se stinge în urmă.
    const ARC = 0.85;
    const sg = new RingGeometry(0.4, 11.5, 28, 8, -ARC, ARC).rotateX(-Math.PI / 2);
    const sp = sg.getAttribute('position');
    const sc: number[] = [];
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      const z = sp.getZ(i);
      const r = Math.hypot(x, z) / 11.5;
      const a = Math.atan2(-z, x);
      const lead = 1 - Math.min(1, Math.abs(a) / ARC);
      const alpha = lead ** 1.6 * (1 - r ** 3) * Math.min(1, r * 3);
      sc.push(1, 1, 1, alpha);
    }
    sg.setAttribute('color', new Float32BufferAttribute(sc, 4));
    this.sweepAlpha = Float32Array.from(sc.filter((_, i) => i % 4 === 3));
    this.sweepMat = new MeshBasicMaterial({ color: MAT.navy, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.12, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.sweep = new Mesh(sg, this.sweepMat);
    this.sweep.position.set(TOWER.x, 0.06, TOWER.z);
    this.sweep.renderOrder = 2;
  }

  update(night: number, lantern: Vector3, yaw: number, pitch: number) {
    this.cone.visible = night > 0.01;
    this.coneMat.opacity = night * 0.5;
    this.cone.position.copy(lantern);
    this.cone.rotation.set(-(Math.PI / 2 - pitch), yaw, 0, 'YXZ');
    this.sweep.visible = night < 0.99;
    this.sweepMat.opacity = (1 - night) * 0.15;
    // Sectorul pornește de pe axa x; îl rotim ca marginea din față să fie pe direcția străjerului.
    const phi = yaw - Math.PI / 2;
    this.sweep.rotation.y = phi;
    if (!this.sweep.visible) return;
    // Se stinge înainte de marginea insulei, ca să nu atârne în aer.
    const pos = this.sweep.geometry.getAttribute('position');
    const col = this.sweep.geometry.getAttribute('color');
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const wx = TOWER.x + x * c + z * s;
      const wz = TOWER.z - x * s + z * c;
      const inside = 1 - (Math.abs(wx / ISLAND.a) ** ISLAND.p + Math.abs(wz / ISLAND.b) ** ISLAND.p);
      col.setW(i, this.sweepAlpha[i] * Math.min(1, Math.max(0, inside * 4)));
    }
    col.needsUpdate = true;
  }

  dispose() {
    this.cone.geometry.dispose();
    this.sweep.geometry.dispose();
    this.coneMat.dispose();
    this.sweepMat.dispose();
  }
}

/** Umbra moale de sub insula care plutește. */
export function floatShadow() {
  const tex = radial(128, [
    [0, 'rgba(0,0,0,0.55)'],
    [0.55, 'rgba(0,0,0,0.25)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: MAT.ink, opacity: 0.3 });
  const m = new Mesh(new PlaneGeometry(27, 22).rotateX(-Math.PI / 2), mat);
  m.renderOrder = -1;
  return { mesh: m, mat, tex };
}
