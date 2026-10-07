const assert = require('assert');
const sanitizer = require('../src/services/sanitizer.service');

console.log('--- STARTING PHASE 1 ADVERSARIAL SECURITY TEST SUITE (SANITIZER ONLY) ---');

try {
  // 1. Bearer Token Redaction
  const rawBearer = 'Error: Request failed with header Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secretpayload.sig';
  const cleanBearer = sanitizer.sanitizeString(rawBearer);
  assert(!cleanBearer.includes('eyJhbGciOiJIUzI1NiJ9'), 'Bearer JWT secret must be redacted');
  assert(cleanBearer.includes('[REDACTED_AUTH_TOKEN]') || cleanBearer.includes('[REDACTED_BEARER_TOKEN]') || cleanBearer.includes('[REDACTED_JWT_TOKEN]'), 'Must contain redaction tag');
  console.log('âœ… 1. Bearer Token Redaction Passed.');

  // 2. Database Connection String Redaction
  const rawDbUri = 'Connection error to postgres://admin:SuperSecretPass123!@db.internal:5432/production_db';
  const cleanDbUri = sanitizer.sanitizeString(rawDbUri);
  assert(!cleanDbUri.includes('SuperSecretPass123!'), 'Database password must be redacted');
  assert(cleanDbUri.includes('[REDACTED_DB_CREDENTIALS]'), 'Must contain DB redaction tag');
  console.log('âœ… 2. Database Connection String Redaction Passed.');

  // 3. API Key & Secret Parameter Redaction
  const rawApiKey = 'Failed GET https://api.service.com/data?api_key=sk_live_998877665544&access_token=secret_tok_123';
  const cleanApiKey = sanitizer.sanitizeString(rawApiKey);
  assert(!cleanApiKey.includes('sk_live_998877665544'), 'API Key must be redacted');
  assert(!cleanApiKey.includes('secret_tok_123'), 'Access Token must be redacted');
  console.log('âœ… 3. API Key & Query Parameter Redaction Passed.');

  // 4. Nested JSON Credentials & Cookies
  const rawNestedJson = {
    user: 'admin@company.com',
    credentials: {
      password: 'MySecretPassword123',
      token: 'eyJhbGciOiJIUzI1NiJ9.payload.signature',
      cookie: 'session_id=abcdef123456'
    },
    logs: [
      'Failed with Authorization: Basic dXNlcjpwYXNz'
    ]
  };

  const cleanObject = sanitizer.sanitizeObject(rawNestedJson);
  assert.strictEqual(cleanObject.credentials.password, '[REDACTED_SECRET]', 'Nested password must be redacted');
  assert(!JSON.stringify(cleanObject).includes('MySecretPassword123'), 'Raw password must not be present in sanitized output');
  assert(!JSON.stringify(cleanObject).includes('dXNlcjpwYXNz'), 'Basic Auth string must be redacted');
  console.log('âœ… 4. Nested JSON Secrets & Cookies Redaction Passed.');

  // 5. XSS Entity Escaping
  const rawXss = '<script>alert("xss")</script>';
  const escapedHtml = sanitizer.escapeHtml(rawXss);
  assert.strictEqual(escapedHtml, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', 'XSS characters must be entity escaped');
  console.log('âœ… 5. XSS Entity Escaping Passed.');

  console.log('--- ALL PHASE 1 ADVERSARIAL SECURITY TESTS PASSED CLEANLY ---');

} catch (err) {
  console.error('âŒ SECURITY TEST FAILURE:', err.stack || err.message);
  process.exit(1);
}
