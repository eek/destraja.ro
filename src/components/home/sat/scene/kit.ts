import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type BufferGeometry,
  type Material,
} from 'three';

/* Primitivele din care e făcut tot ce se mișcă: un singur InstancedMesh pe formă, deci câteva apeluri de desen
   pentru toți sătenii, animalele, uneltele și scrisorile. */
export const BOX = 0;
export const BALL = 1;
export const CYL = 2;
/** Trunchi de con: baza 0,5, vârful 0,35 (cămăși, fuste, găleți). */
export const TAPER = 3;
export const CONE = 4;

function primitives(): BufferGeometry[] {
  return [
    new BoxGeometry(1, 1, 1),
    new IcosahedronGeometry(0.5, 1),
    new CylinderGeometry(0.5, 0.5, 1, 8),
    new CylinderGeometry(0.35, 0.5, 1, 8),
    new ConeGeometry(0.5, 1, 8),
  ];
}

export class Kit {
  readonly meshes: InstancedMesh[];
  private readonly n: number[];

  constructor(material: Material, capacity: number[], shadows = true) {
    this.meshes = primitives().map((g, i) => {
      const m = new InstancedMesh(g, material, capacity[i]);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity[i] * 3), 3);
      m.instanceColor.setUsage(DynamicDrawUsage);
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      m.frustumCulled = false;
      m.count = 0;
      return m;
    });
    this.n = capacity.map(() => 0);
  }

  begin() {
    this.n.fill(0);
  }

  put(kind: number, m: Matrix4, color: Color) {
    const mesh = this.meshes[kind];
    const i = this.n[kind];
    if (i >= mesh.instanceMatrix.count) return;
    this.n[kind] = i + 1;
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color);
  }

  end() {
    this.meshes.forEach((mesh, k) => {
      mesh.count = this.n[k];
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
  }
}

const STACK = 24;

/** O stivă de transformări, ca într-un desen cu creionul: mut, rotesc, pun o piesă, revin. */
export class Pen {
  readonly m = new Matrix4();
  private readonly stack = Array.from({ length: STACK }, () => new Matrix4());
  private depth = 0;
  private readonly t = new Matrix4();
  private readonly s = new Matrix4();

  constructor(private kit: Kit) {}

  use(kit: Kit) {
    this.kit = kit;
    return this;
  }

  reset(base?: Matrix4) {
    if (base) this.m.copy(base);
    else this.m.identity();
    this.depth = 0;
    return this;
  }

  push() {
    this.stack[this.depth++].copy(this.m);
    return this;
  }

  pop() {
    this.m.copy(this.stack[--this.depth]);
    return this;
  }

  move(x: number, y: number, z: number) {
    this.m.multiply(this.t.makeTranslation(x, y, z));
    return this;
  }

  rx(a: number) {
    if (a) this.m.multiply(this.t.makeRotationX(a));
    return this;
  }

  ry(a: number) {
    if (a) this.m.multiply(this.t.makeRotationY(a));
    return this;
  }

  rz(a: number) {
    if (a) this.m.multiply(this.t.makeRotationZ(a));
    return this;
  }

  scale(s: number) {
    if (s !== 1) this.m.multiply(this.t.makeScale(s, s, s));
    return this;
  }

  /** Pune o primitivă de mărimea dată în originea curentă. */
  put(kind: number, sx: number, sy: number, sz: number, color: Color) {
    this.s.copy(this.m).multiply(this.t.makeScale(sx, sy, sz));
    this.kit.put(kind, this.s, color);
    return this;
  }

  /** Ca put, dar mutată întâi la (x, y, z) fără să schimbe originea. */
  at(kind: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: Color) {
    this.s.copy(this.m).multiply(this.t.makeTranslation(x, y, z)).multiply(this.t.makeScale(sx, sy, sz));
    this.kit.put(kind, this.s, color);
    return this;
  }
}
