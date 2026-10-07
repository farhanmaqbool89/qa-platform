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

async function runAuthTests() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING SAAS PLATFORM AUTHENTICATION REGRESSION SUITE');
  console.log('================================================================\n');

  // Test 1: User Registration
  console.log('🔹 Test 1: User Registration (/api/auth/register)');
  const regEmail = `testuser_${Date.now()}@qa-platform.local`;
  const regRes = await makeRequest('POST', '/api/auth/register', {
    email: regEmail,
    password: 'Password123!',
    name: 'QA Test Engineer',
    organizationName: 'Acme Testing Corp'
  });

  assert.strictEqual(regRes.status, 201);
  assert.strictEqual(regRes.data.success, true);
  assert.ok(regRes.data.accessToken);
  assert.ok(regRes.data.refreshToken);
  assert.strictEqual(regRes.data.user.email, regEmail);
  console.log('  ✅ PASSED: User registered & tokens returned');

  // Test 2: User Login
  console.log('\n🔹 Test 2: User Login (/api/auth/login)');
  const loginRes = await makeRequest('POST', '/api/auth/login', {
    email: regEmail,
    password: 'Password123!'
  });

  assert.strictEqual(loginRes.status, 200);
  assert.strictEqual(loginRes.data.success, true);
  assert.ok(loginRes.data.accessToken);
  const accessToken = loginRes.data.accessToken;
  const refreshToken = loginRes.data.refreshToken;
  console.log('  ✅ PASSED: Login successful & JWT returned');

  // Test 3: Authenticated /api/auth/me Profile Fetch
  console.log('\n🔹 Test 3: Get Current User Profile (/api/auth/me)');
  const meRes = await makeRequest('GET', '/api/auth/me', null, {
    'Authorization': `Bearer ${accessToken}`
  });

  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.data.success, true);
  assert.strictEqual(meRes.data.user.email, regEmail);
  assert.strictEqual(meRes.data.user.role, 'ORG_ADMIN');
  console.log('  ✅ PASSED: /api/auth/me verified identity & organization context');

  // Test 4: Refresh Access Token
  console.log('\n🔹 Test 4: Refresh Access Token (/api/auth/refresh-token)');
  const refreshRes = await makeRequest('POST', '/api/auth/refresh-token', {
    refreshToken: refreshToken
  });

  assert.strictEqual(refreshRes.status, 200);
  assert.strictEqual(refreshRes.data.success, true);
  assert.ok(refreshRes.data.accessToken);
  console.log('  ✅ PASSED: Refresh token rotated access token successfully');

  // Test 5: Forgot Password
  console.log('\n🔹 Test 5: Forgot Password Request (/api/auth/forgot-password)');
  const forgotRes = await makeRequest('POST', '/api/auth/forgot-password', {
    email: regEmail
  });

  assert.strictEqual(forgotRes.status, 200);
  assert.strictEqual(forgotRes.data.success, true);
  assert.ok(forgotRes.data.resetToken);
  const resetToken = forgotRes.data.resetToken;
  console.log('  ✅ PASSED: Forgot password issued reset token');

  // Test 6: Reset Password
  console.log('\n🔹 Test 6: Reset Password Submission (/api/auth/reset-password)');
  const resetRes = await makeRequest('POST', '/api/auth/reset-password', {
    token: resetToken,
    newPassword: 'NewPassword123!'
  });

  assert.strictEqual(resetRes.status, 200);
  assert.strictEqual(resetRes.data.success, true);
  console.log('  ✅ PASSED: Password reset successfully');

  // Test 7: Login with New Password
  console.log('\n🔹 Test 7: Login with Updated Password');
  const newLoginRes = await makeRequest('POST', '/api/auth/login', {
    email: regEmail,
    password: 'NewPassword123!'
  });

  assert.strictEqual(newLoginRes.status, 200);
  assert.strictEqual(newLoginRes.data.success, true);
  console.log('  ✅ PASSED: Authentication succeeded with new password');

  // Test 8: Logout
  console.log('\n🔹 Test 8: Logout (/api/auth/logout)');
  const logoutRes = await makeRequest('POST', '/api/auth/logout');
  assert.strictEqual(logoutRes.status, 200);
  console.log('  ✅ PASSED: Logout endpoint completed');

  console.log('\n================================================================');
  console.log('🎉 ALL SAAS PLATFORM AUTHENTICATION TESTS PASSED CLEANLY!');
  console.log('================================================================\n');
}

runAuthTests().catch(err => {
  console.error('❌ Auth Test Failure:', err);
  process.exit(1);
});
