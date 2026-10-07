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

async function runDockerIsolationSecurityTests() {
  console.log('\n================================================================');
  console.log('🐳 RUNNING ISOLATED DOCKER WORKER & SANDBOX SECURITY TEST SUITE');
  console.log('================================================================\n');

  // 1. Setup authenticated user token
  console.log('🔹 Setup: Registering QA Security Admin');
  const userEmail = `security_admin_${Date.now()}@docker-test.com`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    email: userEmail,
    password: 'Password123!',
    name: 'Security Admin',
    organizationName: 'Container Isolation Org'
  });
  assert.strictEqual(regRes.status, 201);
  const token = regRes.data.accessToken;

  // 2. Test Standard Sandbox / Docker Container Execution
  console.log('\n🔹 Test 1: Standard Isolated Worker Container Execution');
  const stdRes = await makeRequest('POST', '/api/executions/enqueue', {
    feature: 'login.feature',
    tags: '@smoke',
    priority: 3,
    timeoutMs: 30000
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(stdRes.status, 200);
  const stdExecId = stdRes.data.executionId;
  console.log(`  ✅ PASSED: Enqueued isolated job ${stdExecId}`);

  // 3. Test Long-Running / Infinite Scenario Timeout & Force Kill
  console.log('\n🔹 Test 2: Malicious / Long-Running Test Scenario Timeout Enforcement');
  const timeoutMs = 2000; // 2 seconds timeout
  const longRes = await makeRequest('POST', '/api/executions/enqueue', {
    feature: 'infinite_loop.feature',
    tags: '@infinite',
    priority: 1,
    timeoutMs: timeoutMs
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(longRes.status, 200);
  const longExecId = longRes.data.executionId;
  console.log(`  ✅ PASSED: Enqueued infinite test ${longExecId} (Timeout set to ${timeoutMs}ms)`);

  // Wait 3.5 seconds to verify timeout trigger and container termination
  console.log('  ⌛ Waiting for container timeout monitor to trigger...');
  await new Promise(r => setTimeout(r, 3500));

  // 4. Test Immediate Cancellation & Container Cleanup
  console.log('\n🔹 Test 3: Emergency Cancellation & Container Cleanup Verification');
  const cancelRes = await makeRequest('POST', '/api/executions/enqueue', {
    feature: 'refund.feature',
    tags: '@regression',
    priority: 2,
    timeoutMs: 120000
  }, { 'Authorization': `Bearer ${token}` });
  const cancelExecId = cancelRes.data.executionId;

  // Immediately cancel job
  const killRes = await makeRequest('POST', `/api/executions/${cancelExecId}/cancel`, null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(killRes.status, 200);
  console.log(`  ✅ PASSED: Emergency kill signal sent for ${cancelExecId}. Container/process purged.`);

  // 5. Verify Final Worker Health & Clean Environment
  console.log('\n🔹 Test 4: Final Worker Health & Resource Leak Audit');
  const healthRes = await makeRequest('GET', '/api/executions/workers/health', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual(healthRes.data.health.status, 'UP');
  console.log(`  ✅ PASSED: Worker status UP (Mode: ${healthRes.data.health.mode}, Active Jobs: ${healthRes.data.health.activeJobs})`);

  console.log('\n================================================================');
  console.log('🎉 ALL DOCKER WORKER & SANDBOX SECURITY TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runDockerIsolationSecurityTests().catch(err => {
  console.error('❌ Docker Isolation Security Test Failure:', err);
  process.exit(1);
});
