import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type ColorRepresentation,
} from 'three';

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Matricea pentru o piesă: poziție, rotații (în ordinea Y, X, Z) și scară. */
export function xf(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1) {
  return new Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(s, s, s));
}

/** Acoperiș în patru ape, cu baza (w × d) la y = 0. Închis dedesubt, ca să arunce umbră. */
export function hipRoof(w: number, d: number, h: number): BufferGeometry {
  if (w < d) return hipRoof(d, w, h).rotateY(Math.PI / 2);
  const hw = w / 2;
  const hd = d / 2;
  const r = (w - d) / 2;
  const a: [number, number, number] = [-r, h, 0];
  const b: [number, number, number] = [r, h, 0];
  const fl: [number, number, number] = [-hw, 0, hd];
  const fr: [number, number, number] = [hw, 0, hd];
  const bl: [number, number, number] = [-hw, 0, -hd];
  const br: [number, number, number] = [hw, 0, -hd];
  return triangles([fl, fr, b, fl, b, a, br, bl, a, br, a, b, bl, fl, a, fr, br, b, bl, br, fr, bl, fr, fl]);
}

/** Acoperiș în două ape, coama de-a lungul lui x. */
export function gableRoof(w: number, d: number, h: number) {
  const hw = w / 2;
  const hd = d / 2;
  const fl: [number, number, number] = [-hw, 0, hd];
  const fr: [number, number, number] = [hw, 0, hd];
  const bl: [number, number, number] = [-hw, 0, -hd];
  const br: [number, number, number] = [hw, 0, -hd];
  const tl: [number, number, number] = [-hw, h, 0];
  const tr: [number, number, number] = [hw, h, 0];
  return triangles([fl, fr, tr, fl, tr, tl, br, bl, tl, br, tl, tr, bl, fl, tl, fr, br, tr, bl, br, fr, bl, fr, fl]);
}

function triangles(pts: [number, number, number][]) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts.flat(), 3));
  g.computeVertexNormals();
  return g;
}

/** Un trunchi de piramidă / con cu baza la y = 0 (pentru acoperișul turnului și căpițe). */
export function frustum(rBottom: number, rTop: number, h: number, seg: number) {
  return new CylinderGeometry(rTop, rBottom, h, seg).translate(0, h / 2, 0);
}

/** Adună piese cu câte o culoare într-o singură geometrie: un singur apel de desen pentru tot satul static. */
export class Builder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private readonly c = new Color();

  add(geo: BufferGeometry, color: ColorRepresentation, m?: Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    this.c.set(color);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  box(color: ColorRepresentation, w: number, h: number, d: number, m: Matrix4) {
    return this.add(new BoxGeometry(w, h, d), color, m);
  }

  cyl(color: ColorRepresentation, rTop: number, rBottom: number, h: number, seg: number, m: Matrix4) {
    return this.add(new CylinderGeometry(rTop, rBottom, h, seg), color, m);
  }

  cone(color: ColorRepresentation, r: number, h: number, seg: number, m: Matrix4) {
    return this.add(new ConeGeometry(r, h, seg), color, m);
  }

  /** O grindă între două puncte, cu secțiune pătrată. */
  beam(color: ColorRepresentation, a: Vector3, b: Vector3, t: number) {
    const dir = new Vector3().subVectors(b, a);
    const len = dir.length();
    const q = new Quaternion().setFromUnitVectors(UP, dir.normalize());
    const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
    return this.add(new BoxGeometry(t, len, t), color, _m.clone().compose(mid, q, _s.set(1, 1, 1)));
  }

  get empty() {
    return this.pos.length === 0;
  }

  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    this.pos = [];
    this.nor = [];
    this.col = [];
    return g;
  }
}

/** Generator determinist, ca satul să arate la fel la fiecare încărcare. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
