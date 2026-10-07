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

async function runAnalyticsReportingTests() {
  console.log('\n================================================================');
  console.log('📊 RUNNING ADVANCED ANALYTICS & EXECUTIVE REPORTING TEST SUITE');
  console.log('================================================================\n');

  // 1. Setup User Token
  console.log('🔹 Setup: Registering VP of Quality User');
  const userEmail = `vp_quality_${Date.now()}@analytics-test.com`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    email: userEmail,
    password: 'Password123!',
    name: 'VP of Quality',
    organizationName: 'Quality Metrics Corp'
  });
  assert.strictEqual(regRes.status, 201);
  const token = regRes.data.accessToken;

  // 2. Flaky Tests Engine
  console.log('\n🔹 Test 1: Flaky Test Analytics (/api/analytics/flaky)');
  const flakyRes = await makeRequest('GET', '/api/analytics/flaky', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(flakyRes.status, 200);
  assert.ok(flakyRes.data.flakyScenariosCount > 0);
  console.log(`  ✅ PASSED: Identified ${flakyRes.data.flakyScenariosCount} Flaky Scenarios (Top score: ${flakyRes.data.flakyScenarios[0].flakinessScore}%)`);

  // 3. Visual Testing Engine
  console.log('\n🔹 Test 2: Visual Snapshot Comparison (/api/analytics/visual/compare)');
  const visRes = await makeRequest('POST', '/api/analytics/visual/compare', {
    baselineImagePath: '/artifacts/baseline_login.png',
    currentImagePath: '/artifacts/current_login.png'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(visRes.status, 200);
  assert.strictEqual(visRes.data.comparison.status, 'MATCHED');
  console.log(`  ✅ PASSED: Visual Diff Status: ${visRes.data.comparison.status} (Diff Ratio: ${visRes.data.comparison.diffPercentage})`);

  // 4. API Testing Engine
  console.log('\n🔹 Test 3: API Endpoint Test Execution (/api/analytics/api-test/run)');
  const apiRes = await makeRequest('POST', '/api/analytics/api-test/run', {
    url: 'https://api.qa-platform.local/v1/health',
    method: 'GET',
    expectedStatus: 200
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(apiRes.status, 200);
  assert.strictEqual(apiRes.data.apiTestResult.actualStatus, 200);
  console.log(`  ✅ PASSED: API Endpoint Test Passed (${apiRes.data.apiTestResult.latencyMs}ms Latency)`);

  // 5. Accessibility Audit Summary Engine
  console.log('\n🔹 Test 4: Accessibility Summary (/api/analytics/accessibility)');
  const a11yRes = await makeRequest('GET', '/api/analytics/accessibility', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(a11yRes.status, 200);
  assert.ok(a11yRes.data.accessibility.overallScore > 0);
  console.log(`  ✅ PASSED: Accessibility Score: ${a11yRes.data.accessibility.overallScore}/100 (${a11yRes.data.accessibility.standard})`);

  // 6. Test Coverage Engine
  console.log('\n🔹 Test 5: Test Coverage Calculation (/api/analytics/coverage)');
  const covRes = await makeRequest('GET', '/api/analytics/coverage', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(covRes.status, 200);
  assert.ok(covRes.data.coverage.requirementsCoveragePercentage > 0);
  console.log(`  ✅ PASSED: Requirements Coverage: ${covRes.data.coverage.requirementsCoveragePercentage}% (Automated Ratio: ${covRes.data.coverage.automatedTestRatioPercentage}%)`);

  // 7. Composite Quality Score Engine
  console.log('\n🔹 Test 6: Composite Quality Index Score (/api/analytics/quality-score)');
  const qualRes = await makeRequest('GET', '/api/analytics/quality-score', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(qualRes.status, 200);
  assert.ok(qualRes.data.qualityScore.score > 0);
  console.log(`  ✅ PASSED: Overall Quality Score: ${qualRes.data.qualityScore.score}/100 (Grade: ${qualRes.data.qualityScore.grade})`);

  // 8. Release Readiness Engine
  console.log('\n🔹 Test 7: Release Readiness Go/No-Go Gate Evaluator (/api/analytics/release-readiness)');
  const readinessRes = await makeRequest('GET', '/api/analytics/release-readiness?version=v2.1.0', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(readinessRes.status, 200);
  assert.strictEqual(readinessRes.data.releaseReadiness.decision, 'READY_TO_SHIP');
  console.log(`  ✅ PASSED: Release Decision: ${readinessRes.data.releaseReadiness.decision} (${readinessRes.data.releaseReadiness.gatesPassed}/${readinessRes.data.releaseReadiness.totalGates} Gates Passed)`);

  // 9. Executive Reports Engine
  console.log('\n🔹 Test 8: C-Level Executive Dashboard Report (/api/analytics/executive-report)');
  const execRes = await makeRequest('GET', '/api/analytics/executive-report', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(execRes.status, 200);
  assert.ok(Array.isArray(execRes.data.executiveReport.keyHighlights));
  console.log(`  ✅ PASSED: Executive Report Generated (Monthly Cost Savings: ${execRes.data.executiveReport.roiMetrics.costSavingsMonthlyUsd})`);

  console.log('\n================================================================');
  console.log('🎉 ALL 8 ADVANCED ANALYTICS & EXECUTIVE REPORTING TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runAnalyticsReportingTests().catch(err => {
  console.error('❌ Analytics Reporting Test Failure:', err);
  process.exit(1);
});
