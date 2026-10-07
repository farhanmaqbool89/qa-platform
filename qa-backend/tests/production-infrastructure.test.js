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

async function runProductionInfrastructureTests() {
  console.log('\n================================================================');
  console.log('🏭 RUNNING PRODUCTION INFRASTRUCTURE & HEALTH PROBES TEST SUITE');
  console.log('================================================================\n');

  // 1. Health Probe
  console.log('🔹 Test 1: Health Probe (/api/health)');
  const healthRes = await makeRequest('GET', '/api/health');
  assert.strictEqual(healthRes.status, 200);
  assert.ok(healthRes.data.dependencies);
  console.log(`  ✅ PASSED: Health Status (${healthRes.data.status}, Env: ${healthRes.data.environment})`);

  // 2. Liveness Probe
  console.log('\n🔹 Test 2: Liveness Probe (/api/health/live)');
  const liveRes = await makeRequest('GET', '/api/health/live');
  assert.strictEqual(liveRes.status, 200);
  assert.strictEqual(liveRes.data.status, 'alive');
  console.log(`  ✅ PASSED: Liveness Status (alive)`);

  // 3. Readiness Probe
  console.log('\n🔹 Test 3: Readiness Probe (/api/health/ready)');
  const readyRes = await makeRequest('GET', '/api/health/ready');
  assert.strictEqual(readyRes.status, 200);
  assert.ok(readyRes.data.dependencies);
  console.log(`  ✅ PASSED: Readiness Status (${readyRes.data.status})`);

  // 4. Verify Strict Production Enforce Logic
  console.log('\n🔹 Test 4: Verify Production Infrastructure Strictness Logic');
  const oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const dockerRunnerService = require('../services/docker-runner.service');
  const queueService = require('../services/queue.service');

  let dockerFailedAsExpected = false;
  try {
    if (!dockerRunnerService.isDockerAvailable) {
      await dockerRunnerService.runInContainer({ executionId: 'test_prod_101' });
    }
  } catch (err) {
    if (err.message.includes('Production Error') || err.message.includes('Docker execution container is required')) {
      dockerFailedAsExpected = true;
    }
  }
  assert.ok(dockerFailedAsExpected || dockerRunnerService.isDockerAvailable, 'Production mode must reject host process sandbox fallback when Docker is offline.');
  console.log(`  ✅ PASSED: Production Docker Fallback Guard Enforced`);

  let queueFailedAsExpected = false;
  try {
    if (!queueService.queue) {
      await queueService.enqueue({ executionId: 'test_prod_102' });
    }
  } catch (err) {
    if (err.message.includes('Production Error') || err.message.includes('Redis/BullMQ queue is required')) {
      queueFailedAsExpected = true;
    }
  }
  assert.ok(queueFailedAsExpected || queueService.queue, 'Production mode must reject in-memory queue fallback when Redis is offline.');
  console.log(`  ✅ PASSED: Production Queue Fallback Guard Enforced`);

  // Restore NODE_ENV
  process.env.NODE_ENV = oldEnv;

  console.log('\n================================================================');
  console.log('🎉 ALL PRODUCTION INFRASTRUCTURE & PROBES TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runProductionInfrastructureTests().catch(err => {
  console.error('❌ Production Infrastructure Test Failure:', err);
  process.exit(1);
});
