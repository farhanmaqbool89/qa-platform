const { chromium } = require('playwright');
const sessionService = require('../services/session.service');
const assert = require('assert');

async function run() {
  console.log('--- STARTING E2E SESSION LIFECYCLE VERIFICATION ---');
  
  // 1. Launch browser using system Chrome channel
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_CHANNEL || 'chrome'
  });
  
  console.log('✅ Browser launched successfully.');

  // Create a new fresh context
  const context = await browser.newContext();
  const page = await context.newPage();

  // 2. Navigate to target login page
  console.log('Navigating to login page: http://localhost:3001/login');
  await page.goto('http://localhost:3001/login');
  
  // Verify login page element
  const title = await page.title();
  assert.strictEqual(title, 'Enterprise Auth Login', 'Title mismatch on login page');
  console.log('✅ Login page loaded successfully.');

  // 3. Fill in credentials and submit
  console.log('Entering credentials...');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'supersecret');
  await page.click('#submit-btn');

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard');
  const dashboardTitle = await page.title();
  assert.strictEqual(dashboardTitle, 'Enterprise Dashboard', 'Failed to reach authenticated dashboard');
  console.log('✅ Successfully authenticated and reached secure dashboard.');

  // 4. Save session using sessionService
  console.log('Saving session using platform sessionService...');
  const sessionPath = await sessionService.saveSession(context, page, 'customerportal', 'QA');
  assert.ok(sessionPath, 'Failed to save session state');
  console.log(`✅ Session state successfully written to: ${sessionPath}`);

  // Close initial context & page
  await page.close();
  await context.close();
  console.log('✅ Initial authenticated context closed.');

  // 5. Create a NEW context to verify Session Reuse (Phase 4)
  console.log('Creating a new context with injected storageState...');
  // Inject the storageState path just like browser.service.js does in production
  const newContext = await browser.newContext({
    storageState: sessionPath
  });
  
  // Restore DOM localStorage & sessionStorage (if any)
  console.log('Restoring saved DOM session to new context...');
  await sessionService.restoreSessionToContext(newContext, 'customerportal', 'QA');
  
  const newPage = await newContext.newPage();
  
  // Navigate directly to dashboard (which is password protected)
  console.log('Navigating directly to protected dashboard: http://localhost:3001/dashboard');
  await newPage.goto('http://localhost:3001/dashboard');

  // Verify dashboard title to confirm session was reused and we were NOT redirected to login
  const finalTitle = await newPage.title();
  assert.strictEqual(finalTitle, 'Enterprise Dashboard', 'Session reuse failed: redirected to login');
  
  // Check if secure content exists on page
  const tokenDisplay = await newPage.locator('#secure-token-display').innerText();
  assert.strictEqual(tokenDisplay, 'Secret session token active!', 'Failed to read secure page content');
  
  console.log('✅ Session successfully reused! Injected storageState works and bypassed login page.');

  // Cleanup
  await newPage.close();
  await newContext.close();
  await browser.close();
  
  console.log('--- ALL SESSION LIFECYCLE VERIFICATIONS PASSED CLEANLY ---');
}

run().catch(err => {
  console.error('❌ Session verification failed:', err.message);
  process.exit(1);
});
