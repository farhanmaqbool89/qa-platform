const assert = require('assert');
const evidenceCollector = require('../services/ai/shared/evidence/evidence-collector');
const ruleRegistry = require('../services/ai/failure-analysis/registry/rule.registry');

console.log('🧪 Running Comprehensive Rule Engine RC1 Regression Suite...\n');

// Test Case 1: Playwright Context Uninitialized (RULE_PLAYWRIGHT_CONTEXT_001)
const rawData1 = {
  logs: ["TypeError: Cannot read properties of undefined (reading 'goto')"],
  failureReason: "TypeError: Cannot read properties of undefined (reading 'goto')",
  stackTrace: "at CustomWorld.<anonymous> (steps/login.steps.js:13:10)",
  scenarioName: "User authentication"
};
const evidence1 = evidenceCollector.collect(101, rawData1, { screenshots: ['fail.png'], traces: ['trace.zip'] });
const analysis1 = ruleRegistry.analyze(evidence1);
assert.strictEqual(analysis1.failureCategory, 'PLAYWRIGHT_CONTEXT');
assert.strictEqual(analysis1.matchedRuleId, 'RULE_PLAYWRIGHT_CONTEXT_001');
assert.strictEqual(analysis1.codeLocation.file, 'steps/login.steps.js');
assert.strictEqual(analysis1.codeLocation.line, 13);
assert.strictEqual(analysis1.evidenceStrengthScore, 65); // 35 (stack) + 15 (console) + 10 (screenshot) + 5 (trace) = 65
console.log('✅ Test 1 Passed: RULE_PLAYWRIGHT_CONTEXT_001 matched & evidence weight calculated (+65%)');

// Test Case 2: Locator Not Found (RULE_LOCATOR_NOT_FOUND_001)
const rawData2 = {
  logs: ["Failed to find element: selector 'input#account-id' not found"],
  failureReason: "selector 'input#account-id' not found",
  stackTrace: "at submitRefund (steps/refund.steps.js:42:15)",
  scenarioName: "Refund Successfully"
};
const evidence2 = evidenceCollector.collect(102, rawData2, {});
const analysis2 = ruleRegistry.analyze(evidence2);
assert.strictEqual(analysis2.failureCategory, 'LOCATOR_NOT_FOUND');
assert.strictEqual(analysis2.matchedRuleId, 'RULE_LOCATOR_NOT_FOUND_001');
assert.strictEqual(analysis2.failedLocator, 'input#account-id');
assert.strictEqual(analysis2.codeLocation.file, 'steps/refund.steps.js');
assert.strictEqual(analysis2.codeLocation.line, 42);
assert.strictEqual(analysis2.codeLocation.method, 'submitRefund');
console.log('✅ Test 2 Passed: RULE_LOCATOR_NOT_FOUND_001 matched with exact file/line/method (steps/refund.steps.js:42 submitRefund)');

// Test Case 3: Action Timeout (RULE_PLAYWRIGHT_TIMEOUT_001)
const rawData3 = {
  logs: ["Timeout 5000ms exceeded while waiting for locator('button#submit')"],
  failureReason: "waiting for locator('button#submit')",
  stackTrace: "at Page.click (steps/checkout.steps.js:88:12)",
  scenarioName: "Checkout Payment"
};
const evidence3 = evidenceCollector.collect(103, rawData3, { screenshots: ['shot.png'] });
const analysis3 = ruleRegistry.analyze(evidence3);
assert.strictEqual(analysis3.failureCategory, 'ELEMENT_TIMEOUT');
assert.strictEqual(analysis3.matchedRuleId, 'RULE_PLAYWRIGHT_TIMEOUT_001');
assert.strictEqual(analysis3.failedLocator, 'button#submit');
console.log('✅ Test 3 Passed: RULE_PLAYWRIGHT_TIMEOUT_001 matched locator timeout');

// Test Case 4: Navigation Timeout (RULE_NAV_TIMEOUT_001)
const rawData4 = {
  logs: ["page.goto: Timeout 30000ms exceeded"],
  failureReason: "page.goto: Timeout 30000ms exceeded",
  stackTrace: "at CustomWorld.goto (steps/login.steps.js:10:5)",
  scenarioName: "Open Home Page"
};
const evidence4 = evidenceCollector.collect(104, rawData4, {});
const analysis4 = ruleRegistry.analyze(evidence4);
assert.strictEqual(analysis4.failureCategory, 'NAVIGATION_TIMEOUT');
assert.strictEqual(analysis4.matchedRuleId, 'RULE_NAV_TIMEOUT_001');
console.log('✅ Test 4 Passed: RULE_NAV_TIMEOUT_001 matched page.goto timeout');

