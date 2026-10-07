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

async function runTestManagementRtmTests() {
  console.log('\n================================================================');
  console.log('📋 RUNNING TEST MANAGEMENT & REQUIREMENTS TRACEABILITY MATRIX (RTM) SUITE');
  console.log('================================================================\n');

  // 1. Setup User Token
  console.log('🔹 Setup: Registering QA Lead User');
  const userEmail = `rtm_lead_${Date.now()}@tm-test.com`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    email: userEmail,
    password: 'Password123!',
    name: 'RTM QA Lead',
    organizationName: 'Enterprise Test Mgmt Org'
  });
  assert.strictEqual(regRes.status, 201);
  const token = regRes.data.accessToken;

  // 2. Create Requirement
  console.log('\n🔹 Test 1: Create Requirement (/api/requirements)');
  const reqRes = await makeRequest('POST', '/api/requirements', {
    title: 'User Authentication & Single Sign-On',
    description: 'System must support OAuth2 & SAML SSO login',
    externalKey: 'JIRA-101',
    status: 'OPEN'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(reqRes.status, 200);
  const reqId = reqRes.data.requirement.id;
  console.log(`  ✅ PASSED: Requirement created (ID: ${reqId}, Key: JIRA-101)`);

  // 3. Create Manual Test Case linked to Requirement
  console.log('\n🔹 Test 2: Create Manual Test Case (/api/test-cases)');
  const tcRes = await makeRequest('POST', '/api/test-cases', {
    title: 'Verify valid login credentials redirect to Dashboard',
    description: 'Enter valid email/password and click submit',
    priority: 'HIGH',
    severity: 'CRITICAL',
    automationStatus: 'MANUAL',
    requirementId: reqId
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(tcRes.status, 200);
  const tcId = tcRes.data.testCase.id;
  console.log(`  ✅ PASSED: Manual Test Case created (ID: ${tcId}, Linked Req: ${reqId})`);

  // 4. Create Test Suite
  console.log('\n🔹 Test 3: Create Test Suite (/api/test-suites)');
  const suiteRes = await makeRequest('POST', '/api/test-suites', {
    name: 'Core Auth Regression Suite',
    description: 'Full verification suite for login, session management & SSO',
    tags: '@smoke and @auth'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(suiteRes.status, 200);
  const suiteId = suiteRes.data.testSuite.id;
  console.log(`  ✅ PASSED: Test Suite created (ID: ${suiteId})`);

  // 5. Create Test Plan
  console.log('\n🔹 Test 4: Create Test Plan (/api/test-plans)');
  const planRes = await makeRequest('POST', '/api/test-plans', {
    name: 'Q3 Major Release Verification Plan',
    description: 'Execution plan for Q3 Sprint Release 2.1.0',
    status: 'PLANNED',
    startDate: new Date().toISOString()
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(planRes.status, 200);
  const planId = planRes.data.testPlan.id;
  console.log(`  ✅ PASSED: Test Plan created (ID: ${planId})`);

  // 6. Create Release
  console.log('\n🔹 Test 5: Create Release (/api/releases)');
  const relRes = await makeRequest('POST', '/api/releases', {
    version: 'v2.1.0',
    name: 'Q3 Enterprise Release',
    description: 'Includes SaaS Multi-Tenancy & BullMQ Distributed Engine',
    status: 'IN_PROGRESS',
    releaseDate: new Date(Date.now() + 864000000).toISOString()
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(relRes.status, 200);
  const releaseId = relRes.data.release.id;
  console.log(`  ✅ PASSED: Release created (ID: ${releaseId}, Version: v2.1.0)`);

  // 7. Generate RTM Matrix & Verify Summary Metrics
  console.log('\n🔹 Test 6: Generate Requirements Traceability Matrix (RTM) (/api/rtm)');
  const rtmRes = await makeRequest('GET', '/api/rtm', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(rtmRes.status, 200);
  assert.ok(rtmRes.data.rtm.summary);
  assert.ok(Array.isArray(rtmRes.data.rtm.matrix));
  console.log(`  ✅ PASSED: RTM Generated (Coverage: ${rtmRes.data.rtm.summary.coveragePercentage}%, Reqs: ${rtmRes.data.rtm.summary.totalRequirements})`);

  console.log('\n================================================================');
  console.log('🎉 ALL TEST MANAGEMENT & RTM TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runTestManagementRtmTests().catch(err => {
  console.error('❌ Test Management RTM Test Failure:', err);
  process.exit(1);
});
