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

async function runEnterpriseSecurityTests() {
  console.log('\n================================================================');
  console.log('🔒 RUNNING ENTERPRISE SECURITY, SCIM 2.0 & COMPLIANCE TEST SUITE');
  console.log('================================================================\n');

  // 1. Setup User Token
  console.log('🔹 Setup: Registering Enterprise Security Admin');
  const userEmail = `sec_admin_${Date.now()}@sec-test.com`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    email: userEmail,
    password: 'Password123!',
    name: 'Security Admin',
    organizationName: 'Enterprise Security Corp'
  });
  assert.strictEqual(regRes.status, 201);
  const token = regRes.data.accessToken;

  // 2. SAML 2.0 Configuration & SP Metadata
  console.log('\n🔹 Test 1: Configure SAML 2.0 SSO (/api/security/sso/saml/config)');
  const samlRes = await makeRequest('POST', '/api/security/sso/saml/config', {
    idpEntityId: 'https://idp.okta.com/app/exk1234',
    ssoUrl: 'https://idp.okta.com/app/exk1234/sso/saml',
    certificate: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE...'
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(samlRes.status, 200);
  assert.strictEqual(samlRes.data.samlConfig.status, 'ACTIVE');
  console.log(`  ✅ PASSED: SAML 2.0 SSO Configured (Status: ${samlRes.data.samlConfig.status})`);

  // 3. SCIM 2.0 User Provisioning
  console.log('\n🔹 Test 2: SCIM 2.0 User Provisioning (/scim/v2/Users)');
  const scimListRes = await makeRequest('GET', '/scim/v2/Users', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(scimListRes.status, 200);
  assert.ok(scimListRes.data.schemas.includes('urn:ietf:params:scim:api:messages:2.0:ListResponse'));

  const scimCreateRes = await makeRequest('POST', '/scim/v2/Users', {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: 'scim_provisioned@company.com',
    name: { formatted: 'Provisioned User' }
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(scimCreateRes.status, 201);
  console.log(`  ✅ PASSED: SCIM 2.0 User Provisioned (${scimCreateRes.data.userName})`);

  // 4. MFA / 2FA Setup & Verification
  console.log('\n🔹 Test 3: MFA TOTP Secret Generation & Verification (/api/security/mfa/setup)');
  const mfaSetupRes = await makeRequest('POST', '/api/security/mfa/setup', {}, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(mfaSetupRes.status, 200);
  assert.ok(mfaSetupRes.data.secret);

  const mfaVerifyRes = await makeRequest('POST', '/api/security/mfa/verify', { code: '123456' }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(mfaVerifyRes.status, 200);
  assert.strictEqual(mfaVerifyRes.data.verified, true);
  console.log(`  ✅ PASSED: MFA 2FA Secret Generated & Code Verified`);

  // 5. IP Whitelist Security Configuration
  console.log('\n🔹 Test 4: Configure IP Whitelist (/api/security/ip-whitelist)');
  const ipRes = await makeRequest('POST', '/api/security/ip-whitelist', {
    allowedIPs: ['127.0.0.1', '192.168.1.100']
  }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(ipRes.status, 200);
  assert.ok(ipRes.data.allowedIPs.includes('127.0.0.1'));
  console.log(`  ✅ PASSED: IP Whitelist Configured (${ipRes.data.allowedIPs.join(', ')})`);

  // 6. Data Retention Policy Purge
  console.log('\n🔹 Test 5: Enforce Data Retention Purge Policy (/api/security/data-retention/purge)');
  const purgeRes = await makeRequest('POST', '/api/security/data-retention/purge', { retentionDays: 90 }, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(purgeRes.status, 200);
  assert.strictEqual(purgeRes.data.retentionPolicyDays, 90);
  console.log(`  ✅ PASSED: Data Retention Purge Policy Executed (${purgeRes.data.retentionPolicyDays} days policy)`);

  // 7. Dedicated Enterprise Workers Routing
  console.log('\n🔹 Test 6: Dedicated Enterprise Workers Pool (/api/security/dedicated-workers)');
  const poolRes = await makeRequest('GET', '/api/security/dedicated-workers', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(poolRes.status, 200);
  assert.strictEqual(poolRes.data.workerPool.mode, 'DEDICATED_EPHEMERAL_DOCKER');
  console.log(`  ✅ PASSED: Dedicated Enterprise Worker Pool Allocated (Nodes: ${poolRes.data.workerPool.activeNodes}/${poolRes.data.workerPool.maxNodes})`);

  // 8. SOC2 & ISO 27001 Compliance Report
  console.log('\n🔹 Test 7: SOC2 & ISO 27001 Security Compliance Report (/api/security/compliance-report)');
  const compRes = await makeRequest('GET', '/api/security/compliance-report', null, { 'Authorization': `Bearer ${token}` });
  assert.strictEqual(compRes.status, 200);
  assert.strictEqual(compRes.data.securityPosture.overallSecurityScore, 98);
  console.log(`  ✅ PASSED: Compliance Report Generated (${compRes.data.securityPosture.complianceStandard}, Score: ${compRes.data.securityPosture.overallSecurityScore}/100)`);

  console.log('\n================================================================');
  console.log('🎉 ALL 7 ENTERPRISE SECURITY & SCIM 2.0 TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runEnterpriseSecurityTests().catch(err => {
  console.error('❌ Enterprise Security Test Failure:', err);
  process.exit(1);
});
