// Genera los PNG del logo de DESJ (el Prisma) a partir de design/logo.mjs, con Chrome headless.
// Uso: node scripts/render-logo.mjs <ruta a puppeteer-core> [ruta a chrome.exe]
//   o: node scripts/render-logo.mjs   (si Playwright está instalado en la máquina)
// (puppeteer-core no es dependencia de la app: se pasa la ruta de una instalación aparte).
// Necesita Node 22.18 o más nuevo: logo.mjs importa prism-shape.ts directamente.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LOGO } from '../design/logo.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = [
  // [variante, tamaño, archivo, ¿fondo transparente?]
  ['full', 1024, 'assets/images/icon.png', false],
  ['full', 180, 'public/apple-touch-icon.png', false],
  ['full', 192, 'public/icon-192.png', false],
  ['full', 512, 'public/icon-512.png', false],
  ['favicon', 48, 'assets/images/favicon.png', true],
  ['mark', 512, 'assets/images/splash-icon.png', true],
  ['mark', 1024, 'assets/images/android-icon-foreground.png', true],
  ['bg', 1024, 'assets/images/android-icon-background.png', false],
  ['mono', 1024, 'assets/images/android-icon-monochrome.png', true],
];

const [puppeteerPath, chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'] = process.argv.slice(2);
let browser;
if (puppeteerPath) {
  const { default: puppeteer } = await import(pathToFileURL(path.resolve(puppeteerPath)).href);
  browser = await puppeteer.launch({ executablePath: chrome, headless: true });
} else {
  // require (no import) para que también encuentre un Playwright instalado de forma global.
  const { chromium } = createRequire(import.meta.url)('playwright');
  browser = await chromium.launch();
}

const page = await browser.newPage();
for (const [variant, size, file, transparent] of OUT) {
  if (page.setViewport) await page.setViewport({ width: size, height: size });
  else await page.setViewportSize({ width: size, height: size });
  const svg = LOGO[variant].replace('width="1024" height="1024"', `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: path.join(ROOT, file), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('✓', file, `${size}px`);
}
await browser.close();
