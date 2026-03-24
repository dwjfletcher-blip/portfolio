import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(__dirname, 'temporary screenshots');
const browser = await puppeteer.launch({
  executablePath: 'C:/Users/dflet/.cache/puppeteer/chrome/win64-146.0.7680.153/chrome-win64/chrome.exe',
  headless: 'new', args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 600));
// Scroll to bottom
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: path.join(screenshotDir, 'screenshot-12-footer-full.png'), fullPage: false });
await browser.close();
console.log('Done');
