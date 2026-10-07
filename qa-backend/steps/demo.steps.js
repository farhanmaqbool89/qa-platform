const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');

Given('I open the demo application', async function () {
  const targetUrl = process.env.TARGET_URL || 'http://localhost:4000/login';
  console.log(`[Demo Steps] Navigating to: ${targetUrl}`);
  await this.page.goto(targetUrl);
});

When('I enter username {string}', async function (username) {
  await this.page.fill('#username', username);
});

When('I enter password {string}', async function (password) {
  await this.page.fill('#password', password);
});

When('I click the login button', async function () {
  await this.page.click('#submit-btn');
});

Then('I should be redirected to the dashboard', async function () {
  await this.page.waitForURL('**/dashboard');
  const title = await this.page.title();
  assert.strictEqual(title, 'Enterprise Dashboard', 'Failed to redirect to dashboard');
});

Then('I should see {string}', async function (text) {
  const bodyText = await this.page.innerText('body');
  assert.ok(bodyText.includes(text), `Expected page to contain text "${text}"`);
});

Then('I should see the login error message', async function () {
  const errorMsg = await this.page.locator('#error-msg').innerText();
  assert.ok(errorMsg && errorMsg.trim().length > 0, 'Login error message was not displayed');
});

Given('I am logged into the application', async function () {
  const targetUrl = process.env.TARGET_URL || 'http://localhost:4000/login';
  const currentUrl = this.page.url();
  
  const isAlreadyLoggedIn = currentUrl.includes('/dashboard') || 
                            currentUrl.includes('/products') || 
                            currentUrl.includes('/profile');
                            
  if (!isAlreadyLoggedIn) {
    console.log(`[Demo Steps] Bypassing/Performing login flow...`);
    await this.page.goto(targetUrl);
    // Try to login if we are redirected to login page
    const loginTitle = await this.page.title();
    if (loginTitle === 'Enterprise Auth Login') {
      await this.page.fill('#username', 'qauser');
      await this.page.fill('#password', 'Qa@12345');
      await this.page.click('#submit-btn');
      await this.page.waitForURL('**/dashboard');
    }
  }
});

When('I navigate to the products page', async function () {
  await this.page.click('a[href="/products"]');
  await this.page.waitForURL('**/products');
});

Then('I should see the products table', async function () {
  const tableVisible = await this.page.locator('table').isVisible();
  assert.ok(tableVisible, 'Products table is not visible');
});

When('I open the profile page', async function () {
  await this.page.click('a[href="/profile"]');
  await this.page.waitForURL('**/profile');
});

When('I update my profile information', async function () {
  await this.page.fill('#profile-name', 'QA User Updated');
  await this.page.fill('#profile-email', 'qa.updated@example.com');
  await this.page.fill('#profile-phone', '555-9999');
});

When('I click save', async function () {
  await this.page.click('button[type="submit"]');
});

Then('I should see the profile updated confirmation', async function () {
  const successBanner = this.page.locator('#profile-success-banner');
  await successBanner.waitFor({ state: 'visible' });
  const isVisible = await successBanner.isVisible();
  assert.ok(isVisible, 'Profile updated banner is not visible');
});

Then('I should see a product named {string}', async function (productName) {
  const tbodyText = await this.page.locator('#product-rows').innerText();
  assert.ok(tbodyText.includes(productName), `Expected products list to contain "${productName}"`);
});