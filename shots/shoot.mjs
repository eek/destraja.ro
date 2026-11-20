#!/usr/bin/env node
// Capturi pentru calendarul agendei: desktop 1440 și telefon 390, tema deschisă și cea închisă.
//   node shots/shoot.mjs <base-url> <out-dir> <nume>=<cale>[@full] …
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const { chromium } = await import(path.join(os.homedir(), 'work/la-straja-legi-shots/node_modules/playwright-core/index.mjs'));
const [base, outDir, ...specs] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const themes = (process.env.THEMES ?? 'light,dark').split(',');
const sizes = (process.env.SIZES ?? 'desktop,phone').split(',');
const SIZE = { desktop: [1440, 900, 1], phone: [390, 844, 2] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const spec of specs) {
  const name = spec.slice(0, spec.indexOf('='));
  const rest = spec.slice(spec.indexOf('=') + 1);
  const full = rest.endsWith('@full');
  const p = rest.replace(/@full$/, '');
  for (const theme of themes) {
    for (const size of sizes) {
      const [width, height, dpr] = SIZE[size];
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, colorScheme: theme, reducedMotion: 'reduce' });
      await ctx.addInitScript((t) => {
        try {
          localStorage.setItem('lastraja-consent', `denied:${Date.now()}`);
          for (const k of ['theme', 'lastraja-theme', 'destraja-theme']) localStorage.setItem(k, t);
        } catch {}
      }, theme);
      const page = await ctx.newPage();
      await page.goto(base + p, { waitUntil: 'networkidle', timeout: 120_000 });
      await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
      if (process.env.SCROLL) {
        const el = page.locator(process.env.SCROLL).first();
        if (await el.count()) await el.evaluate((n) => { n.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); });
        await page.waitForTimeout(400);
      }
      const file = path.join(outDir, `${name}-${size}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: full });
      console.log(file);
      await ctx.close();
    }
  }
}
await browser.close();
