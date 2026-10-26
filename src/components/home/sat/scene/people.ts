import { Color, Vector3 } from 'three';
import type { RiskLevel } from '@/lib/types';
import { BALL, BOX, CONE, CYL, TAPER, type Pen } from './kit';
import { C } from './palette';
import { seeded } from './geo';
import { BLOCK, BOARD, HAYSTACKS, KIDS_TREE, MAILBOX, POND, SENATE, TOWER, WELL, type V2 } from './world';

type Hat = 'caciula' | 'palarie' | 'basma' | 'coif' | 'none';
type Prop = 'axe' | 'hoe' | 'broom' | 'bucket' | 'stick' | 'letter' | 'fork' | 'spear' | 'lantern' | 'spyglass' | 'spindle' | null;

type Look = {
  shirt: Color;
  pants: Color;
  hat: Hat;
  hatColor: Color;
  skirt: boolean;
  apron?: Color;
  vest?: Color;
  scale: number;
  head: number;
};

type Pose = {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  spreadL: number;
  spreadR: number;
  lean: number;
  bob: number;
  hop: number;
  twist: number;
  headYaw: number;
  headPitch: number;
  sit: boolean;
  propL: Prop;
  propR: Prop;
  /** Rotația uneltei în mână, în jurul brațului. */
  tool: number;
  drum: boolean;
  paper: boolean;
  distaff: boolean;
};

const blank = (): Pose => ({
  legL: 0,
  legR: 0,
  armL: 0,
  armR: 0,
  spreadL: 0,
  spreadR: 0,
  lean: 0,
  bob: 0,
  hop: 0,
  twist: 0,
  headYaw: 0,
  headPitch: 0,
  sit: false,
  propL: null,
  propR: null,
  tool: 0,
  drum: false,
  paper: false,
  distaff: false,
});

const TAU = Math.PI * 2;
const PERSON_SCALE = 1.15;
/** Străjerul e personajul principal: puțin mai mare, ca să se vadă din foișor. */
const GUARD_SCALE = 1.5;
const STEP_PHASE = 7.2;
const HEAR_R = 1.9;
const SPREAD_R = 1.5;
const BUBBLE_S = 2.3;
const BEAM_SPEED = TAU / 10;
/** Cât de aplecat e fasciculul: lovește pământul înainte de marginea insulei. */
const BEAM_PITCH = 0.74;

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const angleTo = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const yawTo = (x: number, z: number, [tx, tz]: V2) => Math.atan2(tx - x, tz - z);

/* ---------- desenul unui om de jucărie ---------- */

function drawProp(pen: Pen, prop: Prop, arm: number, tool: number) {
  switch (prop) {
    case 'axe':
      pen.rx(tool).at(BOX, 0, -0.3, 0, 0.05, 0.66, 0.05, C.wood).at(BOX, 0, -0.58, 0.07, 0.05, 0.16, 0.22, C.stoneDark);
      break;
    case 'hoe':
      pen.rx(tool).at(BOX, 0, -0.35, 0, 0.045, 1.0, 0.045, C.wood).at(BOX, 0, -0.86, 0.09, 0.2, 0.05, 0.2, C.stoneDark);
      break;
    case 'fork':
      pen.rx(tool).at(BOX, 0, -0.38, 0, 0.045, 1.05, 0.045, C.wood);
      for (const x of [-0.07, 0, 0.07]) pen.at(BOX, x, -0.95, 0.03, 0.025, 0.18, 0.025, C.stoneDark);
      pen.at(BOX, 0, -0.87, 0.02, 0.17, 0.03, 0.03, C.stoneDark);
      break;
    case 'broom':
      pen.rx(tool).at(BOX, 0, -0.3, 0, 0.04, 0.85, 0.04, C.wood);
      pen.push().move(0, -0.82, 0).rx(Math.PI).put(CONE, 0.26, 0.32, 0.14, C.balsa).pop();
      break;
    case 'bucket':
      pen.rx(-arm).at(TAPER, 0, -0.17, 0, 0.24, 0.22, 0.24, C.wood).at(CYL, 0, -0.09, 0, 0.25, 0.03, 0.25, C.stoneDark);
      break;
    case 'stick':
      pen.rx(-1.3 + tool).at(BOX, 0, -0.04, 0.12, 0.03, 0.03, 0.3, C.wood);
      break;
    case 'letter':
      pen.rx(-arm * 0.3).at(BOX, 0, -0.08, 0.07, 0.17, 0.02, 0.12, C.paper);
      break;
    case 'spear':
      pen.rx(-arm).at(BOX, 0, 0.25, 0.05, 0.035, 1.75, 0.035, C.wood).push().move(0, 1.18, 0.05).put(CONE, 0.09, 0.22, 0.09, C.stoneDark).pop();
      break;
    case 'lantern':
      pen.rx(-arm).at(BOX, 0, -0.08, 0, 0.02, 0.12, 0.02, C.ink).at(BOX, 0, -0.22, 0, 0.17, 0.2, 0.17, C.ink).at(BALL, 0, -0.22, 0, 0.17, 0.17, 0.17, C.lamp);
      pen.at(CONE, 0, -0.08, 0, 0.2, 0.09, 0.2, C.ink);
      break;
    case 'spindle':
      pen.rx(tool).at(BOX, 0, -0.12, 0, 0.025, 0.25, 0.025, C.wood).at(BALL, 0, -0.12, 0, 0.08, 0.08, 0.08, C.paper);
      break;
    default:
      break;
  }
}

