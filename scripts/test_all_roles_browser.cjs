const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://complain.ecogreensolar.co.in';

async function testRoles() {
  console.log('================================================================');
  console.log('TESTING ALL 4 ROLES IN ISOLATED BROWSER CONTEXTS');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const results = [];

  // Helper to test login in an isolated context
  async function testLogin(roleName, phone, password, verifyFn) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    try {
      await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector('#login-username', { timeout: 10000 });
      await page.type('#login-username', phone, { delay: 20 });
      await page.type('#login-password', password, { delay: 20 });

      const submit = await page.$('button[type="submit"]') || await page.$('button');
      await submit.click();

      await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));

      const passed = await page.evaluate(verifyFn);
      results.push({ role: roleName, passed, error: null });
      console.log(`[${passed ? 'PASS' : 'FAIL'}] ${roleName} Browser Test`);
    } catch (err) {
      results.push({ role: roleName, passed: false, error: err.message });
      console.error(`[FAIL] ${roleName} Browser Test Exception:`, err.message);
    } finally {
      await ctx.close();
    }
  }

  // 1. Admin Role
  await testLogin('1. Admin Supervisor', '6352454247', 'admin3636', () => {
    return document.body.innerText.includes('Admin Supervisor') ||
           document.body.innerText.includes('Complaints') ||
           Boolean(localStorage.getItem('egs_token'));
  });

  // 2. Staff Role
  await testLogin('2. Staff Member', '6354687931', 'staff3636', () => {
    const text = document.body.innerText;
    return (text.includes('JIGNESH') || text.includes('Staff') || text.includes('Complaints')) &&
           Boolean(localStorage.getItem('egs_token'));
  });

  // 3. Technician Role
  await testLogin('3. Field Technician', '8141349909', 'tech3636', () => {
    const text = document.body.innerText;
    return (text.includes('HARDEV') || text.includes('Field') || text.includes('Technician') || text.includes('Tour')) &&
           Boolean(localStorage.getItem('egs_token'));
  });

  // 4. Customer Role (Public Portal)
  const custCtx = await browser.createBrowserContext();
  const custPage = await custCtx.newPage();
  try {
    await custPage.goto(TARGET_URL, { waitUntil: 'networkidle2' });
    const hasPublicAccess = await custPage.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Track') || text.includes('Eco Green Customer') || text.includes('Sign In');
    });
    results.push({ role: '4. Public Customer Portal', passed: hasPublicAccess, error: null });
    console.log(`[${hasPublicAccess ? 'PASS' : 'FAIL'}] 4. Public Customer Portal`);
  } catch (err) {
    results.push({ role: '4. Public Customer Portal', passed: false, error: err.message });
  } finally {
    await custCtx.close();
  }

  await browser.close();

  console.log('\n================================================================');
  console.log('ROLES VERIFICATION COMPLETE');
  console.table(results);
  console.log('================================================================');
}

testRoles().catch(console.error);