// Test Case 5: AssertionError (RULE_ASSERTION_FAIL_001)
const rawData5 = {
  logs: ["AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: false !== true"],
  failureReason: "AssertionError: Expected values to be strictly equal",
  stackTrace: "at steps/login.steps.js:33:10",
  scenarioName: "Login validation"
};
const evidence5 = evidenceCollector.collect(105, rawData5, {});
const analysis5 = ruleRegistry.analyze(evidence5);
assert.strictEqual(analysis5.failureCategory, 'ASSERTION_MISMATCH');
assert.strictEqual(analysis5.matchedRuleId, 'RULE_ASSERTION_FAIL_001');
assert.strictEqual(analysis5.failedAssertion, 'Expected values to be strictly equal: false !== true');
console.log('✅ Test 5 Passed: RULE_ASSERTION_FAIL_001 matched & assertion details extracted');

// Test Case 6: HTTP 500 (RULE_NETWORK_HTTP_5XX_001)
const rawData6 = {
  logs: ["500 Internal Server Error: Failed to load resource"],
  failureReason: "500 Internal Server Error",
  stackTrace: ""
};
const evidence6 = evidenceCollector.collect(106, rawData6, {});
const analysis6 = ruleRegistry.analyze(evidence6);
assert.strictEqual(analysis6.failureCategory, 'NETWORK_HTTP_ERROR');
assert.strictEqual(analysis6.matchedRuleId, 'RULE_NETWORK_HTTP_001');
console.log('✅ Test 6 Passed: RULE_NETWORK_HTTP_001 matched HTTP 500');

// Test Case 7: HTTP 404 (RULE_NETWORK_HTTP_4XX_001)
const rawData7 = {
  logs: ["404 Not Found: Resource /api/v1/user/101 not found"],
  failureReason: "404 Not Found",
  stackTrace: ""
};
const evidence7 = evidenceCollector.collect(107, rawData7, {});
const analysis7 = ruleRegistry.analyze(evidence7);
assert.strictEqual(analysis7.failureCategory, 'NETWORK_HTTP_4XX');
assert.strictEqual(analysis7.matchedRuleId, 'RULE_NETWORK_HTTP_4XX_001');
console.log('✅ Test 7 Passed: RULE_NETWORK_HTTP_4XX_001 matched HTTP 404');

// Test Case 8: HTTP 401 Auth (RULE_AUTH_FAIL_001)
const rawData8 = {
  logs: ["401 Unauthorized: Session Token Expired"],
  failureReason: "401 Unauthorized",
  stackTrace: ""
};
const evidence8 = evidenceCollector.collect(108, rawData8, {});
const analysis8 = ruleRegistry.analyze(evidence8);
assert.strictEqual(analysis8.failureCategory, 'AUTH_FAILURE');
assert.strictEqual(analysis8.matchedRuleId, 'RULE_AUTH_FAIL_001');
console.log('✅ Test 8 Passed: RULE_AUTH_FAIL_001 matched 401 Unauthorized');

// Test Case 9: Uncaught JS Exception (RULE_JS_EXCEPTION_001)
const rawData9 = {
  logs: ["ReferenceError: calculateDiscount is not defined"],
  failureReason: "ReferenceError: calculateDiscount is not defined",
  stackTrace: "at steps/checkout.steps.js:55:12"
};
const evidence9 = evidenceCollector.collect(109, rawData9, {});
const analysis9 = ruleRegistry.analyze(evidence9);
assert.strictEqual(analysis9.failureCategory, 'JAVASCRIPT_EXCEPTION');
assert.strictEqual(analysis9.matchedRuleId, 'RULE_JS_EXCEPTION_001');
console.log('✅ Test 9 Passed: RULE_JS_EXCEPTION_001 matched ReferenceError');

// Test Case 10: Environment Connection Refused (RULE_ENV_FAILURE_001)
const rawData10 = {
  logs: ["net::ERR_CONNECTION_REFUSED at http://localhost:4200"],
  failureReason: "ERR_CONNECTION_REFUSED",
  stackTrace: ""
};
const evidence10 = evidenceCollector.collect(110, rawData10, {});
const analysis10 = ruleRegistry.analyze(evidence10);
assert.strictEqual(analysis10.failureCategory, 'ENVIRONMENT_FAILURE');
assert.strictEqual(analysis10.matchedRuleId, 'RULE_ENV_FAILURE_001');
console.log('✅ Test 10 Passed: RULE_ENV_FAILURE_001 matched ERR_CONNECTION_REFUSED');

console.log('\n🎉 ALL 10 REFINED RULE ENGINE SCENARIO TESTS PASSED CLEANLY WITH ZERO FALLBACK MISCLASSIFICATIONS!\n');
