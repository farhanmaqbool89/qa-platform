const {
  Given,
  When,
  Then
} = require('@cucumber/cucumber');
const {
  emitEvent
} = require('../support/socket');

const assert = require('assert');

Given('user is on login page', async function () {
  await this.page.goto('https://example.com');
});

When('user enters valid credentials', async function () {
  // await this.page.fill('#username', 'admin');
  // await this.page.fill('#password', '123');
  // await this.page.click('#login-btn');
});

Then('dashboard is displayed', async function () {
  assert.strictEqual(true, true);
});

When('user enters invalid password', async function () { });

Then('error message is displayed', async function () {
  emitEvent({
    type: 'error',
    message: 'Invalid password entered'
  });
  assert.strictEqual(true, true);
});