function drawPerson(pen: Pen, look: Look, p: Pose) {
  pen.push().scale(look.scale).move(0, p.hop, 0);
  const hipY = 0.34;
  if (p.sit) pen.move(0, 0.1, -0.12);

  if (!look.skirt || p.sit) {
    for (const s of [-1, 1]) {
      const a = p.sit ? -1.5 : s < 0 ? p.legL : p.legR;
      pen.push().move(s * 0.075, hipY, 0).rx(a).at(BOX, 0, -0.15, 0, 0.12, 0.3, 0.13, look.skirt ? look.shirt : look.pants);
      pen.at(BOX, 0, -0.31, 0.03, 0.13, 0.06, 0.18, C.ink).pop();
    }
  } else {
    for (const s of [-1, 1]) {
      const a = s < 0 ? p.legL : p.legR;
      pen.push().move(s * 0.07, 0.06, Math.sin(-a) * 0.1).at(BOX, 0, 0, 0.03, 0.12, 0.08, 0.17, C.ink).pop();
    }
  }

  pen.push().move(0, p.bob, 0).ry(p.twist).rx(p.lean);
  if (look.skirt && !p.sit) {
    pen.at(TAPER, 0, 0.22, 0, 0.52, 0.42, 0.52, look.shirt);
    if (look.apron) pen.push().move(0, 0.22, 0.2).rx(-0.18).put(BOX, 0.25, 0.36, 0.03, look.apron).pop();
  } else if (look.skirt && look.apron) {
    pen.push().move(0, 0.36, 0.2).rx(-1.35).put(BOX, 0.25, 0.3, 0.03, look.apron).pop();
  }
  pen.at(TAPER, 0, 0.5, 0, 0.36, 0.36, 0.32, look.shirt);
  if (look.vest) pen.at(TAPER, 0, 0.53, 0, 0.385, 0.26, 0.345, look.vest);
  pen.at(CYL, 0, 0.36, 0, 0.37, 0.06, 0.34, C.navy);
  pen.at(BOX, 0, 0.55, 0.145, 0.06, 0.16, 0.02, C.navy);

  if (p.drum) {
    pen.push().move(-0.06, 0.4, 0.28).rz(0.15).put(CYL, 0.38, 0.22, 0.38, C.paper);
    pen.at(CYL, 0, 0.11, 0, 0.4, 0.035, 0.4, C.navy).at(CYL, 0, -0.11, 0, 0.4, 0.035, 0.4, C.navy).pop();
  }
  if (p.paper) {
    pen.push().move(0, 0.56, 0.33).rx(-0.25).put(BOX, 0.46, 0.32, 0.015, C.paper);
    for (let i = 0; i < 4; i++) pen.at(BOX, i < 1 ? 0 : -0.06, 0.1 - i * 0.065, 0.01, i < 1 ? 0.36 : 0.26, i < 1 ? 0.05 : 0.025, 0.01, C.ink);
    pen.pop();
  }
  if (p.distaff) {
    pen.push().move(-0.2, 0.25, 0.12).rz(0.12).at(BOX, 0, 0.45, 0, 0.035, 0.95, 0.035, C.wood).at(BALL, 0, 0.98, 0, 0.22, 0.28, 0.22, C.paper).pop();
  }

  for (const s of [-1, 1]) {
    const arm = s < 0 ? p.armL : p.armR;
    const spread = s < 0 ? p.spreadL : p.spreadR;
    const prop = s < 0 ? p.propL : p.propR;
    pen.push().move(s * 0.165, 0.62, 0).rz(s * (0.12 + spread)).rx(arm);
    pen.at(BOX, 0, -0.13, 0, 0.088, 0.28, 0.088, look.shirt).at(BOX, 0, -0.255, 0, 0.092, 0.04, 0.092, C.navy);
    pen.at(BALL, 0, -0.3, 0, 0.09, 0.09, 0.09, C.balsaLight);
    if (prop) {
      pen.move(0, -0.3, 0);
      drawProp(pen, prop, arm, p.tool);
    }
    pen.pop();
  }

  pen.push().move(0, 0.87, 0).ry(p.headYaw).rx(p.headPitch).scale(look.head);
  pen.put(BALL, 0.43, 0.43, 0.43, C.balsaLight);
  pen.at(BALL, -0.075, 0.015, 0.192, 0.048, 0.055, 0.03, C.ink).at(BALL, 0.075, 0.015, 0.192, 0.048, 0.055, 0.03, C.ink);
  switch (look.hat) {
    case 'caciula':
      pen.push().move(0, 0.2, -0.02).rx(-0.12).put(TAPER, 0.4, 0.28, 0.4, look.hatColor).pop();
      break;
    case 'palarie':
      pen.at(CYL, 0, 0.14, 0, 0.58, 0.035, 0.58, look.hatColor).at(TAPER, 0, 0.23, 0, 0.34, 0.17, 0.34, look.hatColor);
      pen.at(CYL, 0, 0.18, 0, 0.3, 0.04, 0.3, C.navy);
      break;
    case 'basma':
      pen.at(BALL, 0, 0.035, -0.05, 0.47, 0.46, 0.45, look.hatColor).at(BALL, 0, -0.1, -0.21, 0.12, 0.09, 0.08, look.hatColor);
      break;
    case 'coif':
      pen.at(CYL, 0, 0.11, 0, 0.5, 0.035, 0.5, look.hatColor).at(CONE, 0, 0.27, 0, 0.42, 0.34, 0.42, look.hatColor);
      pen.at(BOX, 0, 0.47, -0.03, 0.03, 0.12, 0.1, C.paper);
      break;
    default:
      break;
  }
  pen.pop();
  pen.pop();
  pen.pop();
}

/* ---------- săteni cu un program ---------- */

type Act = 'idle' | 'chat' | 'read' | 'post' | 'draw' | 'pour' | 'chop' | 'hoe' | 'sweep' | 'sit' | 'knit' | 'spin' | 'fork' | 'cry';

type Step =
  | { walk: V2[]; speed?: number; props?: [Prop, Prop] }
  | { act: Act; dur: number; face?: V2 | number }
  | { wait: Act; face?: V2 | number };

export type BubbleKind = 'news' | RiskLevel;
export type Bubble = { kind: BubbleKind; t0: number; dur: number };

class Person {
  x: number;
  z: number;
  yaw = 0;
  private targetYaw = 0;
  readonly pose = blank();
  private si = 0;
  private st = 0;
  private seg = 0;
  private phase = 0;
  private stride = 0;
  bubble: Bubble | null = null;
  heardLap = -1;
  heardAt = -99;
  private homeSince = 0;
  private hopT = -9;
  private trips = 0;
  readonly rnd: () => number;

