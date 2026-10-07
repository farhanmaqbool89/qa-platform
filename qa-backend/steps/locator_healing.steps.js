const { Given, When } = require('@cucumber/cucumber');

const htmlContent = `
<!DOCTYPE html>
<html>
<head><title>Integration Fixture</title></head>
<body>
  <div>
    <!-- Working submit button with changed ID -->
    <button data-testid="checkout-submit-btn" id="new-checkout-id" class="primary-btn complete-btn">Submit Order</button>

    <!-- Cancel button (semantic veto check) -->
    <button data-testid="cancel-checkout-btn" id="cancel-btn" class="secondary-btn">Cancel Order</button>

    <!-- Duplicate candidate buttons (uniqueness check) -->
    <button class="dup-btn">Duplicate Button A</button>
    <button class="dup-btn">Duplicate Button B</button>

    <!-- Hidden candidate -->
    <button id="hidden-btn" style="display:none;">Hidden Submit</button>

    <!-- Disabled candidate -->
    <button id="disabled-btn" disabled>Disabled Submit</button>
  </div>
</body>
</html>
`;

Given('the checkout integration page is loaded', async function () {
  await this.page.goto(`data:text/html,${encodeURIComponent(htmlContent)}`);
});

When('the user clicks the checkout submit button using the broken locator', async function () {
  // Intentionally use broken locator to trigger locator failure and failure-analysis.service
  await this.page.locator('button#checkout-submit-btn').click({ timeout: 1500 });
});
