#!/usr/bin/env node
// Capturi ale paginilor din out/ (build static), desktop 1440 și telefon 390, tema deschisă.
//   node shots/capture.mjs <port> <cale>…   (serverul pe out/ pornit separat)
import path from 'node:path';
import os from 'node:os';
const { chromium } = await import(path.join(os.homedir(), 'work/la-straja-legi-shots/node_modules/playwright-core/index.mjs'));
const [port, ...paths] = process.argv.slice(2);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const p of paths) {
  for (const [name, width, height, full] of [['desktop', 1440, 900, false], ['phone', 390, 844, false], ['desktop-full', 1440, 900, true], ['phone-full', 390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: name.startsWith('phone') ? 2 : 1, colorScheme: 'light' });
    // Fără fereastra de consimțământ (ca în la-straja-legi-shots).
    await ctx.addInitScript(() => localStorage.setItem('lastraja-consent', `denied:${Date.now()}`));
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}${p}`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(800);
    const anchor = p.includes('#') ? p.split('#')[1] : null;
    const file = path.join(HERE, `${p.replace(/[#].*/, '').replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'home'}${anchor ? `-${anchor}` : ''}-${name}.png`);
    await page.screenshot({ path: file, fullPage: full });
    console.log(file);
    await ctx.close();
  }
}
await browser.close();
// Cardurile cu săgeata scorului: PILL=/camera,/senat node shots/capture.mjs <port>
if (process.env.PILL) {
  const b2 = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const p of process.env.PILL.split(',')) {
    for (const [name, width] of [['desktop', 1440], ['phone', 390]]) {
      const ctx = await b2.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
      await ctx.addInitScript(() => localStorage.setItem('lastraja-consent', `denied:${Date.now()}`));
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${port}${p}`, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForTimeout(1000);
      const card = page.locator('article', { has: page.locator('span[title^="Scorul"]') }).first();
      const n = await card.count();
      const file = path.join(HERE, `${p.replace(/^\//, '')}-card-${name}.png`);
      if (n) {
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: file });
        console.log(file);
      } else console.log(`${p}: niciun card cu săgeată`);
      await ctx.close();
    }
  }
  await b2.close();
}
// Doar câteva secțiuni ale unei pagini: SECT='/legi/b563-2026|#istoric-scor|section[aria-labelledby=versiuni]'
if (process.env.SECT) {
  const [p, ...sels] = process.env.SECT.split('|');
  const b3 = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const [name, width] of [['desktop', 1440], ['phone', 390]]) {
    const ctx = await b3.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
    await ctx.addInitScript(() => localStorage.setItem('lastraja-consent', `denied:${Date.now()}`));
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}${p}`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(800);
    for (const sel of sels) {
      const file = path.join(HERE, `${p.replace(/^\//, '').replace(/\//g, '_')}-${sel.replace(/[^a-z]+/gi, '-').replace(/^-|-$/g, '')}-${name}.png`);
      await page.locator(sel).first().screenshot({ path: file });
      console.log(file);
    }
    await ctx.close();
  }
  await b3.close();
}