  constructor(
    readonly name: string,
    readonly look: Look,
    start: V2,
    readonly steps: Step[],
    readonly seed: number,
  ) {
    [this.x, this.z] = start;
    this.rnd = seeded(seed);
    const s = steps[0];
    if ('act' in s || 'wait' in s) this.faceStep(s);
  }

  get current() {
    return this.steps[this.si];
  }

  get acting(): Act | null {
    const s = this.current;
    return 'act' in s ? s.act : 'wait' in s ? s.wait : null;
  }

  get progress() {
    const s = this.current;
    return 'act' in s ? this.st / s.dur : 0;
  }

  hear(t: number, lap: number) {
    this.heardLap = lap;
    this.heardAt = t;
    this.hopT = t;
    this.say({ kind: 'news', t0: t, dur: BUBBLE_S });
  }

  say(b: Bubble) {
    this.bubble = b;
  }

  private faceStep(s: { face?: V2 | number }) {
    if (s.face === undefined) return;
    this.targetYaw = typeof s.face === 'number' ? s.face : yawTo(this.x, this.z, s.face);
  }

  private next(v: Village) {
    const leaving = this.current;
    this.si = (this.si + 1) % this.steps.length;
    this.st = 0;
    this.seg = 0;
    const s = this.current;
    if ('wait' in leaving) this.trips++;
    if ('act' in s || 'wait' in s) this.faceStep(s);
    if ('wait' in s) this.homeSince = v.t;
    // După ce a citit, pleacă de la avizier cu balonul în culoarea afișului.
    if ('act' in leaving && leaving.act === 'read' && v.levels.length) {
      const level = v.levels[Math.floor(this.rnd() * v.levels.length)];
      this.say({ kind: level, t0: v.t + 1.5, dur: 3.2 });
    }
  }

  update(v: Village, dt: number) {
    const s = this.current;
    if ('walk' in s) {
      let left = (s.speed ?? 1.05) * dt;
      while (left > 0 && this.seg < s.walk.length) {
        const [tx, tz] = s.walk[this.seg];
        const dx = tx - this.x;
        const dz = tz - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-4) {
          this.seg++;
          continue;
        }
        const step = Math.min(d, left);
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        left -= step;
        this.targetYaw = Math.atan2(dx, dz);
        this.phase += step * STEP_PHASE * (s.speed && s.speed > 1.3 ? 0.8 : 1);
        if (step >= d) this.seg++;
      }
      this.stride = Math.min(1, this.stride + dt * 5);
      if (this.seg >= s.walk.length) {
        if (this.name === 'crainic') v.lap++;
        this.next(v);
      }
    } else {
      this.stride = Math.max(0, this.stride - dt * 5);
      this.st += dt;
      if ('act' in s) {
        if (s.act === 'post' && this.st - dt < s.dur * 0.55 && this.st >= s.dur * 0.55) v.sendLetter();
        if (this.st >= s.dur) this.next(v);
      } else if (this.heardAt > this.homeSince && v.t - this.heardAt > 1.5 && v.levels.length) {
        this.next(v);
      }
    }
    this.yaw += angleTo(this.yaw, this.targetYaw) * Math.min(1, dt * 7);
    this.phase %= TAU * 100;
    if (this.bubble && v.t > this.bubble.t0 + this.bubble.dur) this.bubble = null;
    this.pose_(v);
  }

  private pose_(v: Village) {
    const p = this.pose;
    Object.assign(p, blank());
    const t = v.t + this.seed * 1.37;
    const s = this.current;
    const walking = 'walk' in s;
    const sw = Math.sin(this.phase) * 0.62 * this.stride;
    p.legL = sw;
    p.legR = -sw;
    p.armL = -sw * 0.85;
    p.armR = sw * 0.85;
    p.bob = Math.abs(Math.cos(this.phase)) * 0.05 * this.stride + Math.sin(t * 1.8) * 0.006;
    p.headYaw = walking ? 0 : Math.sin(t * 0.45) * 0.25;
    const ht = v.t - this.hopT;
    if (ht >= 0 && ht < 0.4) p.hop = Math.sin((ht / 0.4) * Math.PI) * 0.16;
    if (walking && s.props) [p.propL, p.propR] = s.props;

    const act = this.acting;
    const k = this.progress;
    switch (act) {
      case 'chat': {
        const g = Math.max(0, Math.sin(t * 2.1));
        p.armR = -0.35 - g * 0.7;
        p.spreadR = g * 0.25;
        p.headPitch = Math.sin(t * 3.1) * 0.06;
        p.headYaw = Math.sin(t * 0.7) * 0.12;
        break;
      }
      case 'read':
        p.armL = p.armR = 0.42;
        p.spreadL = p.spreadR = -0.1;
        p.headPitch = -0.28 + Math.sin(t * 0.9) * 0.05;
        p.headYaw = Math.sin(t * 0.6) * 0.3;
        break;
      case 'post':
        p.armR = -1.35 * ease(k * 2.2) * (1 - ease((k - 0.75) * 4));
        p.propR = k < 0.55 ? 'letter' : null;
        p.headPitch = -0.1;
        break;
      case 'draw': {
        const pull = v.wellPull;
        p.armL = p.armR = -2.7 + pull * 1.3;
        p.spreadL = p.spreadR = -0.05;
        p.lean = pull * 0.15;
        p.headPitch = -0.25;
        break;
      }
      case 'pour':
        p.armL = p.armR = -0.9 * Math.sin(Math.min(1, k * 1.4) * Math.PI);
        p.propL = p.propR = 'bucket';
        p.lean = 0.2 * Math.sin(Math.min(1, k * 1.4) * Math.PI);
        break;
      case 'chop': {
        const c = (t % 1.4) / 1.4;
        const up = c < 0.62 ? ease(c / 0.62) : 1 - ease((c - 0.62) / 0.1);
        p.armL = p.armR = -0.55 - up * 2.35;
        p.spreadL = p.spreadR = -0.12;
        p.propR = 'axe';
        p.tool = -0.1;
        p.lean = 0.12 + (1 - up) * 0.18;
        p.headPitch = 0.15;
        if (c > 0.72 && c - v.dt / 1.4 <= 0.72) v.burst(BLOCK[0], 0.5, BLOCK[1], 'chip', 3);
        break;
      }
      case 'hoe': {
        const c = (t % 1.6) / 1.6;
        const up = c < 0.6 ? ease(c / 0.6) : 1 - ease((c - 0.6) / 0.14);
        p.armL = p.armR = -0.35 - up * 1.6;
        p.spreadL = p.spreadR = -0.1;
        p.propR = 'hoe';
        p.tool = 0.25;
        p.lean = 0.25 + (1 - up) * 0.2;
        p.headPitch = 0.25;
        if (c > 0.74 && c - v.dt / 1.6 <= 0.74) {
          const fx = this.x + Math.sin(this.yaw) * 0.9;
          const fz = this.z + Math.cos(this.yaw) * 0.9;
          v.burst(fx, 0.1, fz, 'clod', 3);
        }
        break;
      }
      case 'sweep': {
        const c = Math.sin(t * 4.2);
        p.armL = p.armR = -0.75;
        p.spreadL = 0.05;
        p.spreadR = -0.1;
        p.twist = c * 0.35;
        p.propR = 'broom';
        p.tool = 0.55;
        p.lean = 0.12;
        p.headPitch = 0.2;
        if (Math.sin(t * 4.2 - v.dt * 4.2) < 0.95 && c >= 0.95) v.burst(this.x + Math.sin(this.yaw) * 0.8, 0.05, this.z + Math.cos(this.yaw) * 0.8, 'dust', 1);
        break;
      }
      case 'fork': {
        const c = (t % 2.2) / 2.2;
        const up = Math.sin(c * Math.PI);
        p.armL = p.armR = -0.5 - up * 1.4;
        p.propR = 'fork';
        p.tool = 0.2;
        p.twist = (c - 0.5) * 0.9;
        p.lean = 0.1;
        break;
      }
      case 'sit':
        p.sit = true;
        p.armL = p.armR = -0.75;
        p.spreadL = p.spreadR = -0.15;
        p.headPitch = Math.sin(t * 0.5) * 0.12;
        break;
      case 'knit':
        p.sit = true;
        p.armL = -0.95 + Math.sin(t * 7) * 0.08;
        p.armR = -0.95 - Math.sin(t * 7) * 0.08;
        p.spreadL = p.spreadR = -0.3;
        p.headPitch = 0.3;
        break;
      case 'spin':
        p.sit = true;
        p.distaff = true;
        p.armL = -0.7;
        p.armR = -0.6 + Math.sin(t * 2.4) * 0.35;
        p.propR = 'spindle';
        p.tool = t * 9;
        p.headPitch = 0.12;
        break;
      case 'idle':
        p.armL = p.armR = 0.05;
        break;
      default:
        break;
    }
    if (this.name === 'crainic') {
      if (v.newspaper) {
        p.paper = true;
        p.armL = p.armR = -1.05;
        p.spreadL = p.spreadR = -0.35;
        p.headPitch = 0.12 + Math.sin(t * 6) * 0.05;
      } else {
        p.drum = true;
        p.armL = -0.5;
        p.spreadL = -0.25;
        p.armR = -0.75 + Math.max(0, Math.sin(t * 9)) * -0.4;
        p.spreadR = -0.3;
        p.propR = 'stick';
        p.tool = 0.2;
      }
    }
  }
}

