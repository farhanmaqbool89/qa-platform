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

async function runIntegrationHubTests() {
  console.log('\n================================================================');
  console.log('🔌 RUNNING ENTERPRISE INTEGRATIONS & SCHEDULING TEST SUITE');
  console.log('================================================================\n');

  // 1. Setup User Token
  console.log('🔹 Setup: Registering DevOps Lead User');
  const userEmail = `devops_${Date.now()}@integration-test.com`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    email: userEmail,
    password: 'Password123!',
    name: 'DevOps Lead',
    organizationName: 'Enterprise Integrations Org'
  });
  assert.strictEqual(regRes.status, 201);
  const token = regRes.data.accessToken;

  // 2. GitHub Sync
  console.log('\n🔹 Test 1: GitHub PR Status Sync (/api/integrations/github/sync)');
  const ghRes = await makeRequest('POST', '/api/integrations/github/sync', {
    repo: 'qa-org/qa-suite',
    prNumber: 42,
    commitSha: 'c92a10d',
    status: 'PASSED'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(ghRes.status, 200);
  assert.strictEqual(ghRes.data.provider, 'GitHub');
  console.log(`  ✅ PASSED: GitHub Status Check Updated (${ghRes.data.statusCheck})`);

  // 3. GitLab Sync
  console.log('\n🔹 Test 2: GitLab MR Status Sync (/api/integrations/gitlab/sync)');
  const glRes = await makeRequest('POST', '/api/integrations/gitlab/sync', {
    projectId: 'qa-backend',
    mrId: 18,
    commitSha: 'c92a10d',
    status: 'PASSED'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(glRes.status, 200);
  assert.strictEqual(glRes.data.provider, 'GitLab');
  console.log(`  ✅ PASSED: GitLab Pipeline Status Updated (${glRes.data.status})`);

  // 4. Jira Defect Sync
  console.log('\n🔹 Test 3: Jira Defect Creation (/api/integrations/jira/defect)');
  const jiraRes = await makeRequest('POST', '/api/integrations/jira/defect', {
    summary: 'Payment timeout bug under heavy load',
    description: 'Playwright context timeout on /checkout endpoint',
    priority: 'HIGH'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(jiraRes.status, 200);
  assert.ok(jiraRes.data.issueKey);
  console.log(`  ✅ PASSED: Jira Defect Created (${jiraRes.data.issueKey})`);

  // 5. Slack Notification
  console.log('\n🔹 Test 4: Slack Alert Dispatch (/api/integrations/slack/notify)');
  const slackRes = await makeRequest('POST', '/api/integrations/slack/notify', {
    webhookUrl: 'https://hooks.slack.com/services/test/mock',
    executionData: { executionId: 'exec_101', status: 'PASSED' }
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(slackRes.status, 200);
  assert.strictEqual(slackRes.data.provider, 'Slack');
  console.log(`  ✅ PASSED: Slack Notification Dispatched (${slackRes.data.channel})`);

  // 6. Microsoft Teams Notification
  console.log('\n🔹 Test 5: Microsoft Teams Alert Dispatch (/api/integrations/teams/notify)');
  const teamsRes = await makeRequest('POST', '/api/integrations/teams/notify', {
    webhookUrl: 'https://outlook.office.com/webhook/test',
    executionData: { executionId: 'exec_101', status: 'PASSED' }
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(teamsRes.status, 200);
  assert.strictEqual(teamsRes.data.provider, 'Microsoft Teams');
  console.log(`  ✅ PASSED: Teams Notification Dispatched`);

  // 7. Email Report Dispatch
  console.log('\n🔹 Test 6: Email Execution Report Dispatch (/api/integrations/email/send)');
  const emailRes = await makeRequest('POST', '/api/integrations/email/send', {
    recipientEmail: 'qa-team@company.com',
    executionData: { executionId: 'exec_101', status: 'PASSED' }
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(emailRes.status, 200);
  assert.strictEqual(emailRes.data.provider, 'Email');
  console.log(`  ✅ PASSED: Email Report Dispatched to ${emailRes.data.recipient}`);

  // 8. Schedule Creation & Listing
  console.log('\n🔹 Test 7: Create & List Automated Schedules (/api/schedules)');
  const schedRes = await makeRequest('POST', '/api/schedules', {
    name: 'Nightly Full Regression Run',
    cronExpression: '0 2 * * *', // 2:00 AM daily
    testPayload: { feature: 'all', tags: '@regression' }
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(schedRes.status, 200);
  const schedId = schedRes.data.schedule.id;

  const listSchedRes = await makeRequest('GET', '/api/schedules', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(listSchedRes.status, 200);
  assert.ok(listSchedRes.data.count > 0);
  console.log(`  ✅ PASSED: Schedule Created & Verified (ID: ${schedId}, Cron: 0 2 * * *)`);

  console.log('\n================================================================');
  console.log('🎉 ALL 10 ENTERPRISE INTEGRATIONS & SCHEDULING TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runIntegrationHubTests().catch(err => {
  console.error('❌ Integration Hub Test Failure:', err);
  process.exit(1);
});
