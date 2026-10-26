// Capturi pentru satul 3D, prin Chrome headless + CDP.
//   node capture.mjs shot  <url> <out.png> <width> <height> [--dark] [--mobile] [--clip=<css selector>] [--angle=metal|swiftshader] [--wait=ms] [--eval=js]
//   node capture.mjs video <url> <outDir> <width> <height> --frames=270 --clip=<sel>   (URL cu #sat-record: cadre exacte la 30 fps)
//   node capture.mjs bench <url> <width> <height> [--angle=metal]                       (URL cu #sat-bench: timp pe cadru, apeluri de desen)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [mode, url, a3, a4, a5, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(
  [a5, ...rest]
    .filter((x) => x && x.startsWith('--'))
    .map((x) => {
      const [k, ...v] = x.slice(2).split('=');
      return [k, v.length ? v.join('=') : true];
    }),
);
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9400 + Math.floor(Math.random() * 400);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'sat3d-chrome-'));
const angle = flags.angle || 'metal';
const noGl = flags.nogl ? ['--disable-3d-apis', '--disable-webgl'] : [];
const args = [...noGl, '--headless=new', `--remote-debugging-port=${port}`, '--hide-scrollbars', `--user-data-dir=${prof}`, `--use-angle=${angle}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'];
const ch = spawn(CH, args, { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
for (let i = 0; i < 60; i++) {
  try {
    const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws = t.find((x) => x.type === 'page').webSocketDebuggerUrl;
    break;
  } catch {
    await sleep(200);
  }
}
const sock = new WebSocket(ws);
await new Promise((r) => sock.addEventListener('open', r));
let id = 0;
const pending = new Map();
const logs = [];
sock.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (m.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    sock.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

const W = +(mode === 'bench' ? a3 : a4);
const H = +(mode === 'bench' ? a4 : a5);
const mobile = !!flags.mobile;
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: mobile ? 3 : +(flags.dpr || 2), mobile });
if (flags.dark || flags.light) {
  const theme = flags.dark ? 'dark' : 'light';
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('lastraja-theme','${theme}')}catch(e){}` });
}
if (flags.savedata) await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator, 'connection', { value: { saveData: true } })` });
if (flags.reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
// Profil de telefon: atingeri (pointer: coarse) și procesor încetinit.
if (flags.touch || mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
if (flags.cpu) await send('Emulation.setCPUThrottlingRate', { rate: +flags.cpu });
if (flags.dprOverride) await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +flags.dprOverride, mobile });
await send('Page.navigate', { url });

// Așteptăm până desenează scena (sau până apare posterul).
for (let i = 0; i < 80; i++) {
  const ok = await evaluate(`!!document.querySelector('figure canvas')?.dataset.calls || !!document.querySelector('figure img[src*="sat-poster"]')`);
  if (ok) break;
  await sleep(250);
}
await sleep(+(flags.wait || 1500));
if (flags.eval) {
  await evaluate(flags.eval);
  await sleep(+(flags.after || 600));
}

// Coordonatele din clip sunt ale documentului, nu ale ferestrei.
const clipOf = async (sel) => {
  const r = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return [b.x + scrollX, b.y + scrollY, b.width, b.height]; })()`);
  if (!r) return undefined;
  return { x: r[0], y: r[1], width: r[2], height: r[3], scale: 1 };
};

