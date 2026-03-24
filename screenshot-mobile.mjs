import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || 'mobile';
const width = parseInt(process.argv[4] || '390');
const height = parseInt(process.argv[5] || '844');

const screenshotDir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

const existing = fs.readdirSync(screenshotDir).filter(f => f.startsWith('screenshot-') && f.endsWith('.png'));
let max = 0;
for (const f of existing) {
  const m = f.match(/^screenshot-(\d+)/);
  if (m) max = Math.max(max, parseInt(m[1]));
}
const n = max + 1;
const filename = `screenshot-${n}-${label}.png`;
const outPath = path.join(screenshotDir, filename);

const browser = await puppeteer.launch({
  executablePath: 'C:/Users/dflet/.cache/puppeteer/chrome/win64-146.0.7680.153/chrome-win64/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();
console.log(`Saved: ${outPath}`);