/* ---------- traseele ---------- */

const READ_Z = BOARD.z + 0.85;
const POST_SPOTS: V2[] = [
  [5.72, 2.88],
  [5.86, 3.46],
];
const MAILBOX_POS: V2 = [MAILBOX.x, MAILBOX.z];

/** Un sătean care stă la poveste până află vestea, apoi merge la avizier și la cutia poștală. */
function walker(name: string, look: Look, home: V2, partner: V2, toBoard: V2[], spot: V2, post: number, back: V2[], seed: number) {
  const boardFace: V2 = [spot[0], BOARD.z];
  return new Person(
    name,
    look,
    home,
    [
      { wait: 'chat', face: partner },
      { walk: [...toBoard, spot] },
      { act: 'read', dur: 3.4, face: boardFace },
      { walk: [[spot[0], READ_Z + 0.85], [4.7, 3.8], POST_SPOTS[post]] },
      { act: 'post', dur: 1.5, face: MAILBOX_POS },
      { walk: [...back, home] },
    ],
    seed,
  );
}

/* ---------- satul ---------- */

type Letter = { t0: number; from: Vector3 };
type Bit = { x: number; y: number; z: number; vx: number; vy: number; vz: number; t0: number; life: number; kind: 'chip' | 'clod' | 'dust' | 'splash' };

export type BubbleOut = { x: number; y: number; z: number; kind: BubbleKind; s: number };

export class Village {
  t = 0;
  dt = 0;
  lap = 0;
  levels: RiskLevel[] = [];
  newspaper = false;
  wellPull = 0;
  guardYaw = 0.6;
  beamPitch = BEAM_PITCH;
  private focusUntil = -1;
  private focusYaw = 0;
  private focusPitch = 0;
  private readerNext = 2;
  readonly people: Person[];
  private readonly crier: Person;
  private readonly reader: Person;
  private readonly carrier: Person;
  private readonly letters: Letter[] = [];
  private readonly bits: Bit[] = [];
  private readonly rnd = seeded(99);
  private readonly guardLook: Look;
  private readonly guardPose = blank();
  readonly bubbles: BubbleOut[] = [];
  /** Unde e felinarul străjerului acum (în coordonatele insulei). */
  readonly lantern = new Vector3();

