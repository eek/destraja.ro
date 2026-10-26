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
if (flags.reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
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
} else if (mode === 'video') {
  const dir = a3;
  fs.mkdirSync(dir, { recursive: true });
  const clip = flags.clip ? await clipOf(flags.clip) : undefined;
  const frames = +(flags.frames || 270);
  // Încălzire: lăsăm satul să pornească.
  for (let i = 0; i < +(flags.warm || 90); i++) await evaluate(`window.dispatchEvent(new CustomEvent('sat-step', { detail: 1 / 30 }))`);
  for (let i = 0; i < frames; i++) {
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
      samples.push(+c.dataset.frameMs);
      if (++n < 600) requestAnimationFrame(tick); else {
        gaps.sort((a, b) => a - b);
        done(JSON.stringify({ frameMsAvg: (samples.slice(-300).reduce((a, b) => a + b, 0) / 300).toFixed(2), rafMedian: gaps[gaps.length >> 1].toFixed(2), rafP95: gaps[Math.floor(gaps.length * 0.95)].toFixed(2), calls: c.dataset.calls, tris: c.dataset.tris }));
      }
    };
    requestAnimationFrame(tick);
  })`);
  const gl = await evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`);
  console.log(res, '| renderer:', gl);
}
if (logs.length) console.log('console:', logs.slice(0, 20).join('\n'));
sock.close();
ch.kill();
setTimeout(() => fs.rmSync(prof, { recursive: true, force: true }), 800);
