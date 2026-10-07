const assert = require('assert');
const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function makeRequest(method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const data = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: responseBody });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (data) req.write(data);
    req.end();
  });
}

async function runSaaSBillingTests() {
  console.log('\n================================================================');
  console.log('💳 RUNNING SAAS BILLING, STRIPE & QUOTAS AUTOMATED TEST SUITE');
  console.log('================================================================\n');

  // 1. Setup User Token
  console.log('🔹 Setup: Registering SaaS Org Admin');
  const userEmail = `billing_admin_${Date.now()}@billing-test.com`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    email: userEmail,
    password: 'Password123!',
    name: 'Billing Org Admin',
    organizationName: 'SaaS Payments Corp'
  });
  assert.strictEqual(regRes.status, 201);
  const token = regRes.data.accessToken;

  // 2. Plans Matrix Definitions
  console.log('\n🔹 Test 1: Fetching SaaS Plan Definitions (/api/billing/plans)');
  const plansRes = await makeRequest('GET', '/api/billing/plans');
  assert.strictEqual(plansRes.status, 200);
  assert.ok(plansRes.data.plans.STARTER);
  assert.ok(plansRes.data.plans.PRO);
  assert.ok(plansRes.data.plans.ENTERPRISE);
  console.log(`  ✅ PASSED: Plans Matrix Fetched (STARTER, PRO, ENTERPRISE available)`);

  // 3. Subscription Status & Trial Info
  console.log('\n🔹 Test 2: Get Subscription Status & 14-Day Free Trial Info (/api/billing/subscription)');
  const subRes = await makeRequest('GET', '/api/billing/subscription', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(subRes.status, 200);
  assert.strictEqual(subRes.data.subscription.plan, 'STARTER');
  assert.ok(subRes.data.subscription.isTrialActive);
  console.log(`  ✅ PASSED: Subscription Status (Plan: ${subRes.data.subscription.plan}, Status: ${subRes.data.subscription.status}, Trial Days Left: ${subRes.data.subscription.trialDaysRemaining})`);

  // 4. Upgrade Plan Tier
  console.log('\n🔹 Test 3: Upgrade Plan Tier to PRO (/api/billing/plan)');
  const upgRes = await makeRequest('POST', '/api/billing/plan', { plan: 'PRO' }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(upgRes.status, 200);
  assert.strictEqual(upgRes.data.subscription.plan, 'PRO');
  assert.strictEqual(upgRes.data.subscription.quota.monthlyLimit, 5000);
  console.log(`  ✅ PASSED: Upgraded Plan to PRO (Monthly Quota: ${upgRes.data.subscription.quota.monthlyLimit} executions)`);

  // 5. Create Stripe Checkout Session
  console.log('\n🔹 Test 4: Generate Stripe Checkout Session URL (/api/billing/checkout)');
  const checkRes = await makeRequest('POST', '/api/billing/checkout', {
    plan: 'PRO',
    returnUrl: 'http://localhost:4200/dashboard'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(checkRes.status, 200);
  assert.ok(checkRes.data.checkoutUrl.includes('checkout.stripe.com'));
  console.log(`  ✅ PASSED: Stripe Checkout Session URL Generated (${checkRes.data.checkoutUrl.substring(0, 50)}...)`);

  // 6. Create Stripe Billing Portal Session
  console.log('\n🔹 Test 5: Generate Stripe Customer Billing Portal Session URL (/api/billing/portal)');
  const portRes = await makeRequest('POST', '/api/billing/portal', {
    returnUrl: 'http://localhost:4200/dashboard'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(portRes.status, 200);
  assert.ok(portRes.data.portalUrl.includes('billing.stripe.com'));
  console.log(`  ✅ PASSED: Stripe Billing Portal Session URL Generated (${portRes.data.portalUrl.substring(0, 50)}...)`);

  // 7. List Invoices History
  console.log('\n🔹 Test 6: Fetch Invoice History (/api/billing/invoices)');
  const invRes = await makeRequest('GET', '/api/billing/invoices', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(invRes.status, 200);
  assert.ok(Array.isArray(invRes.data.invoices));
  console.log(`  ✅ PASSED: Invoice History Fetched (${invRes.data.invoices.length} invoices found)`);

  console.log('\n================================================================');
  console.log('🎉 ALL SAAS BILLING, STRIPE & QUOTA TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runSaaSBillingTests().catch(err => {
  console.error('❌ SaaS Billing Test Failure:', err);
  process.exit(1);
});