  constructor(benches: { x: number; z: number; yaw: number }[]) {
    const man = (shirt: Color, hat: Hat, hatColor: Color, vest?: Color): Look => ({ shirt, pants: C.paperWarm, hat, hatColor, skirt: false, vest, scale: PERSON_SCALE, head: 1.08 });
    const woman = (hatColor: Color, apron: Color): Look => ({ shirt: C.paper, pants: C.paper, hat: 'basma', hatColor, skirt: true, apron, scale: PERSON_SCALE * 0.97, head: 1.08 });
    const kid = (girl: boolean, c: Color): Look => ({ shirt: C.paper, pants: c, hat: girl ? 'basma' : 'none', hatColor: c, skirt: girl, apron: girl ? c : undefined, scale: PERSON_SCALE * 0.72, head: 1.2 });

    const loop: V2[] = [
      [-2.4, 5.6],
      [-4.3, 3.1],
      [-3.0, 0.7],
      [-2.0, -1.2],
      [-1.6, -4.0],
      [1.0, -4.6],
      [4.6, -3.0],
      [5.5, -0.6],
      [5.6, 2.0],
      [4.6, 4.9],
      [0.8, 6.2],
    ];
    this.crier = new Person('crainic', man(C.paper, 'palarie', C.ink, C.navy), [0.8, 6.2], [{ walk: loop, speed: 0.78 }], 1);

    const benchA = benches[6];
    const benchB = benches[7];
    const seat = (b: { x: number; z: number; yaw: number }, dx: number): V2 => [b.x + Math.cos(b.yaw) * dx, b.z - Math.sin(b.yaw) * dx];

    const wellSpot: V2 = [WELL.x + 0.78, WELL.z];
    const carrierHome: V2 = [-7.3, 1.45];
    const midWay: V2 = [-6.0, 3.3];
    this.carrier = new Person(
      'apa',
      man(C.paper, 'caciula', C.ink),
      carrierHome,
      [
        { walk: [midWay, wellSpot], props: ['bucket', 'bucket'] },
        { act: 'draw', dur: 5.2, face: [WELL.x, WELL.z] },
        { walk: [midWay, carrierHome], speed: 0.85, props: ['bucket', 'bucket'] },
        { act: 'pour', dur: 2.2, face: -Math.PI / 2 + 0.17 },
      ],
      3,
    );

    const leftEnd: V2 = [BOARD.x - BOARD.w / 2 - 0.6, READ_Z - 0.1];
    this.reader = new Person('cititor', man(C.paper, 'caciula', C.ink, C.balsa), leftEnd, [{ act: 'read', dur: 1e9, face: [BOARD.x - BOARD.w / 2 + 0.8, BOARD.z] }], 4);

    const people: Person[] = [
      this.crier,
      this.carrier,
      this.reader,
      new Person('taietor', man(C.paper, 'caciula', C.ink, C.balsa), [BLOCK[0], BLOCK[1] + 0.82], [{ act: 'chop', dur: 8.4, face: BLOCK }, { act: 'idle', dur: 1.6, face: 0.5 }], 5),
      new Person(
        'sapator',
        man(C.paper, 'palarie', C.navy),
        [-8.0, -1.2],
        [
          { act: 'hoe', dur: 4.8, face: -Math.PI / 2 },
          { walk: [[-8.7, -1.2]], speed: 0.45 },
          { act: 'hoe', dur: 4.8, face: -Math.PI / 2 },
          { walk: [[-9.4, -1.2]], speed: 0.45 },
          { act: 'hoe', dur: 4.8, face: -Math.PI / 2 },
          { walk: [[-8.0, -1.2]], speed: 0.6 },
        ],
        6,
      ),
      new Person(
        'sapatoare',
        woman(C.navy, C.navy),
        [0.2, -6.55],
        [
          { act: 'hoe', dur: 4.8, face: Math.PI / 2 },
          { walk: [[0.8, -6.55]], speed: 0.45 },
          { act: 'hoe', dur: 4.8, face: Math.PI / 2 },
          { walk: [[1.4, -6.55]], speed: 0.45 },
          { act: 'hoe', dur: 4.8, face: Math.PI / 2 },
          { walk: [[0.2, -6.55]], speed: 0.6 },
        ],
        7,
      ),
      new Person(
        'matura',
        woman(C.paper, C.navy),
        [2.7, -4.7],
        [
          { act: 'sweep', dur: 4.5, face: 2.9 },
          { walk: [[3.7, -4.55]], speed: 0.35 },
          { act: 'sweep', dur: 4.5, face: 3.3 },
          { walk: [[2.7, -4.7]], speed: 0.35 },
        ],
        8,
      ),
      new Person(
        'fan',
        man(C.paper, 'palarie', C.ink),
        [8.9, 3.55],
        [
          { act: 'fork', dur: 6.6, face: HAYSTACKS[0] },
          { walk: [[9.75, 4.5]], speed: 0.6 },
          { act: 'fork', dur: 6.6, face: HAYSTACKS[1] },
          { walk: [[8.9, 3.55]], speed: 0.6 },
        ],
        9,
      ),
      new Person('bunica', woman(C.navy, C.navy), seat(benchA, -0.22), [{ act: 'knit', dur: 1e9, face: benchA.yaw }], 10),
      new Person('bunic', man(C.paper, 'caciula', C.ink, C.balsa), seat(benchA, 0.22), [{ act: 'sit', dur: 1e9, face: benchA.yaw }], 11),
      new Person('torcatoare', woman(C.paper, C.navy), seat(benchB, 0), [{ act: 'spin', dur: 1e9, face: benchB.yaw }], 12),
      walker('w1', man(C.paper, 'caciula', C.ink), [-3.2, -4.6], [-2.6, -4.1], [[-2.2, -3.4], [-2.4, -0.8], [-3.0, 1.6], [-2.3, 3.3]], [-1.3, READ_Z], 0, [[4.5, 4.1], [-2.4, 3.8], [-3.0, 1.6], [-2.4, -0.8], [-2.4, -3.4]], 21),
      walker('w2', woman(C.navy, C.navy), [-2.6, -4.1], [-3.2, -4.6], [[-1.8, -3.2], [-2.0, -0.8], [-2.8, 1.5], [-1.9, 3.4]], [-0.2, READ_Z + 0.05], 1, [[4.6, 4.2], [-2.2, 3.9], [-2.8, 1.5], [-2.0, -0.8], [-1.9, -3.2]], 22),
      walker('w3', man(C.paper, 'palarie', C.ink, C.balsa), [6.0, -2.0], [6.5, -1.45], [[5.3, 0.2], [5.0, 3.0]], [3.8, READ_Z], 0, [[5.3, 2.4], [5.4, 0.3]], 23),
      walker('w4', woman(C.paper, C.navy), [6.5, -1.45], [6.0, -2.0], [[5.6, 0.4], [5.2, 3.2]], [2.85, READ_Z + 0.05], 1, [[5.5, 2.4], [5.7, 0.4]], 24),
      walker('w5', man(C.paper, 'caciula', C.navy), [-0.6, 6.6], [-0.05, 7.05], [[0.0, 4.4]], [0.9, READ_Z + 0.55], 0, [[3.8, 4.6], [0.6, 5.6]], 25),
      walker('w6', woman(C.navy, C.navy), [-0.05, 7.05], [-0.6, 6.6], [[1.2, 4.6]], [1.9, READ_Z], 1, [[3.6, 4.8], [1.0, 6.0]], 26),
    ];
    this.people = people;
    this.kids = [kid(false, C.navy), kid(true, C.navy)];
    this.guardLook = { shirt: C.paper, pants: C.navy, hat: 'coif', hatColor: C.ink, skirt: false, vest: C.navy, scale: GUARD_SCALE, head: 1.1 };
  }

