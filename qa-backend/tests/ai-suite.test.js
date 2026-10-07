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

async function runAISuiteTests() {
  console.log('\n================================================================');
  console.log('🧠 RUNNING UNIFIED AI QA AUTOMATION SUITE REGRESSION TEST SUITE');
  console.log('================================================================\n');

  // 1. Setup User Token
  console.log('🔹 Setup: Registering AI QA Lead');
  const userEmail = `ai_lead_${Date.now()}@ai-test.com`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    email: userEmail,
    password: 'Password123!',
    name: 'AI Lead Engineer',
    organizationName: 'AI Automation Org'
  });
  assert.strictEqual(regRes.status, 201);
  const token = regRes.data.accessToken;

  // 2. AI Requirement Analysis
  console.log('\n🔹 Test 1: AI Requirement Analysis (/api/ai/analyze-requirement)');
  const reqRes = await makeRequest('POST', '/api/ai/analyze-requirement', {
    requirementText: 'As a customer, I want to authenticate via OAuth2 SSO and process credit card payments.'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(reqRes.status, 200);
  assert.strictEqual(reqRes.data.analysis.riskLevel, 'HIGH');
  console.log(`  ✅ PASSED: Risk Level ${reqRes.data.analysis.riskLevel} (Score: ${reqRes.data.analysis.riskScore})`);

  // 3. AI Test Case Generation
  console.log('\n🔹 Test 2: AI Test Case Generation (/api/ai/generate-test-cases)');
  const tcRes = await makeRequest('POST', '/api/ai/generate-test-cases', {
    prompt: 'OAuth2 Single Sign-On Flow'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(tcRes.status, 200);
  assert.ok(Array.isArray(tcRes.data.testCases));
  console.log(`  ✅ PASSED: Generated ${tcRes.data.testCases.length} manual test cases`);

  // 4. AI Gherkin Generation
  console.log('\n🔹 Test 3: AI Gherkin Generation (/api/ai/generate-gherkin)');
  const gherkinRes = await makeRequest('POST', '/api/ai/generate-gherkin', {
    prompt: 'User Checkout Payment'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(gherkinRes.status, 200);
  assert.ok(gherkinRes.data.content.includes('Feature:'));
  console.log(`  ✅ PASSED: Generated Gherkin Feature File (${gherkinRes.data.filename})`);

  // 5. AI Playwright Code Generation
  console.log('\n🔹 Test 4: AI Playwright Step Generation (/api/ai/generate-playwright)');
  const pwRes = await makeRequest('POST', '/api/ai/generate-playwright', {
    scenario: 'Successful authentication'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(pwRes.status, 200);
  assert.ok(pwRes.data.code.includes("require('@playwright/test')"));
  console.log(`  ✅ PASSED: Generated Playwright step code (${pwRes.data.framework})`);

  // 6. AI Failure Intelligence
  console.log('\n🔹 Test 5: AI Failure Intelligence (/api/ai/analyze-failure)');
  const failRes = await makeRequest('POST', '/api/ai/analyze-failure', {
    executionId: 'exec_test_101',
    rawLog: '[ERROR] locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator("button#submit")'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(failRes.status, 200);
  assert.ok(failRes.data.analysis.category);
  console.log(`  ✅ PASSED: Classified Failure Category: ${failRes.data.analysis.category}`);

  // 7. AI Self-Healing
  console.log('\n🔹 Test 6: AI Self-Healing Selector (/api/ai/heal-locator)');
  const healRes = await makeRequest('POST', '/api/ai/heal-locator', {
    failedSelector: 'button#old-submit-btn',
    pageDOM: '<button data-testid="submit-btn">Submit</button>'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(healRes.status, 200);
  assert.ok(healRes.data.healedSelector);
  console.log(`  ✅ PASSED: Healed selector -> "${healRes.data.healedSelector}" (Confidence: ${healRes.data.confidence}%)`);

  // 8. AI Test Optimization
  console.log('\n🔹 Test 7: AI Test Suite Optimization (/api/ai/optimize-suite)');
  const optRes = await makeRequest('POST', '/api/ai/optimize-suite', {}, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(optRes.status, 200);
  assert.ok(optRes.data.optimization.estimatedTimeSavingPercentage > 0);
  console.log(`  ✅ PASSED: Suite Optimization (Time Saving: ${optRes.data.optimization.estimatedTimeSavingPercentage}%)`);

  // 9. AI Test Selection (Impact Analysis)
  console.log('\n🔹 Test 8: AI Impact-Based Test Selection (/api/ai/select-tests)');
  const selRes = await makeRequest('POST', '/api/ai/select-tests', {
    changedFiles: ['src/app/auth/login.component.ts']
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(selRes.status, 200);
  assert.ok(Array.isArray(selRes.data.impactedFeatures));
  console.log(`  ✅ PASSED: Impacted Features Identified: ${selRes.data.impactedFeatures.join(', ')}`);

  // 10. AI QA Assistant Chat
  console.log('\n🔹 Test 9: AI QA Assistant Conversational Agent (/api/ai/assistant/chat)');
  const chatRes = await makeRequest('POST', '/api/ai/assistant/chat', {
    message: 'How can I fix the flaky payment test?'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(chatRes.status, 200);
  assert.ok(chatRes.data.reply.includes('AI QA Assistant'));
  console.log(`  ✅ PASSED: AI QA Assistant Responded (${chatRes.data.reply.substring(0, 60)}...)`);

  console.log('\n================================================================');
  console.log('🎉 ALL 9 AI QA AUTOMATION SUITE TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runAISuiteTests().catch(err => {
  console.error('❌ AI Suite Test Failure:', err);
  process.exit(1);
});
