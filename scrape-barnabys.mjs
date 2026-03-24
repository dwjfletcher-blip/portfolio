import { createRequire } from 'module';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);
const puppeteer = require('./node_modules/puppeteer/lib/cjs/puppeteer/puppeteer.js');

const SCREENSHOTS_DIR = 'C:/Users/dflet/OneDrive/Desktop/Claude Projects/Website Building/temporary screenshots';
const BASE_URL = 'https://www.barnabysrestaurantandpub.com/';

if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase().slice(0, 50);
}

let screenshotCounter = 1;
function getNextScreenshotPath(label) {
  const name = label ? `barnabys-${screenshotCounter}-${label}.png` : `barnabys-${screenshotCounter}.png`;
  screenshotCounter++;
  return { path: `${SCREENSHOTS_DIR}/${name}`, name };
}

async function waitAndExtract(page) {
  // Wait for main content to load
  await new Promise(r => setTimeout(r, 3000));

  // Try scrolling to trigger lazy loading
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const dist = 200;
      const timer = setInterval(() => {
        window.scrollBy(0, dist);
        total += dist;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });

  await new Promise(r => setTimeout(r, 2000));

  return await page.evaluate(() => {
    const allText = document.body ? document.body.innerText : '';

    const navLinks = [];
    document.querySelectorAll('nav a, header a, [class*="nav"] a, [class*="header"] a').forEach(a => {
      const href = a.href;
      const text = a.innerText.trim();
      if (href && text) navLinks.push({ text, href });
    });

    const allLinks = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      const text = a.innerText.trim();
      if (href && text) allLinks.push({ text, href });
    });

    const phoneRegex = /(\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]\d{4})/g;
    const phones = [...new Set([...allText.matchAll(phoneRegex)].map(m => m[1]))];

    const addressElements = [];
    document.querySelectorAll('address, [class*="address"], [class*="location-info"], [class*="contact"], [data-testid*="address"]').forEach(el => {
      const t = el.innerText.trim();
      if (t) addressElements.push(t);
    });

    // Also look for address patterns in text
    const addressPattern = /\d+\s+[A-Z][a-zA-Z\s]+(?:St|Ave|Rd|Blvd|Dr|Ln|Way|Ct|Pl|Pike|Hwy)[.,\s]/g;
    const textAddresses = [...allText.matchAll(addressPattern)].map(m => m[0].trim());

    const hourElements = [];
    document.querySelectorAll('[class*="hour"], [class*="time"], [class*="schedule"], [class*="hours"]').forEach(el => {
      const t = el.innerText.trim();
      if (t) hourElements.push(t);
    });

    // Look for hour patterns in text
    const hourPattern = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^$\n]{0,60}(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))/g;
    const textHours = [...allText.matchAll(hourPattern)].map(m => m[0].trim());

    const priceRegex = /\$\s*\d+(?:\.\d{2})?/g;
    const prices = [...new Set([...allText.matchAll(priceRegex)].map(m => m[0].replace(/\s/g, '')))];

    // Menu items - look for price-adjacent text (common pattern: "Item Name $X.XX")
    const menuItemPattern = /^(.+?)\s+\$\s*\d+(?:\.\d{2})?/gm;
    const menuItemsFromPrices = [...allText.matchAll(menuItemPattern)].map(m => m[0].trim());

    const menuItems = [];
    // Try various menu selectors
    const menuSelectors = [
      '[class*="menu-item"]', '[class*="menuItem"]', '[class*="item-name"]',
      '[class*="dish"]', '[class*="food-item"]', '[data-testid*="menu"]',
      '.menu li', 'section li', '[class*="product"]', '[class*="menu-section"] li',
      '[class*="item"] h3', '[class*="item"] h4',
    ];
    menuSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const text = el.innerText.trim();
          if (text.length > 2 && text.length < 300) menuItems.push(text);
        });
      } catch(e) {}
    });
    menuItems.push(...menuItemsFromPrices);

    const headings = [];
    document.querySelectorAll('h1, h2, h3, h4, h5').forEach(h => {
      const text = h.innerText.trim();
      if (text && text !== 'Load More Content') headings.push({ tag: h.tagName, text });
    });

    const title = document.title;
    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';

    // Get all images
    const images = [];
    document.querySelectorAll('img[src]').forEach(img => {
      if (img.src && !img.src.includes('data:')) {
        images.push({ src: img.src, alt: img.alt || '' });
      }
    });

    return {
      title,
      metaDesc,
      url: window.location.href,
      allText: allText.slice(0, 30000),
      navLinks: [...new Map(navLinks.map(l => [l.href, l])).values()],
      allLinks: [...new Map(allLinks.map(l => [l.href, l])).values()],
      phones,
      addresses: [...new Set([...addressElements, ...textAddresses])],
      hours: [...new Set([...hourElements, ...textHours])],
      prices,
      menuItems: [...new Set(menuItems)].slice(0, 300),
      headings,
      images: images.slice(0, 30),
    };
  });
}

