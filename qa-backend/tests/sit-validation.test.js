const http = require('http');
const assert = require('assert');
const { execSync, spawn } = require('child_process');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:3000';
let testFailures = 0;
let testPasses = 0;
let serverProcess = null;

function logPass(msg) {
  testPasses++;
  console.log(`  ✅ PASSED: ${msg}`);
}

function logFail(msg, err) {
  testFailures++;
  console.error(`  ❌ FAILED: ${msg} ->`, err?.message || err);
}

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
        'X-Dashboard-Client': 'true',
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
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: responseBody });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function ensureBackendRunning() {
  try {
    const health = await makeRequest('GET', '/api/health');
    if (health.status === 200) {
      console.log('⚡ Backend server is already running on http://localhost:3000');
      return;
    }
  } catch (e) {
    // Server not running, spawn it
  }

  console.log('🚀 Launching backend server (index.js) for SIT validation...');
  serverProcess = spawn('node', ['index.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });

  // Wait for server startup
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const health = await makeRequest('GET', '/api/health');
      if (health.status === 200) break;
    } catch (e) {}
  }
}

async function runBackendSITSuite() {
  console.log('\n================================================================');
  console.log('🚀 QA PLATFORM SYSTEM INTEGRATION TESTING (SIT) - PHASE 1 → 6.1');
  console.log('================================================================\n');

  await ensureBackendRunning();

  // Test Group 1: Core System & Feature Engine (Phase 1)
  console.log('\n🔹 [Group 1] Phase 1 - Core Health & Execution Engine Endpoints');
  try {
    const health = await makeRequest('GET', '/api/health');
    assert.strictEqual(health.status, 200, 'Health endpoint status 200');
    assert.strictEqual(health.data.status, 'ok', 'Health status ok');
    logPass('GET /api/health returned 200 OK');
  } catch (err) {
    logFail('GET /api/health failed', err);
  }

  try {
    const features = await makeRequest('GET', '/api/features');
    assert.strictEqual(features.status, 200, 'Features endpoint status 200');
    assert.strictEqual(features.data.success, true, 'Features success flag true');
    assert.ok(Array.isArray(features.data.features), 'Features array returned');
    logPass(`GET /api/features returned ${features.data.features.length} feature files`);
  } catch (err) {
    logFail('GET /api/features failed', err);
  }

  // Test Group 2: Execution Management & Artifact Handling (Phase 2)
  console.log('\n🔹 [Group 2] Phase 2 - Execution Artifacts & Management');
  try {
    const artifacts = await makeRequest('GET', '/api/executions/sit-test-run/artifacts');
    assert.strictEqual(artifacts.status, 200, 'Artifacts endpoint status 200');
    assert.strictEqual(artifacts.data.success, true);
    assert.ok(artifacts.data.artifacts.screenshots, 'Screenshots array present');
    assert.ok(artifacts.data.artifacts.videos, 'Videos array present');
    assert.ok(artifacts.data.artifacts.traces, 'Traces array present');
    logPass('GET /api/executions/:id/artifacts structure validated');
  } catch (err) {
    logFail('GET /api/executions/:id/artifacts failed', err);
  }

  try {
    const cancelRes = await makeRequest('POST', '/api/executions/non-existent-id/cancel');
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.data.success, true);
    logPass('POST /api/executions/:id/cancel handled gracefully when process not active');
  } catch (err) {
    logFail('POST /api/executions/:id/cancel failed', err);
  }

  // Test Group 3: WCAG Accessibility Engine (Phase 3)
  console.log('\n🔹 [Group 3] Phase 3 - WCAG Accessibility Engine');
  try {
    const reports = await makeRequest('GET', '/api/accessibility/reports');
    assert.strictEqual(reports.status, 200);
    assert.strictEqual(reports.data.success, true);
    assert.ok(Array.isArray(reports.data.reports), 'Reports array returned');
    logPass(`GET /api/accessibility/reports returned ${reports.data.reports.length} audit reports`);
  } catch (err) {
    logFail('GET /api/accessibility/reports failed', err);
  }

  try {
    const scanRes = await makeRequest('POST', '/api/accessibility/scan', {
      url: 'https://example.com',
      standard: 'wcag21aa'
    });
    assert.strictEqual(scanRes.status, 200);
    assert.strictEqual(scanRes.data.success, true);
    assert.ok(typeof scanRes.data.report.score === 'number', 'A11y score is a number');
    assert.ok(Array.isArray(scanRes.data.report.complianceChecklist), 'Checklist present');
    logPass(`POST /api/accessibility/scan generated report with Score: ${scanRes.data.report.score}/100`);
  } catch (err) {
    logFail('POST /api/accessibility/scan failed', err);
  }

  // Test Group 4: Reporting & Analytics (Phase 4)
  console.log('\n🔹 [Group 4] Phase 4 - Reporting & Analytics');
  try {
    const summary = await makeRequest('GET', '/api/reports/summary');
    assert.strictEqual(summary.status, 200);
    assert.strictEqual(summary.data.success, true);
    assert.ok(summary.data.summary.totalExecutions >= 0);
    logPass(`GET /api/reports/summary returned totalExecutions=${summary.data.summary.totalExecutions}, passRate=${summary.data.summary.passRate}%`);
  } catch (err) {
    logFail('GET /api/reports/summary failed', err);
  }

  try {
    const trends = await makeRequest('GET', '/api/reports/trends');
    assert.strictEqual(trends.status, 200);
    assert.strictEqual(trends.data.success, true);
    assert.strictEqual(trends.data.trends.length, 7, '7 days trends returned');
    logPass('GET /api/reports/trends returned 7-day trend array');
  } catch (err) {
    logFail('GET /api/reports/trends failed', err);
  }

  try {
    const flaky = await makeRequest('GET', '/api/reports/flaky');
    assert.strictEqual(flaky.status, 200);
    assert.strictEqual(flaky.data.success, true);
    assert.ok(Array.isArray(flaky.data.flakyTests), 'Flaky tests array returned');
    logPass(`GET /api/reports/flaky returned ${flaky.data.flakyTests.length} unstable scenarios`);
  } catch (err) {
    logFail('GET /api/reports/flaky failed', err);
  }

  try {
    const a11yTrends = await makeRequest('GET', '/api/reports/accessibility-trends');
    assert.strictEqual(a11yTrends.status, 200);
    assert.strictEqual(a11yTrends.data.success, true);
    logPass('GET /api/reports/accessibility-trends returned score history');
  } catch (err) {
    logFail('GET /api/reports/accessibility-trends failed', err);
  }

  // Test Group 5: CI/CD Integration, Webhooks & Telemetry (Phase 5)
  console.log('\n🔹 [Group 5] Phase 5 - CI/CD Integration & Telemetry');
  try {
    const keysRes = await makeRequest('GET', '/api/v1/auth/keys');
    assert.strictEqual(keysRes.status, 200);
    assert.strictEqual(keysRes.data.success, true);
    assert.ok(Array.isArray(keysRes.data.activeKeys));
    logPass(`GET /api/v1/auth/keys returned ${keysRes.data.activeKeys.length} active API keys`);
  } catch (err) {
    logFail('GET /api/v1/auth/keys failed', err);
  }

  try {
    const genKeyRes = await makeRequest('POST', '/api/v1/auth/keys');
    assert.strictEqual(genKeyRes.status, 200);
    assert.strictEqual(genKeyRes.data.success, true);
    assert.ok(genKeyRes.data.apiKey.startsWith('qa_sec_'));
    logPass(`POST /api/v1/auth/keys generated key: ${genKeyRes.data.apiKey}`);
  } catch (err) {
    logFail('POST /api/v1/auth/keys failed', err);
  }

  try {
    const triggerTest = await makeRequest('POST', '/api/webhooks/trigger-test', {
      feature: 'features/login.feature',
      tags: '@smoke',
      environment: 'staging',
      branch: 'main',
      commitSha: 'a1b2c3d'
    });
    assert.strictEqual(triggerTest.status, 200);
    assert.strictEqual(triggerTest.data.success, true);
    assert.ok(triggerTest.data.triggerId.startsWith('WHK-'));
    logPass(`POST /api/webhooks/trigger-test returned triggerId: ${triggerTest.data.triggerId}`);
  } catch (err) {
    logFail('POST /api/webhooks/trigger-test failed', err);
  }

  try {
    const historyRes = await makeRequest('GET', '/api/webhooks/history');
    assert.strictEqual(historyRes.status, 200);
    assert.strictEqual(historyRes.data.success, true);
    assert.ok(Array.isArray(historyRes.data.history));
    logPass(`GET /api/webhooks/history returned ${historyRes.data.history.length} telemetry log items`);
  } catch (err) {
    logFail('GET /api/webhooks/history failed', err);
  }

  try {
    const execFiltered = await makeRequest('GET', '/api/v1/executions?sourceOrigin=CLI');
    assert.strictEqual(execFiltered.status, 200);
    assert.strictEqual(execFiltered.data.success, true);
    logPass('GET /api/v1/executions with sourceOrigin query filter succeeded');
  } catch (err) {
    logFail('GET /api/v1/executions failed', err);
  }

  // Test Group 6: AI Evidence-Based Failure Analysis Engine (Phase 6.1)
  console.log('\n🔹 [Group 6] Phase 6.1 - Evidence-Based Failure Analysis Engine');
  try {
    const analyzeRes = await makeRequest('POST', '/api/executions/901/analyze', {
      logs: ["TypeError: Cannot read properties of undefined (reading 'goto')"],
      failureReason: "TypeError: Cannot read properties of undefined (reading 'goto')",
      stackTrace: "at CustomWorld.<anonymous> (steps/login.steps.js:13:10)"
    });
    assert.strictEqual(analyzeRes.status, 200);
    assert.strictEqual(analyzeRes.data.success, true);
    const analysis = analyzeRes.data.analysis;
    assert.strictEqual(analysis.failureCategory, 'PLAYWRIGHT_CONTEXT');
    assert.strictEqual(analysis.issueOrigin, 'TEST_SCRIPT_ISSUE');
    assert.ok(analysis.confidence > 0, 'Confidence score calculated');
    assert.ok(Array.isArray(analysis.observedFacts), 'Observed facts array present');
    assert.ok(typeof analysis.technicalInference === 'string', 'Technical inference string present');
    assert.ok(analysis.categorizedRecommendations, 'Categorized recommendations present');
    logPass(`POST /api/executions/:id/analyze correctly classified failure as ${analysis.failureCategory} (Confidence: ${analysis.confidence}%)`);
  } catch (err) {
    logFail('POST /api/executions/:id/analyze failed', err);
  }

  try {
    const getAnalysisRes = await makeRequest('GET', '/api/executions/901/analysis');
    assert.strictEqual(getAnalysisRes.status, 200);
    assert.strictEqual(getAnalysisRes.data.success, true);
    assert.strictEqual(getAnalysisRes.data.analysis.executionId, 901);
    logPass('GET /api/executions/:id/analysis fetched persisted failure analysis artifact');
  } catch (err) {
    logFail('GET /api/executions/:id/analysis failed', err);
  }

  // Test Group 7: Official CLI Wrapper Test
  console.log('\n🔹 [Group 7] Official CLI Wrapper (`qa-platform.js`) Verification');
  try {
    const cliOutput = execSync('node bin/qa-platform.js run --feature features/login.feature --tags @smoke', {
      cwd: path.join(__dirname, '..')
    }).toString();
    assert.ok(cliOutput.includes('Execution Triggered Successfully'));
    logPass('npx qa-platform run command executed cleanly');
  } catch (err) {
    logFail('qa-platform CLI run command failed', err);
  }

  // Final Summary
  console.log('\n================================================================');
  console.log(`📊 SIT VALIDATION COMPLETE: ${testPasses} PASSED | ${testFailures} FAILED`);
  console.log('================================================================\n');

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }

  if (testFailures > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runBackendSITSuite();