  private readonly kids: Look[];
  private readonly kidPose = blank();

  /** Ține satul în mișcare: oameni, veste, scrisori, străjer. */
  update(dt: number) {
    this.dt = dt;
    this.t += dt;
    const t = this.t;
    for (const p of this.people) p.update(this, dt);

    // Vestea: crainicul o spune celor din jur, iar ei celor de lângă ei.
    const c = this.crier;
    for (const p of this.people) {
      if (p === c || p.heardLap === this.lap) continue;
      if (Math.hypot(p.x - c.x, p.z - c.z) < HEAR_R) {
        p.hear(t, this.lap);
        continue;
      }
      for (const q of this.people) {
        if (q === c || q === p || q.heardLap !== this.lap) continue;
        const age = t - q.heardAt;
        if (age > 0.5 && age < 2.2 && Math.hypot(p.x - q.x, p.z - q.z) < SPREAD_R) {
          p.hear(t, this.lap);
          break;
        }
      }
    }

    // Cititorul de la avizier mai citește câte un afiș.
    if (t > this.readerNext && this.levels.length) {
      const level = this.levels[Math.floor(this.rnd() * this.levels.length)];
      this.reader.say({ kind: level, t0: t, dur: 2.6 });
      this.readerNext = t + 5.5 + this.rnd() * 3;
    }

    // Cumpăna: coboară găleata când cineva scoate apă.
    const target = this.carrier.acting === 'draw' ? ease((this.carrier.progress - 0.08) / 0.3) * (1 - ease((this.carrier.progress - 0.62) / 0.3)) : 0;
    this.wellPull += (target - this.wellPull) * Math.min(1, dt * 6);
    if (this.carrier.acting === 'draw' && this.carrier.progress > 0.62 && this.carrier.progress - dt / 5.2 <= 0.62) this.burst(WELL.x, 0.7, WELL.z, 'splash', 5);

    // Străjerul: o tură la 10 s, sau se uită la afișul ales.
    if (t < this.focusUntil) {
      this.guardYaw += angleTo(this.guardYaw, this.focusYaw) * Math.min(1, dt * 4);
      this.beamPitch += (this.focusPitch - this.beamPitch) * Math.min(1, dt * 4);
    } else {
      this.guardYaw += BEAM_SPEED * dt;
      this.beamPitch += (BEAM_PITCH - this.beamPitch) * Math.min(1, dt * 2);
    }

    for (let i = this.letters.length - 1; i >= 0; i--) if (t - this.letters[i].t0 > LETTER_S) this.letters.splice(i, 1);
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      const age = t - b.t0;
      if (age > b.life) {
        this.bits.splice(i, 1);
        continue;
      }
      b.vy -= (b.kind === 'dust' ? 0.4 : 9) * dt;
      b.x += b.vx * dt;
      b.y = Math.max(0.03, b.y + b.vy * dt);
      b.z += b.vz * dt;
      if (b.y <= 0.03) {
        b.vx *= 0.5;
        b.vz *= 0.5;
      }
    }