async function scrape() {
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--window-size=1440,900'
    ]
  });

  const results = {
    scrapedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    pages: []
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // ---- HOMEPAGE ----
    console.log(`\nNavigating to: ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    const homeContent = await waitAndExtract(page);
    const homeShot = getNextScreenshotPath('home');
    await page.screenshot({ path: homeShot.path, fullPage: true });
    console.log(`Screenshot: ${homeShot.name}`);
    results.pages.push({ pageName: 'Home', url: BASE_URL, screenshot: homeShot.name, content: homeContent });

    console.log('All links on homepage:');
    homeContent.allLinks.forEach(l => console.log(`  [${l.text}] -> ${l.href}`));

    // ---- BUILD LIST OF PAGES TO VISIT ----
    // Include known nav items + anything internal
    const manualUrls = [
      { text: 'Havertown Location', href: 'https://www.barnabysrestaurantandpub.com/havertown' },
      { text: 'Aston Location', href: 'https://www.barnabysrestaurantandpub.com/aston' },
      { text: 'About', href: 'https://www.barnabysrestaurantandpub.com/about' },
      { text: 'Gallery', href: 'https://www.barnabysrestaurantandpub.com/gallery' },
      { text: 'Reviews', href: 'https://www.barnabysrestaurantandpub.com/reviews' },
    ];

    // Get all internal links from homepage
    const internalFromHome = homeContent.allLinks.filter(l => {
      try {
        const u = new URL(l.href);
        return u.hostname.includes('barnabys') && l.href !== BASE_URL;
      } catch { return false; }
    });

    // Merge, deduplicate
    const allToVisit = [...manualUrls, ...internalFromHome];
    const visited = new Set([BASE_URL]);
    const queue = [];
    for (const l of allToVisit) {
      if (!visited.has(l.href)) {
        visited.add(l.href);
        queue.push(l);
      }
    }

    // ---- VISIT EACH PAGE ----
    for (const link of queue) {
      try {
        console.log(`\nNavigating to [${link.text}]: ${link.href}`);
        await page.goto(link.href, { waitUntil: 'networkidle0', timeout: 60000 });
        const content = await waitAndExtract(page);

        const label = sanitizeFilename(link.text.slice(0, 30));
        const shot = getNextScreenshotPath(label);
        await page.screenshot({ path: shot.path, fullPage: true });
        console.log(`Screenshot: ${shot.name}`);
        console.log(`Title: ${content.title}`);
        console.log(`Headings: ${content.headings.map(h => h.text).join(' | ')}`);
        if (content.phones.length) console.log(`Phones: ${content.phones.join(', ')}`);
        if (content.addresses.length) console.log(`Addresses: ${content.addresses.join(' | ')}`);
        if (content.prices.length) console.log(`Prices: ${content.prices.slice(0,20).join(', ')}`);
        if (content.hours.length) console.log(`Hours: ${content.hours.slice(0,5).join(' | ')}`);

        results.pages.push({ pageName: link.text, url: link.href, screenshot: shot.name, content });

        // Check if this page has sub-links worth visiting (menus, events, etc.)
        const subLinks = content.allLinks.filter(l => {
          try {
            const u = new URL(l.href);
            return u.hostname.includes('barnabys') && !visited.has(l.href);
          } catch { return false; }
        });
        for (const sub of subLinks) {
          if (!visited.has(sub.href)) {
            visited.add(sub.href);
            queue.push(sub);
          }
        }

      } catch (err) {
        console.error(`  ERROR: ${err.message}`);
        results.pages.push({ pageName: link.text, url: link.href, error: err.message });
      }
    }

    // ---- COMPILE SUMMARY ----
    const allPhones = [...new Set(results.pages.flatMap(p => p.content?.phones || []))];
    const allPrices = [...new Set(results.pages.flatMap(p => p.content?.prices || []))];
    const allAddresses = [...new Set(results.pages.flatMap(p => p.content?.addresses || []))];
    const allMenuItems = [...new Set(results.pages.flatMap(p => p.content?.menuItems || []))];
    const allHours = [...new Set(results.pages.flatMap(p => p.content?.hours || []))];

    results.summary = {
      totalPagesVisited: results.pages.length,
      successfulScrapes: results.pages.filter(p => !p.error).length,
      allPhoneNumbers: allPhones,
      allPricesFound: allPrices.sort((a, b) => parseFloat(a.replace('$','')) - parseFloat(b.replace('$',''))),
      allAddresses,
      allHours,
      totalMenuItemsFound: allMenuItems.length,
      allMenuItems,
    };

    const jsonPath = `${SCREENSHOTS_DIR}/barnabys-scrape-results.json`;
    writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nResults saved to: ${jsonPath}`);

    // ---- PRINT FULL SUMMARY ----
    console.log('\n\n========== FULL CONTENT REPORT ==========\n');

    for (const p of results.pages) {
      if (p.error) {
        console.log(`\n[${p.pageName}] ERROR: ${p.error}`);
        continue;
      }
      console.log(`\n${'='.repeat(70)}`);
      console.log(`PAGE: ${p.pageName}`);
      console.log(`URL: ${p.url}`);
      console.log(`TITLE: ${p.content.title}`);
      if (p.content.metaDesc) console.log(`META: ${p.content.metaDesc}`);
      if (p.content.headings.length) {
        console.log('HEADINGS:');
        p.content.headings.forEach(h => console.log(`  [${h.tag}] ${h.text}`));
      }
      if (p.content.phones.length) console.log(`PHONES: ${p.content.phones.join(', ')}`);
      if (p.content.addresses.length) {
        console.log('ADDRESSES:');
        p.content.addresses.forEach(a => console.log(`  ${a}`));
      }
      if (p.content.hours.length) {
        console.log('HOURS:');
        p.content.hours.forEach(h => console.log(`  ${h}`));
      }
      if (p.content.prices.length) console.log(`PRICES: ${p.content.prices.join(', ')}`);
      if (p.content.menuItems.length) {
        console.log(`MENU ITEMS (${p.content.menuItems.length}):`);
        p.content.menuItems.slice(0, 100).forEach(item => console.log(`  - ${item}`));
      }
      console.log(`\nFULL TEXT:\n${p.content.allText.slice(0, 5000)}`);
    }

    console.log('\n\n========== AGGREGATE SUMMARY ==========\n');
    console.log('TOTAL PAGES:', results.summary.totalPagesVisited);
    console.log('SUCCESSFUL:', results.summary.successfulScrapes);
    console.log('\nPHONE NUMBERS:', allPhones.length ? allPhones.join(', ') : 'None found');
    console.log('\nADDRESSES:');
    allAddresses.forEach(a => console.log(' ', a));
    console.log('\nHOURS:');
    allHours.forEach(h => console.log(' ', h));
    console.log('\nALL PRICES FOUND:');
    results.summary.allPricesFound.forEach(p => console.log(' ', p));
    console.log(`\nTOTAL MENU ITEMS: ${allMenuItems.length}`);
    console.log('MENU ITEMS:');
    allMenuItems.forEach(item => console.log('  -', item));

  } finally {
    await browser.close();
    console.log('\nDone.');
  }
}

scrape().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