if (mode === 'shot') {
  const clip = flags.clip ? await clipOf(flags.clip) : undefined;
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : {}) });
  fs.writeFileSync(a3, Buffer.from(shot.result.data, 'base64'));
  const info = await evaluate(`JSON.stringify({...document.querySelector('figure canvas')?.dataset, sw: document.documentElement.scrollWidth})`);
  console.log(info);
} else if (mode === 'act' || mode === 'video') {
  // Scenariu: listă de pași (JSON). Coordonatele sunt fracții din pânza scenei (0–1).
  //   {"at":30,"down":[0.5,0.6]}  {"from":31,"to":70,"moveBy":[-0.4,0]}  {"at":71,"up":true}
  //   {"at":150,"clickNotice":3}  {"at":40,"tapBoard":true}  {"at":80,"tapNotice":5}  {"at":120,"key":"Escape"}
  //   {"at":20,"eval":"..."}  {"at":90,"shot":"/cale.png"}   (în modul act, "at" e în milisecunde)
  const script = flags.script ? JSON.parse(fs.readFileSync(flags.script, 'utf8')) : [];
  const dir = mode === 'video' ? a3 : null;
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const box = JSON.parse(await evaluate(`JSON.stringify(document.querySelector('figure canvas').getBoundingClientRect())`));
  const pt = ([fx, fy]) => ({ x: box.x + fx * box.width, y: box.y + fy * box.height });
  const center = async (expr) => JSON.parse(await evaluate(`(() => { const b = (${expr}).getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); })()`));
  let mouse = { x: 0, y: 0 };
  const mouseEv = (type, p, buttons = 1) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const tap = async (p) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const run = async (s, i) => {
    if (s.down) {
      mouse = pt(s.down);
      await mouseEv('mouseMoved', mouse, 0);
      await mouseEv('mousePressed', mouse);
    }
    if (s.moveBy && i >= s.from && i <= s.to) {
      const k = 1 / (s.to - s.from + 1);
      mouse = { x: mouse.x + s.moveBy[0] * box.width * k, y: mouse.y + s.moveBy[1] * box.height * k };
      await mouseEv('mouseMoved', mouse);
    }
    if (s.up) await mouseEv('mouseReleased', mouse);
    if (s.hover !== undefined) await mouseEv('mouseMoved', await center(`document.querySelectorAll('figure button[aria-pressed]')[${s.hover}]`), 0);
    if (s.clickNotice !== undefined) {
      const p = await center(`document.querySelectorAll('figure button[aria-pressed]')[${s.clickNotice}]`);
      await mouseEv('mouseMoved', p, 0);
      await mouseEv('mousePressed', p);
      await mouseEv('mouseReleased', p);
    }
    if (s.clickSel) {
      const p = await center(`document.querySelector(${JSON.stringify(s.clickSel)})`);
      await mouseEv('mouseMoved', p, 0);
      await mouseEv('mousePressed', p);
      await mouseEv('mouseReleased', p);
    }
    if (s.tapBoard) {
      const r = JSON.parse(await evaluate(`JSON.stringify(document.querySelector('figure button[tabindex="-1"]').getBoundingClientRect())`));
      await tap({ x: r.x + r.width * 0.3, y: r.y + r.height * 0.5 });
    }
    if (s.tapNotice !== undefined) await tap(await center(`document.querySelectorAll('figure button[aria-pressed]')[${s.tapNotice}]`));
    if (s.key) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: s.key, code: s.key, windowsVirtualKeyCode: s.key === 'Escape' ? 27 : 0 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: s.key, code: s.key, windowsVirtualKeyCode: s.key === 'Escape' ? 27 : 0 });
    }
    if (s.eval) console.log(i, await evaluate(s.eval));
    if (s.shot) {
      const clip = flags.clip ? await clipOf(flags.clip) : undefined;
      const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
      fs.writeFileSync(s.shot, Buffer.from(shot.result.data, 'base64'));
    }
  };
  if (mode === 'act') {
    const t0 = Date.now();
    for (const s of script) {
      const wait = s.at - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      if (s.from !== undefined) {
        for (let i = s.from; i <= s.to; i++) {
          await run(s, i);
          await sleep(16);
        }
      } else await run(s, 0);
    }
  } else {
    const clip = flags.clip ? await clipOf(flags.clip) : undefined;
    const frames = +(flags.frames || 270);
    for (let i = 0; i < +(flags.warm || 0); i++) await evaluate(`window.dispatchEvent(new CustomEvent('sat-step', { detail: 1 / 30 }))`);
    for (let i = 0; i < frames; i++) {
      for (const s of script) if (s.at === i || (s.from !== undefined && i >= s.from && i <= s.to)) await run(s, i);
      await evaluate(`window.dispatchEvent(new CustomEvent('sat-step', { detail: 1 / 30 }))`);
      const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
      fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(shot.result.data, 'base64'));
    }
  }
} else if (mode === 'video-old') {
  const dir = a3;
  fs.mkdirSync(dir, { recursive: true });
  const clip = flags.clip ? await clipOf(flags.clip) : undefined;
  const frames = +(flags.frames || 270);
  // Încălzire: lăsăm satul să pornească.
  for (let i = 0; i < +(flags.warm || 90); i++) await evaluate(`window.dispatchEvent(new CustomEvent('sat-step', { detail: 1 / 30 }))`);
  // --click=120:2,210:15  →  la cadrul 120 apasă afișul 2, la 210 afișul 15.
  const clicks = new Map(String(flags.click || '').split(',').filter(Boolean).map((x) => x.split(':').map(Number)));
  for (let i = 0; i < frames; i++) {
    if (clicks.has(i)) await evaluate(`document.querySelectorAll('figure button[aria-pressed]')[${clicks.get(i)}]?.click()`);
    await evaluate(`window.dispatchEvent(new CustomEvent('sat-step', { detail: 1 / 30 }))`);
    const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(shot.result.data, 'base64'));
  }
} else if (mode === 'bench') {
  await sleep(+(flags.settle || 6000));
  const res = await evaluate(`new Promise((done) => {
    const c = document.querySelector('figure canvas');
    const samples = []; let n = 0; let last = performance.now(); const gaps = [];
    const tick = () => {
      const now = performance.now(); gaps.push(now - last); last = now;
      if (c.dataset.frameMs) samples.push(+c.dataset.frameMs);
      if (++n < 600) requestAnimationFrame(tick); else {
        gaps.sort((a, b) => a - b);
        done(JSON.stringify({ frameMsAvg: (samples.slice(-300).reduce((a, b) => a + b, 0) / Math.min(300, samples.length)).toFixed(2), n: samples.length, rafMedian: gaps[gaps.length >> 1].toFixed(2), rafP95: gaps[Math.floor(gaps.length * 0.95)].toFixed(2), calls: c.dataset.calls, tris: c.dataset.tris }));
      }
    };
    requestAnimationFrame(tick);
  })`);
  // Rafală: cadre fără așteptarea ecranului, o singură sincronizare GPU la final.
  const burst = [];
  for (let r = 0; r < 3; r++) {
    await evaluate(`window.dispatchEvent(new CustomEvent('sat-burst', { detail: 300 }))`);
    burst.push(+(await evaluate(`document.querySelector('figure canvas').dataset.burstMs`)));
    await sleep(300);
  }
  console.log('burstMs', burst.join(' / '), 'quality', await evaluate(`document.querySelector('figure canvas').dataset.quality`));
  const gl = await evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`);
  console.log(res, '| renderer:', gl);
}
if (logs.length) console.log('console:', logs.slice(0, 20).join('\n'));
sock.close();
ch.kill();
setTimeout(() => fs.rmSync(prof, { recursive: true, force: true }), 800);