    this.bubbles.length = 0;
    for (const p of this.people) {
      const b = p.bubble;
      if (!b || t < b.t0) continue;
      const age = t - b.t0;
      const pop = Math.min(1, age / 0.22);
      const s = (pop < 1 ? ease(pop) * 1.15 : 1) * Math.min(1, (b.dur - age) / 0.25);
      const sitting = p.acting === 'sit' || p.acting === 'knit' || p.acting === 'spin';
      this.bubbles.push({ x: p.x, y: (sitting ? 1.55 : 1.62) * p.look.scale + p.pose.hop, z: p.z, kind: b.kind, s: Math.max(0, s) });
    }
  }

  /** Străjerul se întoarce spre un punct (afișul ales) câteva secunde. */
  focus(x: number, y: number, z: number) {
    this.focusYaw = Math.atan2(x - TOWER.x, z - TOWER.z);
    const d = Math.hypot(x - TOWER.x, z - TOWER.z);
    this.focusPitch = Math.atan2(TOWER.deck + 1 - y, d);
    this.focusUntil = this.t + 3.2;
  }

  sendLetter() {
    this.letters.push({ t0: this.t, from: new Vector3(MAILBOX.x, MAILBOX.slotY + 0.3, MAILBOX.z) });
  }

  burst(x: number, y: number, z: number, kind: Bit['kind'], n: number) {
    for (let i = 0; i < n && this.bits.length < MAX_BITS; i++) {
      const a = this.rnd() * TAU;
      const sp = kind === 'dust' ? 0.25 : kind === 'splash' ? 0.6 : 1.2;
      this.bits.push({
        x,
        y,
        z,
        vx: Math.cos(a) * sp * (0.5 + this.rnd()),
        vy: kind === 'dust' ? 0.35 : 1.6 + this.rnd() * 1.4,
        vz: Math.sin(a) * sp * (0.5 + this.rnd()),
        t0: this.t,
        life: kind === 'dust' ? 1.1 : 0.9,
        kind,
      });
    }
  }

  draw(pen: Pen, night: number) {
    const t = this.t;
    for (const p of this.people) {
      pen.reset().move(p.x, 0, p.z).ry(p.yaw);
      drawPerson(pen, p.look, p.pose);
    }

    // Copiii se fugăresc în jurul pomului, câinele după ei.
    const kp = this.kidPose;
    for (let i = 0; i < 2; i++) {
      const a = t * 0.95 - i * 0.85;
      const r = 1.45 + Math.sin(a * 2) * 0.18;
      const x = KIDS_TREE[0] + Math.cos(a) * r;
      const z = KIDS_TREE[1] + Math.sin(a) * r * 0.85;
      Object.assign(kp, blank());
      const ph = t * 11 + i;
      kp.legL = Math.sin(ph) * 0.9;
      kp.legR = -kp.legL;
      kp.armL = -kp.legL * 0.9 - 0.2;
      kp.armR = kp.legL * 0.9 - 0.2;
      kp.bob = Math.abs(Math.cos(ph)) * 0.08;
      kp.lean = 0.18;
      kp.headYaw = i ? 0.25 : -0.4;
      pen.reset().move(x, 0, z).ry(Math.atan2(-Math.sin(a), Math.cos(a) * 0.85));
      drawPerson(pen, this.kids[i], kp);
    }
    {
      const a = t * 0.95 - 1.7;
      const x = KIDS_TREE[0] + Math.cos(a) * 1.8;
      const z = KIDS_TREE[1] + Math.sin(a) * 1.55;
      pen.reset().move(x, 0, z).ry(Math.atan2(-Math.sin(a), Math.cos(a) * 0.86));
      drawDog(pen, t * 13, 1, t);
    }

    // Gâștele, în șir, în jurul iazului.
    for (let i = 0; i < 4; i++) {
      const a = -t * 0.16 - i * 0.3;
      const x = POND.x + Math.cos(a) * (POND.rx + 0.62);
      const z = POND.z + Math.sin(a) * (POND.rz + 0.5);
      pen.reset().move(x, 0, z).ry(Math.atan2(Math.sin(a), -Math.cos(a) * ((POND.rz + 0.5) / (POND.rx + 0.62))));
      drawGoose(pen, t * 6 + i * 1.3, i === 0 ? Math.max(0, Math.sin(t * 0.8)) : 0);
    }

    this.drawWell(pen);
    this.drawGuard(pen, night);

    // Scrisorile zboară spre Senat.
    for (const l of this.letters) {
      const u = (t - l.t0) / LETTER_S;
      const p0 = l.from;
      const p1x = 8.5;
      const p1y = 5.6;
      const p1z = 3.8;
      const [ex, ez] = SENATE;
      const ey = 3.2;
      const iu = 1 - u;
      const x = iu * iu * p0.x + 2 * iu * u * p1x + u * u * ex;
      const y = iu * iu * p0.y + 2 * iu * u * p1y + u * u * ey;
      const z = iu * iu * p0.z + 2 * iu * u * p1z + u * u * ez;
      const s = Math.min(1, u * 8) * (1 - ease((u - 0.72) / 0.28));
      pen.reset().move(x, y, z).ry(0.4 + Math.sin(u * 14) * 0.3).rz(Math.sin(u * 19) * 0.5).scale(s * 1.8);
      pen.put(BOX, 0.22, 0.015, 0.15, C.paper).at(BOX, 0, 0.012, 0, 0.21, 0.012, 0.02, C.navy).at(BOX, 0.06, 0.012, 0.04, 0.04, 0.012, 0.04, C.navy);
    }

    for (const b of this.bits) {
      const age = (t - b.t0) / b.life;
      const s = 1 - ease((age - 0.6) / 0.4);
      pen.reset().move(b.x, b.y, b.z).ry(age * 9).rx(age * 7);
      if (b.kind === 'chip') pen.put(BOX, 0.08 * s, 0.03 * s, 0.05 * s, C.balsaLight);
      else if (b.kind === 'clod') pen.put(BOX, 0.07 * s, 0.06 * s, 0.07 * s, C.soilDark);
      else if (b.kind === 'splash') pen.put(BALL, 0.06 * s, 0.06 * s, 0.06 * s, C.water);
      else pen.put(BALL, 0.18 * (0.5 + age), 0.18 * (0.5 + age), 0.18 * (0.5 + age), C.paperWarm);
    }

    // Păsări care rotesc deasupra turnului, doar ziua.
    if (night < 0.5) {
      for (let i = 0; i < 3; i++) {
        const a = t * (0.22 + i * 0.03) + i * 2.1;
        const r = 3.4 + i * 0.9;
        const flap = Math.sin(t * (7 + i)) * 0.6;
        pen.reset().move(TOWER.x + Math.cos(a) * r, 9.6 + i * 0.5 + Math.sin(t + i) * 0.3, TOWER.z + Math.sin(a) * r).ry(-a);
        pen.put(BALL, 0.12, 0.1, 0.3, C.slate);
        pen.push().move(0.04, 0, 0).rz(flap).at(BOX, 0.22, 0, 0, 0.42, 0.02, 0.15, C.slate).pop();
        pen.push().move(-0.04, 0, 0).rz(-flap).at(BOX, -0.22, 0, 0, 0.42, 0.02, 0.15, C.slate).pop();
      }
    }
  }

  private drawWell(pen: Pen) {
    const a = 0.42 - this.wellPull * 0.64;
    const px = WELL.x - WELL.arm;
    pen.reset().move(px, WELL.pivotY, WELL.z).rz(a);
    pen.at(BOX, 0.42, 0, 0, 4.1, 0.09, 0.09, C.wood).at(BOX, -1.45, -0.12, 0, 0.36, 0.36, 0.34, C.stoneDark);
    const tipX = px + Math.cos(a) * WELL.arm;
    const tipY = WELL.pivotY + Math.sin(a) * WELL.arm;
    pen.reset().move(tipX, tipY - WELL.rope / 2, WELL.z).put(BOX, 0.03, WELL.rope, 0.03, C.wood);
    pen.reset().move(tipX, tipY - WELL.rope - 0.1, WELL.z).put(TAPER, 0.24, 0.24, 0.24, C.wood);
    if (this.carrier.acting === 'draw') {
      pen.reset().move(WELL.x + 0.95, 0.12, WELL.z + 0.42).put(TAPER, 0.24, 0.24, 0.24, C.wood);
      pen.reset().move(WELL.x + 1.15, 0.12, WELL.z + 0.05).put(TAPER, 0.24, 0.24, 0.24, C.wood);
    }
  }

  private drawGuard(pen: Pen, night: number) {
    const p = this.guardPose;
    Object.assign(p, blank());
    p.armL = -0.15;
    p.propL = 'spear';
    p.spreadL = 0.05;
    if (night >= 0.5) {
      p.armR = -1.25;
      p.propR = 'lantern';
    } else {
      p.armR = -2.05;
      p.spreadR = -0.42;
      p.headPitch = 0.08;
    }
    p.bob = Math.sin(this.t * 1.6) * 0.008;
    pen.reset().move(TOWER.x, TOWER.deck + 0.09, TOWER.z).ry(this.guardYaw);
    drawPerson(pen, this.guardLook, p);
    if (night < 0.5) {
      // Luneta, ținută la ochi.
      pen.reset().move(TOWER.x, TOWER.deck + 0.09, TOWER.z).ry(this.guardYaw).scale(GUARD_SCALE).move(0.07, 0.89, 0.36).rx(Math.PI / 2 - 0.08);
      pen.put(CYL, 0.07, 0.34, 0.07, C.ink).at(CYL, 0, 0.17, 0, 0.09, 0.05, 0.09, C.balsaDark);
    }
    // Felinarul, pentru lumina de noapte: în fața străjerului, la mâna dreaptă.
    const y = this.guardYaw;
    const f = 0.33 * GUARD_SCALE;
    const r = 0.19 * GUARD_SCALE;
    this.lantern.set(TOWER.x + Math.sin(y) * f + Math.cos(y) * r, TOWER.deck + 0.09 + 0.3 * GUARD_SCALE, TOWER.z + Math.cos(y) * f - Math.sin(y) * r);
  }

  /** Cadrul static pentru „mișcare redusă”: toată lumea surprinsă în mijlocul treburilor, cu o veste și un afiș citit în baloane. */
  settle(seconds: number, search = 40) {
    const step = 1 / 30;
    for (let s = 0; s < seconds; s += step) this.update(step);
    for (let s = 0; s < search; s += step) {
      this.update(step);
      const full = this.bubbles.filter((b) => b.s > 0.98);
      if (full.some((b) => b.kind === 'news') && full.some((b) => b.kind !== 'news')) return this.t;
    }
    return this.t;
  }
}

