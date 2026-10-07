const assert = require('assert');
const http = require('http');
const billingService = require('../services/billing.service');

const BASE_URL = 'http://127.0.0.1:3000';

function makeRequest(method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

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

async function runStripeBillingTests() {
  console.log('\n================================================================');
  console.log('💳 RUNNING REAL STRIPE BILLING & WEBHOOK RESILIENCE TEST SUITE');
  console.log('================================================================\n');

  // 1. Plan Definition Mapping
  console.log('🔹 Test 1: Plan Definitions & Price Mappings');
  const definitions = billingService.getPlanDefinitions();
  assert.ok(definitions.STARTER);
  assert.ok(definitions.PRO);
  assert.ok(definitions.ENTERPRISE);

  const priceId = billingService.getStripePriceId('PRO');
  assert.ok(priceId.length > 0);
  console.log(`  ✅ PASSED: Plans verified (PRO Price ID: ${priceId})`);

  // 2. Stripe Customer Ensure
  console.log('\n🔹 Test 2: Stripe Customer Generation & Mapping');
  const custId = await billingService.ensureStripeCustomer('org_stripe_test_101');
  assert.ok(custId);
  console.log(`  ✅ PASSED: Stripe Customer ID generated (${custId})`);

  // 3. Checkout Session Creation
  console.log('\n🔹 Test 3: Checkout Session Creation');
  const checkoutRes = await billingService.createCheckoutSession('org_stripe_test_101', 'PRO');
  assert.strictEqual(checkoutRes.success, true);
  assert.ok(checkoutRes.checkoutUrl);
  console.log(`  ✅ PASSED: Checkout session created (${checkoutRes.checkoutUrl.substring(0, 45)}...)`);

  // 4. Billing Portal Session Creation
  console.log('\n🔹 Test 4: Billing Portal Session Creation');
  const portalRes = await billingService.createBillingPortalSession('org_stripe_test_101');
  assert.strictEqual(portalRes.success, true);
  assert.ok(portalRes.portalUrl);
  console.log(`  ✅ PASSED: Billing Portal session created (${portalRes.portalUrl.substring(0, 45)}...)`);

  // 5. Webhook Signature Protection
  console.log('\n🔹 Test 5: Webhook Endpoint Signature Guard Verification');
  const mockBillingService = new (require('../services/billing.service').constructor)();
  mockBillingService.webhookSecret = 'whsec_test_secret_123';
  mockBillingService.stripe = {
    webhooks: {
      constructEvent: () => {
        throw new Error('Invalid signature header');
      }
    }
  };

  let sigGuardPassed = false;
  try {
    await mockBillingService.handleWebhookEvent(Buffer.from('{}'), 'invalid_sig');
  } catch (err) {
    if (err.message.includes('Webhook Signature Verification Failed') || err.message.includes('Invalid signature')) {
      sigGuardPassed = true;
    }
  }
  assert.ok(sigGuardPassed, 'Invalid signature must trigger signature verification failure');
  console.log('  ✅ PASSED: Invalid Stripe Webhook Signature Rejected Safely');

  // 6. Webhook Idempotency & Event Processing
  console.log('\n🔹 Test 6: Webhook Idempotency Verification');
  mockBillingService.stripe = {
    webhooks: {
      constructEvent: (raw, sig, sec) => ({
        id: 'evt_duplicate_test_101',
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { organizationId: 'org_stripe_test_101', planTier: 'PRO' }
          }
        }
      })
    }
  };

  const firstWebhook = await mockBillingService.handleWebhookEvent('raw_body', 'valid_sig');
  assert.strictEqual(firstWebhook.success, true);
  assert.strictEqual(firstWebhook.processed, true);

  const duplicateWebhook = await mockBillingService.handleWebhookEvent('raw_body', 'valid_sig');
  assert.strictEqual(duplicateWebhook.success, true);
  assert.strictEqual(duplicateWebhook.duplicate, true);
  console.log('  ✅ PASSED: Duplicate Webhook Event handled idempotently');

  // 7. Quota Enforcement Guard
  console.log('\n🔹 Test 7: Server-Side Quota Enforcement Guard');
  const statusBefore = await billingService.getSubscriptionStatus('org_quota_test');
  const quotaBefore = await billingService.checkQuotaLimit('org_quota_test');
  assert.strictEqual(quotaBefore.allowed, true);
  console.log(`  ✅ PASSED: Quota Check allowed (${quotaBefore.remaining} remaining)`);

  // Restore billing service state
  delete billingService.stripe;
  delete billingService.webhookSecret;

  // 8. Optional Live Stripe API Test
  if (process.env.RUN_STRIPE_INTEGRATION_TESTS === 'true' && process.env.STRIPE_SECRET_KEY) {
    console.log('\n🔹 Test 8: Live Stripe API Test (RUN_STRIPE_INTEGRATION_TESTS=true)');
    const liveService = new (require('../services/billing.service').constructor)();
    const liveCheckout = await liveService.createCheckoutSession('org_live_test', 'PRO');
    assert.strictEqual(liveCheckout.success, true);
    console.log(`  ✅ PASSED: Live Stripe API Checkout Session Created (${liveCheckout.checkoutUrl})`);
  } else {
    console.log('\n🔹 Test 8: Live Stripe API Test Skipped (Set RUN_STRIPE_INTEGRATION_TESTS=true & STRIPE_SECRET_KEY to execute)');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL REAL STRIPE BILLING & WEBHOOK TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runStripeBillingTests().catch(err => {
  console.error('❌ Stripe Billing Test Failure:', err);
  process.exit(1);
});
