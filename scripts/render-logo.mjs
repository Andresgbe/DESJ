// Genera los PNG del logo de DESJ a partir de design/logo.mjs, con Chrome headless.
// Uso: node scripts/render-logo.mjs <ruta a puppeteer-core> [ruta a chrome.exe]
// (puppeteer-core no es dependencia de la app: se pasa la ruta de una instalación aparte).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LOGO } from '../design/logo.mjs';

const [puppeteerPath, chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'] = process.argv.slice(2);
const { default: puppeteer } = await import(pathToFileURL(path.resolve(puppeteerPath)).href);

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = [
  // [variante, tamaño, archivo, ¿fondo transparente?]
  ['full', 1024, 'assets/images/icon.png', false],
  ['full', 180, 'public/apple-touch-icon.png', false],
  ['full', 192, 'public/icon-192.png', false],
  ['full', 512, 'public/icon-512.png', false],
  ['full', 48, 'assets/images/favicon.png', false],
  ['mark', 512, 'assets/images/splash-icon.png', true],
  ['mark', 1024, 'assets/images/android-icon-foreground.png', true],
  ['bg', 1024, 'assets/images/android-icon-background.png', false],
  ['mono', 1024, 'assets/images/android-icon-monochrome.png', true],
];

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
for (const [variant, size, file, transparent] of OUT) {
  await page.setViewport({ width: size, height: size });
  const svg = LOGO[variant].replace('width="1024" height="1024"', `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: path.join(ROOT, file), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('✓', file, `${size}px`);
}
await browser.close();
