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

async function runMultiTenantSecurityTests() {
  console.log('\n================================================================');
  console.log('🔒 RUNNING CROSS-TENANT MULTI-TENANCY & RBAC SECURITY TEST SUITE');
  console.log('================================================================\n');

  // 1. Setup Tenant A (Org Alpha) & User A
  console.log('🔹 Setup: Registering Organization Alpha & User A');
  const userAEmail = `user_alpha_${Date.now()}@org-alpha.com`;
  const regARes = await makeRequest('POST', '/api/auth/register', {
    email: userAEmail,
    password: 'PasswordAlpha123!',
    name: 'User Alpha',
    organizationName: 'Organization Alpha'
  });
  assert.strictEqual(regARes.status, 201);
  const tokenA = regARes.data.accessToken;
  const orgAId = regARes.data.user.organization.id;

  // 2. Setup Tenant B (Org Beta) & User B
  console.log('🔹 Setup: Registering Organization Beta & User B');
  const userBEmail = `user_beta_${Date.now()}@org-beta.com`;
  const regBRes = await makeRequest('POST', '/api/auth/register', {
    email: userBEmail,
    password: 'PasswordBeta123!',
    name: 'User Beta',
    organizationName: 'Organization Beta'
  });
  assert.strictEqual(regBRes.status, 201);
  const tokenB = regBRes.data.accessToken;
  const orgBId = regBRes.data.user.organization.id;

  // 3. User B creates a Project in Org Beta
  console.log('\n🔹 Security Test 1: User B creates a project in Org Beta');
  const projBRes = await makeRequest('POST', '/api/projects', {
    name: 'Secret Beta Core Service',
    baseUrl: 'https://beta.internal.local'
  }, { 'Authorization': `Bearer ${tokenB}` });

  assert.strictEqual(projBRes.status, 200);
  const projBId = projBRes.data.project.id;
  console.log(`  ✅ PASSED: Created project ID ${projBId} in Org Beta (${orgBId})`);

  // 4. Cross-Tenant Test: User A tries to list projects of Org Beta
  console.log('\n🔹 Security Test 2: User A lists projects (Must NOT see Org Beta project)');
  const listARes = await makeRequest('GET', '/api/projects', null, { 'Authorization': `Bearer ${tokenA}` });
  assert.strictEqual(listARes.status, 200);
  const foundBetaInA = listARes.data.projects.find(p => p.name === 'Secret Beta Core Service');
  assert.strictEqual(foundBetaInA, undefined, 'CRITICAL SECURITY BREACH: User A was able to view User B project!');
  console.log('  ✅ PASSED: User A isolated — cannot view User B projects');

  // 5. Payload Tampering Test: User A attempts to inject foreign organizationId in request payload
  console.log('\n🔹 Security Test 3: User A attempts organizationId injection in payload');
  const injectRes = await makeRequest('POST', '/api/projects', {
    name: 'Injected Fake Project',
    organizationId: orgBId // Attacker tries to inject Org B's ID
  }, { 'Authorization': `Bearer ${tokenA}` });

  assert.strictEqual(injectRes.status, 200);
  assert.strictEqual(injectRes.data.project.organizationId, orgAId, 'CRITICAL SECURITY BREACH: Backend trusted user-supplied organizationId!');
  console.log('  ✅ PASSED: Backend ignored payload organizationId and enforced JWT organization context');

  // 6. Cross-Tenant Deletion Attack: User A tries to delete User B's project
  console.log('\n🔹 Security Test 4: User A attempts to delete User B project');
  const deleteRes = await makeRequest('DELETE', `/api/projects/${projBId}`, null, { 'Authorization': `Bearer ${tokenA}` });
  assert.strictEqual(deleteRes.status, 404, 'CRITICAL SECURITY BREACH: User A was able to delete User B project!');
  console.log('  ✅ PASSED: User A forbidden/not found when targeting User B project for deletion');

  // 7. Header Switch Attack: User A attempts to switch organization header X-Organization-Id to Org B
  console.log('\n🔹 Security Test 5: User A attempts X-Organization-Id header spoofing to Org B');
  const switchRes = await makeRequest('GET', '/api/projects', null, {
    'Authorization': `Bearer ${tokenA}`,
    'X-Organization-Id': orgBId
  });
  assert.strictEqual(switchRes.status, 403, 'CRITICAL SECURITY BREACH: User A successfully spoofed X-Organization-Id!');
  console.log('  ✅ PASSED: X-Organization-Id switch rejected (403 Forbidden) for non-members');

  // 8. Audit Logging Verification
  console.log('\n🔹 Security Test 6: Verify Audit Trail Logs');
  const auditRes = await makeRequest('GET', '/api/audit-logs', null, { 'Authorization': `Bearer ${tokenA}` });
  assert.strictEqual(auditRes.status, 200);
  assert.ok(Array.isArray(auditRes.data.auditLogs));
  console.log(`  ✅ PASSED: Audit logs fetched (${auditRes.data.auditLogs.length} audit entries captured)`);

  console.log('\n================================================================');
  console.log('🎉 ALL MULTI-TENANCY & RBAC SECURITY TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runMultiTenantSecurityTests().catch(err => {
  console.error('❌ Multi-Tenant Security Test Failure:', err);
  process.exit(1);
});
