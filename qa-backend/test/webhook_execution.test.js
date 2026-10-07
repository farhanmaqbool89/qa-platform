const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const API_KEY = 'qa_sec_default_token';

function makeRequest(options, payload = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', err => reject(err));

    if (payload) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

async function run() {
  console.log('=== STARTING CI/CD WEBHOOK INTEGRATION TESTS ===');

  // 1. Invalid API Key Rejected (401)
  const opt1 = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/webhooks/trigger-test',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'invalid_key_token'
    }
  };
  const res1 = await makeRequest(opt1, { feature: 'login.feature' });
  assert.strictEqual(res1.status, 401, 'Invalid API Key must return 401 Unauthorized');
  assert.strictEqual(res1.body.success, false, 'Invalid API Key response must indicate failure');
  console.log('✅ Invalid API Key successfully rejected (401).');

  // 2. Invalid Feature Path Traversal Rejected (400)
  const opt2 = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/webhooks/trigger-test',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    }
  };
  const res2 = await makeRequest(opt2, { feature: '../../sensitive_file.txt' });
  assert.strictEqual(res2.status, 400, 'Path traversal feature path must return 400 Bad Request');
  assert.strictEqual(res2.body.success, false, 'Path traversal response must indicate failure');
  console.log('✅ Path traversal attempt successfully rejected (400).');

  // 3. Valid Webhook Trigger Execution (200)
  const payload = {
    feature: 'locator_healing.feature',
    projectName: 'Webhook_Test_Project',
    environment: 'staging',
    browserMode: 'headless'
  };
  const opt3 = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/webhooks/trigger-test',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    }
  };
  console.log('Dispatching valid webhook trigger...');
  const res3 = await makeRequest(opt3, payload);
  assert.strictEqual(res3.status, 200, 'Valid webhook trigger must return 200 OK');
  assert.ok(res3.body.triggerId, 'Response must contain a triggerId');
  const triggerId = res3.body.triggerId;
  console.log(`✅ Webhook trigger accepted. Created execution: ${triggerId}`);

  // 4. Poll Telemetry Status Endpoint (GET /api/v1/executions/:id)
  const optStatus = {
    hostname: 'localhost',
    port: PORT,
    path: `/api/v1/executions/${triggerId}`,
    method: 'GET'
  };

  console.log(`Polling execution status for ${triggerId}...`);
  let status = 'RUNNING';
  let retries = 30; // 30 seconds max timeout
  while (status === 'RUNNING' && retries > 0) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const statusRes = await makeRequest(optStatus);
    assert.strictEqual(statusRes.status, 200, 'Status endpoint must return 200 OK');
    status = statusRes.body.execution.status;
    console.log(`   • Status: ${status}`);
    retries--;
  }

  assert.ok(status === 'SUCCESS' || status === 'FAILED', 'Execution failed to reach final state');
  console.log(`✅ Telemetry status transitioned to final state: ${status}`);

  // 5. Verify Artifacts & Logs Persistance
  const artifactDir = path.join(__dirname, '../artifacts', String(triggerId));
  const analysisPath = path.join(artifactDir, 'analysis', 'failure-analysis.json');
  const evidencePath = path.join(artifactDir, 'analysis', 'evidence.json');
  
  assert.ok(fs.existsSync(analysisPath), 'Failure analysis artifact JSON must be written to disk');
  assert.ok(fs.existsSync(evidencePath), 'Evidence collector artifact JSON must be written to disk');
  
  const analysisReport = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  assert.strictEqual(analysisReport.status, 'FAILED', 'Analysis report status mismatch');
  assert.ok(analysisReport.locatorHealing, 'Analysis report must contain locatorHealing suggestions');
  console.log('✅ Telemetry, analysis report, and artifact directory successfully verified on disk.');

  console.log('=== ALL CI/CD WEBHOOK INTEGRATION TESTS PASSED ===');
}

run().catch(err => {
  console.error('❌ Webhook integration tests failed:', err.stack);
  process.exit(1);
});
