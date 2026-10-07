const BaseLLMProvider = require('./llm-provider.interface');

class MockLLMProvider extends BaseLLMProvider {
  constructor() {
    super('mock');
    this.lastUsage = null;
  }

  async generateText(prompt, systemMessage = '', options = {}) {
    const sanitized = this.truncatePrompt(this.sanitizeInput(prompt));
    this.lastUsage = {
      model: 'mock-gpt-4o',
      promptTokens: Math.ceil(sanitized.length / 4),
      completionTokens: 120,
      totalTokens: Math.ceil(sanitized.length / 4) + 120,
      durationMs: 15
    };

    if (sanitized.toLowerCase().includes('gherkin')) {
      return `Feature: User Authentication & Security

  @smoke @regression
  Scenario: Successful login with valid credentials
    Given the user navigates to the login page
    When the user enters valid credentials
    Then the dashboard should be displayed`;
    }

    if (sanitized.toLowerCase().includes('playwright') || sanitized.toLowerCase().includes('step definition')) {
      return `const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');

Given('the user navigates to the login page', async function () {
  await this.page.goto('/login');
});

When('the user enters valid credentials', async function () {
  await this.page.fill('#username', 'user@example.com');
  await this.page.fill('#password', 'SecretPass123!');
  await this.page.click('#login-button');
});

Then('the dashboard should be displayed', async function () {
  await expect(this.page.locator('.dashboard')).toBeVisible();
});`;
    }

    return `AI Assistant Response: Processed request for requirement context successfully.`;
  }

  async generateJSON(prompt, systemMessage = '', schemaValidator = null, options = {}) {
    const sanitized = this.truncatePrompt(this.sanitizeInput(prompt));
    this.lastUsage = {
      model: 'mock-gpt-4o',
      promptTokens: Math.ceil(sanitized.length / 4),
      completionTokens: 250,
      totalTokens: Math.ceil(sanitized.length / 4) + 250,
      durationMs: 20
    };

    let data = {};

    if (sanitized.toLowerCase().includes('testcase') || sanitized.toLowerCase().includes('test cases')) {
      data = {
        testCases: [
          {
            title: 'Verify valid login credentials',
            objective: 'Ensure user can authenticate with valid credentials',
            preconditions: 'User is registered',
            testSteps: ['Navigate to /login', 'Enter username and password', 'Click Login'],
            expectedResult: 'User lands on dashboard',
            priority: 'HIGH',
            severity: 'CRITICAL',
            requirementRef: 'REQ-AUTH-001'
          },
          {
            title: 'Verify invalid password error',
            objective: 'Ensure system rejects incorrect password',
            preconditions: 'User is registered',
            testSteps: ['Navigate to /login', 'Enter valid username and wrong password', 'Click Login'],
            expectedResult: 'Error message "Invalid credentials" displayed',
            priority: 'MEDIUM',
            severity: 'NORMAL',
            requirementRef: 'REQ-AUTH-001'
          }
        ]
      };
    } else if (sanitized.toLowerCase().includes('requirement') || sanitized.toLowerCase().includes('riskscore')) {
      const isHighRisk = sanitized.toLowerCase().includes('payment') || sanitized.toLowerCase().includes('auth') || sanitized.toLowerCase().includes('security') || sanitized.toLowerCase().includes('oauth');
      data = {
        summary: 'Requirement for secure user authentication and session management.',
        riskLevel: isHighRisk ? 'HIGH' : 'MEDIUM',
        riskScore: isHighRisk ? 85 : 45,
        acceptanceCriteria: ['Valid credentials redirect to dashboard', 'Invalid credentials return HTTP 401 error message'],
        functionalAreas: ['Authentication', 'Session Management'],
        nonFunctionalConcerns: ['Security', 'Response Latency'],
        assumptions: ['User account already exists'],
        ambiguities: ['No password reset policy specified in text']
      };
    } else {
      data = { result: 'Mock LLM JSON Response Success' };
    }

    if (typeof schemaValidator === 'function') {
      const isValid = schemaValidator(data);
      if (!isValid) {
        throw new Error('Mock LLM data failed schema validation.');
      }
    }

    return {
      data,
      usage: this.lastUsage
    };
  }

  getUsage() {
    return this.lastUsage;
  }
}

module.exports = MockLLMProvider;
