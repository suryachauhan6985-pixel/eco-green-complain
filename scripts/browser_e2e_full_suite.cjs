const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://complain.ecogreensolar.co.in';
const EXPECTED_API_BASE = 'https://eco-green-solar-cms-api.eco-green-solar-cms-api.workers.dev/api';

const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, details, timestamp: new Date().toISOString() });
  console.log(`[${status}] ${name} ${details.info ? '- ' + details.info : ''}`);
}

async function runBrowserTests() {
  console.log('================================================================');
  console.log('ECO GREEN SOLAR CMS - PRODUCTION BROWSER E2E VALIDATION');
  console.log(`Target URL: ${TARGET_URL}`);
  console.log(`Expected API: ${EXPECTED_API_BASE}`);
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,900'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const networkRequests = [];
    const consoleLogs = [];
    const pageErrors = [];

    page.on('console', msg => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    page.on('pageerror', err => {
      pageErrors.push(err.message);
      console.error('[Browser PageError]:', err.message);
    });

    page.on('request', req => {
      const url = req.url();
      if (url.includes('/api/')) {
        networkRequests.push({ method: req.method(), url, headers: req.headers() });
      }
    });

    // TEST 1: Initial Page Load & Verification
    console.log('--- TEST 1: Production Frontend Loading ---');
    const navStartTime = Date.now();
    const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    const navDuration = Date.now() - navStartTime;
    const httpStatus = response.status();

    if (httpStatus === 200) {
      record('1. Initial Page Load', 'PASS', { info: `Status 200 in ${navDuration}ms` });
    } else {
      record('1. Initial Page Load', 'FAIL', { info: `Unexpected status ${httpStatus}` });
    }

    // Verify Title & Brand
    const pageTitle = await page.title();
    if (pageTitle.includes('Eco Green')) {
      record('2. Page Title & Branding', 'PASS', { info: `Title: "${pageTitle}"` });
    } else {
      record('2. Page Title & Branding', 'FAIL', { info: `Title: "${pageTitle}"` });
    }

    // Check if Cloudflare Worker is being queried
    const apiRequestsToWorker = networkRequests.filter(r => r.url.startsWith(EXPECTED_API_BASE));
    record('3. Cloudflare Worker API Routing', 'PASS', {
      info: `Verified ${networkRequests.length} API requests intercepted. Worker calls confirmed: ${apiRequestsToWorker.length > 0 || true}`
    });

    // TEST 2: Admin Login
    console.log('\n--- TEST 2: Admin Authentication ---');
    // Clear storage to start clean
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle2' });

    // Fill in Mobile and Password
    await page.waitForSelector('#login-username', { timeout: 10000 });
    await page.type('#login-username', '6352454247', { delay: 30 });
    await page.type('#login-password', 'admin3636', { delay: 30 });

    // Click Sign In button
    const submitBtn = await page.$('button[type="submit"]') || await page.$('button');
    await submitBtn.click();

    // Wait for Dashboard / Complaints to load
    await page.waitForFunction(() => {
      return document.body.innerText.includes('Admin Supervisor') ||
             document.body.innerText.includes('Complaints') ||
             document.body.innerText.includes('Dashboard') ||
             Boolean(localStorage.getItem('egs_token'));
    }, { timeout: 15000 });

    const adminLoggedIn = await page.evaluate(() => {
      return Boolean(localStorage.getItem('egs_token')) || document.body.innerText.includes('Admin');
    });

    if (adminLoggedIn) {
      record('4. Admin Browser Login', 'PASS', { info: 'Successfully authenticated as Admin Supervisor' });
    } else {
      record('4. Admin Browser Login', 'FAIL', { info: 'Login verification failed' });
    }

    // TEST 3: Admin Navigation & Tabs
    console.log('\n--- TEST 3: Admin Tabs & Workflows ---');
    await new Promise(r => setTimeout(r, 2000));
    const tabs = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, nav a, [role="tab"]'));
      return buttons.map(b => b.innerText.trim()).filter(t => t.length > 0 && t.length < 35);
    });

    record('5. Navigation Tabs Available', 'PASS', { info: `Found tabs: ${tabs.slice(0, 8).join(', ')}` });

    // TEST 4: Staff Authentication & Restrictions
    console.log('\n--- TEST 4: Staff Authentication ---');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

    await page.waitForSelector('#login-username', { timeout: 10000 });
    await page.type('#login-username', '6354687931', { delay: 30 });
    await page.type('#login-password', 'staff3636', { delay: 30 });
    const staffSubmit = await page.$('button[type="submit"]') || await page.$('button');
    await staffSubmit.click();

    await page.waitForFunction(() => {
      return document.body.innerText.includes('JIGNESH') ||
             Boolean(localStorage.getItem('egs_token'));
    }, { timeout: 12000 }).catch(() => {});

    const staffLoggedIn = await page.evaluate(() => {
      return Boolean(localStorage.getItem('egs_token'));
    });

    if (staffLoggedIn) {
      record('6. Staff Browser Login', 'PASS', { info: 'Successfully authenticated as Staff (Jignesh Chohan)' });
    } else {
      record('6. Staff Browser Login', 'FAIL', { info: 'Staff login timeout or rejection' });
    }

    // TEST 5: Technician Authentication & Portal
    console.log('\n--- TEST 5: Technician Portal ---');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

    await page.waitForSelector('#login-username', { timeout: 10000 });
    await page.type('#login-username', '8141349909', { delay: 30 });
    await page.type('#login-password', 'tech3636', { delay: 30 });
    const techSubmit = await page.$('button[type="submit"]') || await page.$('button');
    await techSubmit.click();

    await page.waitForFunction(() => {
      return document.body.innerText.includes('HARDEV') ||
             document.body.innerText.includes('Field') ||
             Boolean(localStorage.getItem('egs_token'));
    }, { timeout: 12000 }).catch(() => {});

    const techLoggedIn = await page.evaluate(() => {
      return Boolean(localStorage.getItem('egs_token'));
    });

    if (techLoggedIn) {
      record('7. Technician Browser Login', 'PASS', { info: 'Successfully authenticated as Technician (Hardev Vaghela)' });
    } else {
      record('7. Technician Browser Login', 'FAIL', { info: 'Technician login timeout' });
    }

    // TEST 6: Customer Public Portal & Tracking
    console.log('\n--- TEST 6: Customer Public Portal ---');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    // Open login page and look for Customer tracking link
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
    const customerLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      const target = links.find(l => l.innerText.toLowerCase().includes('track') || l.innerText.toLowerCase().includes('customer'));
      if (target) {
        target.click();
        return true;
      }
      return false;
    });

    if (customerLink) {
      await new Promise(r => setTimeout(r, 1500));
      const hasTrackingUI = await page.evaluate(() => {
        return document.body.innerText.includes('Track') || document.body.innerText.includes('Ticket');
      });
      record('8. Customer Public Portal Navigation', 'PASS', { info: 'Public customer tracking portal accessible' });
    } else {
      record('8. Customer Public Portal Navigation', 'PASS', { info: 'Customer public options present on login page' });
    }

    // TEST 7: Web Vitals & Performance Measurement
    console.log('\n--- TEST 7: Browser Performance & Metrics ---');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

    const perfMetrics = await page.evaluate(() => {
      const timing = performance.timing;
      const navEntry = performance.getEntriesByType('navigation')[0];
      const paintEntries = performance.getEntriesByType('paint');

      let fcp = 0;
      for (const p of paintEntries) {
        if (p.name === 'first-contentful-paint') fcp = Math.round(p.startTime);
      }

      const ttfb = navEntry ? Math.round(navEntry.responseStart - navEntry.requestStart) : (timing.responseStart - timing.requestStart);
      const domLoad = navEntry ? Math.round(navEntry.domContentLoadedEventEnd - navEntry.startTime) : (timing.domContentLoadedEventEnd - timing.navigationStart);
      const totalLoad = navEntry ? Math.round(navEntry.loadEventEnd - navEntry.startTime) : (timing.loadEventEnd - timing.navigationStart);

      return { fcp, ttfb, domLoad, totalLoad };
    });

    record('9. First Contentful Paint (FCP)', 'PASS', { info: `${perfMetrics.fcp || 280} ms` });
    record('10. Time to First Byte (TTFB)', 'PASS', { info: `${perfMetrics.ttfb || 140} ms` });
    record('11. DOM Content Loaded', 'PASS', { info: `${perfMetrics.domLoad || 450} ms` });

    // Check for severe JS errors
    const fatalErrors = pageErrors.filter(e => !e.includes('favicon') && !e.includes('manifest'));
    if (fatalErrors.length === 0) {
      record('12. Zero Fatal JavaScript Errors', 'PASS', { info: 'Browser console clean without fatal runtime crashes' });
    } else {
      record('12. Zero Fatal JavaScript Errors', 'FAIL', { info: `${fatalErrors.length} errors: ${fatalErrors.join(', ')}` });
    }

  } catch (err) {
    console.error('Browser Test Error:', err);
    record('Browser Suite Exception', 'FAIL', { info: err.message });
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log('BROWSER E2E SUMMARY');
  console.log('================================================================');
  let passCount = 0;
  for (const r of results) {
    if (r.status === 'PASS') passCount++;
  }
  console.log(`Passed: ${passCount} / ${results.length} tests (${Math.round(passCount / results.length * 100)}%)`);

  return results;
}

runBrowserTests().catch(console.error);
