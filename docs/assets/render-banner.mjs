/**
 * Gera docs/assets/banner.png (1280×640, tamanho da "social preview" do GitHub)
 * a partir de docs/assets/banner.html, usando o mesmo Chrome headless dos testes E2E.
 *
 * Uso:  node docs/assets/render-banner.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { launchBrowser } from '../../tests/e2e/cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await launchBrowser();
const { page } = browser;
await page('Page.enable');
await page('Runtime.enable');
await page('Emulation.setDeviceMetricsOverride', { width: 1280, height: 640, deviceScaleFactor: 1, mobile: false });
await page('Page.navigate', { url: pathToFileURL(join(here, 'banner.html')).href });

// Espera a fonte serif carregar (com fallback para Georgia se estiver sem internet).
const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
  const { result } = await page('Runtime.evaluate', {
    expression: 'document.readyState === "complete" && document.fonts.status === "loaded"',
    returnByValue: true,
  });
  if (result.value) break;
  await new Promise((r) => setTimeout(r, 100));
}
const { result: fontInfo } = await page('Runtime.evaluate', {
  expression: 'document.fonts.check("800 104px \'Playfair Display\'")',
  returnByValue: true,
});
await new Promise((r) => setTimeout(r, 300));

const shot = await page('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: 0, width: 1280, height: 640, scale: 1 },
});
const out = join(here, 'banner.png');
writeFileSync(out, Buffer.from(shot.data, 'base64'));
await browser.close();
console.log(`Banner gerado: ${out} (Playfair Display ${fontInfo.value ? 'carregada' : 'indisponível — usado Georgia'})`);
