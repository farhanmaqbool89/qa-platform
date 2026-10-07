const assert = require('assert');
const LLMProviderFactory = require('../services/ai/providers/provider.factory');
const BaseLLMProvider = require('../services/ai/providers/llm-provider.interface');
const OpenAIProvider = require('../services/ai/providers/openai.provider');
const MockLLMProvider = require('../services/ai/providers/mock.provider');
const aiPlatformService = require('../services/ai/ai-platform.service');

async function runAILLMIntegrationTests() {
  console.log('\n================================================================');
  console.log('🤖 RUNNING AI LLM PROVIDER ARCHITECTURE & INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // Set mock mode for baseline offline unit testing
  process.env.AI_MOCK_MODE = 'true';

  // 1. Base Provider Input Sanitization
  console.log('🔹 Test 1: Base Provider Secret & Credential Sanitization');
  const baseProvider = new BaseLLMProvider('test-base');
  const dirtyInput = 'User email: admin@test.com, password: "SecretPass123!", token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c", key: "sk-proj-12345678901234567890"';
  const sanitized = baseProvider.sanitizeInput(dirtyInput);
  assert.ok(!sanitized.includes('SecretPass123!'), 'Password must be redacted');
  assert.ok(!sanitized.includes('eyJhbGci'), 'JWT token must be redacted');
  assert.ok(sanitized.includes('[REDACTED_TOKEN]') || sanitized.includes('[REDACTED_JWT_TOKEN]'), 'JWT token redaction string present');
  console.log('  ✅ PASSED: Credentials & tokens sanitized correctly');

  // 2. Prompt Truncation Limit
  console.log('\n🔹 Test 2: Prompt Size Truncation Limit');
  const longPrompt = 'A'.repeat(40000);
  const truncated = baseProvider.truncatePrompt(longPrompt, 1000);
  assert.strictEqual(truncated.length, 1000 + '\n...[TRUNCATED_DUE_TO_SIZE_LIMIT]'.length);
  console.log('  ✅ PASSED: Prompt truncated at 1000 chars limit');

  // 3. Provider Factory Resolution
  console.log('\n🔹 Test 3: Provider Factory Resolution');
  const mockProvider = LLMProviderFactory.getProvider('mock');
  assert.strictEqual(mockProvider.name, 'mock');
  console.log('  ✅ PASSED: Provider Factory resolved MockLLMProvider');

  // 4. Schema Validation Failure Handling
  console.log('\n🔹 Test 4: Schema Validation Failure Handling');
  let schemaFailed = false;
  try {
    await mockProvider.generateJSON('invalid requirement', '', (data) => data.nonExistentKey === true);
  } catch (err) {
    if (err.message.includes('schema validation')) {
      schemaFailed = true;
    }
  }
  assert.ok(schemaFailed, 'Should reject output failing schema validation');
  console.log('  ✅ PASSED: Schema validation failure caught safely');

  // 5. AI Requirement Analysis via LLM
  console.log('\n🔹 Test 5: Requirement Analysis via LLM Provider');
  const reqRes = await aiPlatformService.analyzeRequirement('User Story: As an admin, I want to manage project environments so that deployment credentials are secure.');
  assert.strictEqual(reqRes.success, true);
  assert.ok(reqRes.analysis.summary);
  assert.ok(reqRes.analysis.riskLevel);
  assert.ok(reqRes.usage);
  assert.ok(reqRes.usage.promptTokens > 0);
  console.log(`  ✅ PASSED: Requirement Analysis generated (Risk: ${reqRes.analysis.riskLevel}, Tokens: ${reqRes.usage.totalTokens})`);

  // 6. AI Test Case Generation via LLM
  console.log('\n🔹 Test 6: Test Case Generation via LLM Provider');
  const tcRes = await aiPlatformService.generateTestCases('User Registration & Verification');
  assert.strictEqual(tcRes.success, true);
  assert.ok(Array.isArray(tcRes.testCases));
  assert.ok(tcRes.testCases.length > 0);
  assert.ok(tcRes.testCases[0].title);
  console.log(`  ✅ PASSED: ${tcRes.testCases.length} Test Cases generated via LLM`);

  // 7. AI Gherkin Generation via LLM
  console.log('\n🔹 Test 7: Gherkin Feature Generation via LLM Provider');
  const gherkinRes = await aiPlatformService.generateGherkinFeature('Shopping Cart Checkout');
  assert.strictEqual(gherkinRes.success, true);
  assert.ok(gherkinRes.content.includes('Feature:'));
  console.log(`  ✅ PASSED: Gherkin Feature generated (${gherkinRes.filename})`);

  // 8. AI Playwright Steps Generation via LLM
  console.log('\n🔹 Test 8: Playwright Step Definitions Generation via LLM Provider');
  const playwrightRes = await aiPlatformService.generatePlaywrightSteps('Shopping Cart Checkout Feature');
  assert.strictEqual(playwrightRes.success, true);
  assert.ok(playwrightRes.code.includes('Given') || playwrightRes.code.includes('When'));
  console.log(`  ✅ PASSED: Playwright Steps generated (${playwrightRes.framework})`);

  // 9. AI QA Assistant Chat via LLM
  console.log('\n🔹 Test 9: QA Assistant Chat via LLM Provider');
  const chatRes = await aiPlatformService.chatWithQAAssistant('How can I fix a locator timeout error on submit button?');
  assert.strictEqual(chatRes.success, true);
  assert.ok(chatRes.reply);
  console.log(`  ✅ PASSED: QA Assistant replied successfully`);

  // 10. Production Mode Guard Verification
  console.log('\n🔹 Test 10: Production Mode Missing Key Guard Verification');
  const oldNodeEnv = process.env.NODE_ENV;
  const oldMockMode = process.env.AI_MOCK_MODE;
  const oldApiKey = process.env.OPENAI_API_KEY;

  process.env.NODE_ENV = 'production';
  delete process.env.AI_MOCK_MODE;
  delete process.env.OPENAI_API_KEY;

  let prodGuardTriggered = false;
  try {
    LLMProviderFactory.getProvider('openai');
  } catch (err) {
    if (err.message.includes('Production Error') || err.message.includes('OPENAI_API_KEY is missing')) {
      prodGuardTriggered = true;
    }
  }
  assert.ok(prodGuardTriggered, 'Production mode without OPENAI_API_KEY and without AI_MOCK_MODE=true must throw fatal error');
  console.log('  ✅ PASSED: Production Mode LLM Guard Enforced');

  // Restore env
  process.env.NODE_ENV = oldNodeEnv;
  process.env.AI_MOCK_MODE = oldMockMode || 'true';
  if (oldApiKey) process.env.OPENAI_API_KEY = oldApiKey;

  // 11. Optional Live OpenAI API Integration Test
  if (process.env.RUN_LLM_INTEGRATION_TESTS === 'true' && process.env.OPENAI_API_KEY) {
    console.log('\n🔹 Test 11: Live OpenAI API Integration Test (RUN_LLM_INTEGRATION_TESTS=true)');
    delete process.env.AI_MOCK_MODE;
    const realOpenAIProvider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
    const liveText = await realOpenAIProvider.generateText('Respond with "Live OpenAI Integration Verified"');
    assert.ok(liveText.length > 0);
    console.log(`  ✅ PASSED: Live OpenAI API Call Successful ("${liveText}")`);
    process.env.AI_MOCK_MODE = 'true';
  } else {
    console.log('\n🔹 Test 11: Live OpenAI Integration Test Skipped (Set RUN_LLM_INTEGRATION_TESTS=true & OPENAI_API_KEY to execute)');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL AI LLM PROVIDER & INTEGRATION TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runAILLMIntegrationTests().catch(err => {
  console.error('❌ AI LLM Integration Test Failure:', err);
  process.exit(1);
});
