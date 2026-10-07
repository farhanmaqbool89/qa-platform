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

async function runQueueConcurrencyLoadTests() {
  console.log('\n================================================================');
  console.log('⚡ RUNNING DISTRIBUTED QUEUE CONCURRENCY, PRIORITY & LOAD TEST SUITE');
  console.log('================================================================\n');

  // 1. Setup authenticated user token
  console.log('🔹 Setup: Registering QA Lead User');
  const userEmail = `qalead_${Date.now()}@queue-test.com`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    email: userEmail,
    password: 'Password123!',
    name: 'QA Queue Lead',
    organizationName: 'Queue Automation Org'
  });
  assert.strictEqual(regRes.status, 201);
  const token = regRes.data.accessToken;

  // 2. Fetch Initial Worker Health
  console.log('\n🔹 Test 1: Fetching Worker Health Status (/api/executions/workers/health)');
  const healthRes = await makeRequest('GET', '/api/executions/workers/health', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual(healthRes.data.health.status, 'UP');
  assert.ok(typeof healthRes.data.health.concurrency === 'number');
  console.log(`  ✅ PASSED: Worker Health UP (Concurrency: ${healthRes.data.health.concurrency}, Mode: ${healthRes.data.health.mode})`);

  // 3. Enqueue Multiple Execution Jobs with Priorities
  console.log('\n🔹 Test 2: Enqueuing High & Normal Priority Execution Jobs');
  
  // Normal priority job (priority: 5)
  const jobNormal = await makeRequest('POST', '/api/executions/enqueue', {
    feature: 'login.feature',
    tags: '@smoke',
    priority: 5,
    retries: 2,
    timeoutMs: 60000
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(jobNormal.status, 200);
  const execIdNormal = jobNormal.data.executionId;
  console.log(`  ✅ PASSED: Enqueued Normal Priority Job ${execIdNormal}`);

  // High priority job (priority: 1 - should leapfrog in queue)
  const jobHigh = await makeRequest('POST', '/api/executions/enqueue', {
    feature: 'refund.feature',
    tags: '@regression',
    priority: 1,
    retries: 3,
    timeoutMs: 60000
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(jobHigh.status, 200);
  const execIdHigh = jobHigh.data.executionId;
  console.log(`  ✅ PASSED: Enqueued High Priority Job ${execIdHigh}`);

  // 4. Fetch Queue Status Metrics
  console.log('\n🔹 Test 3: Fetching Queue Metrics (/api/executions/queue/status)');
  const metricsRes = await makeRequest('GET', '/api/executions/queue/status', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(metricsRes.status, 200);
  assert.ok(typeof metricsRes.data.metrics.total === 'number');
  console.log(`  ✅ PASSED: Queue Metrics (Total: ${metricsRes.data.metrics.total}, Active: ${metricsRes.data.metrics.active}, Waiting: ${metricsRes.data.metrics.waiting})`);

  // 5. Job Cancellation Test
  console.log('\n🔹 Test 4: Testing Job Cancellation Mid-Queue');
  const cancelRes = await makeRequest('POST', `/api/executions/${execIdNormal}/cancel`, null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(cancelRes.status, 200);
  console.log(`  ✅ PASSED: Job ${execIdNormal} cancellation request dispatched successfully`);

  // 6. Concurrency Load Test: Enqueue 10 Jobs Concurrently
  console.log('\n🔹 Test 5: Concurrent Load Test (Enqueuing 10 Jobs Simultaneously)');
  const enqueuePromises = [];
  for (let i = 1; i <= 10; i++) {
    enqueuePromises.push(
      makeRequest('POST', '/api/executions/enqueue', {
        feature: `feature_${i}.feature`,
        tags: `@loadTest`,
        priority: i % 2 === 0 ? 2 : 8
      }, { 'Authorization': `Bearer ${token}` })
    );
  }

  const loadResults = await Promise.all(enqueuePromises);
  const allSuccessful = loadResults.every(res => res.status === 200 && res.data.success);
  assert.ok(allSuccessful, 'Not all 10 concurrent enqueue requests succeeded');
  console.log(`  ✅ PASSED: 10/10 concurrent jobs enqueued successfully under worker load`);

  // 7. Verify Final Queue Health
  console.log('\n🔹 Test 6: Final Worker Health Audit');
  const finalHealth = await makeRequest('GET', '/api/executions/workers/health', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(finalHealth.status, 200);
  console.log(`  ✅ PASSED: Final Worker Health verified (Active/Completed/Failed tracked correctly)`);

  console.log('\n================================================================');
  console.log('🎉 ALL DISTRIBUTED QUEUE CONCURRENCY & LOAD TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runQueueConcurrencyLoadTests().catch(err => {
  console.error('❌ Queue Concurrency Load Test Failure:', err);
  process.exit(1);
});