const LETTER_S = 3.4;
const MAX_BITS = 60;

function drawDog(pen: Pen, phase: number, stride: number, t: number) {
  const sw = Math.sin(phase) * 0.7 * stride;
  pen.push().move(0, Math.abs(Math.cos(phase)) * 0.05, 0);
  pen.at(BOX, 0, 0.32, 0, 0.24, 0.22, 0.5, C.balsaDark);
  pen.push().move(0, 0.42, 0.28).rx(-0.15).put(BOX, 0.22, 0.2, 0.22, C.balsaDark);
  pen.at(BOX, 0, -0.03, 0.14, 0.12, 0.1, 0.12, C.balsaLight).at(BALL, 0, 0, 0.21, 0.05, 0.05, 0.05, C.ink);
  pen.at(BALL, -0.06, 0.05, 0.11, 0.035, 0.04, 0.02, C.ink).at(BALL, 0.06, 0.05, 0.11, 0.035, 0.04, 0.02, C.ink);
  for (const s of [-1, 1]) pen.push().move(s * 0.09, 0.1, -0.04).rz(s * 0.4).at(BOX, 0, 0.03, 0, 0.05, 0.12, 0.08, C.ink).pop();
  pen.pop();
  for (const [x, z, k] of [
    [-0.08, 0.17, 1],
    [0.08, 0.17, -1],
    [-0.08, -0.17, -1],
    [0.08, -0.17, 1],
  ]) {
    pen.push().move(x, 0.24, z).rx(sw * k).at(BOX, 0, -0.11, 0, 0.06, 0.22, 0.06, C.balsaDark).pop();
  }
  pen.push().move(0, 0.42, -0.25).rx(-0.7).rz(Math.sin(t * 16) * 0.5).at(BOX, 0, 0.1, 0, 0.04, 0.2, 0.04, C.ink).pop();
  pen.pop();
}

function drawGoose(pen: Pen, phase: number, honk: number) {
  pen.push().rz(Math.sin(phase) * 0.12);
  pen.at(BALL, 0, 0.22, 0, 0.26, 0.22, 0.38, C.paper).at(CONE, 0, 0.26, -0.22, 0.14, 0.18, 0.1, C.paper);
  pen.push().move(0, 0.3, 0.14).rx(-0.25 + honk * 0.5).at(CYL, 0, 0.13, 0, 0.07, 0.3, 0.07, C.paper);
  pen.at(BALL, 0, 0.3, 0.03, 0.12, 0.11, 0.15, C.paper).push().move(0, 0.29, 0.13).rx(Math.PI / 2).put(CONE, 0.06, 0.11, 0.05, C.balsaDark).pop();
  pen.at(BALL, -0.045, 0.32, 0.06, 0.025, 0.025, 0.025, C.ink).at(BALL, 0.045, 0.32, 0.06, 0.025, 0.025, 0.025, C.ink);
  pen.pop();
  for (const s of [-1, 1]) pen.push().move(s * 0.06, 0.1, 0).rx(Math.sin(phase) * 0.6 * s).at(BOX, 0, -0.05, 0.02, 0.04, 0.1, 0.06, C.balsaDark).pop();
  pen.pop();
}
