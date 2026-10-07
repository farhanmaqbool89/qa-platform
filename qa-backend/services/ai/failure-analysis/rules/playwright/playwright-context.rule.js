const AnalysisModel = require('../../models/analysis.model');

/**
 * Playwright Context Diagnostic Rule (Priority 80)
 * Detects uninitialized browser context or page goto on undefined.
 */
class PlaywrightContextRule {
  constructor() {
    this.id = 'RULE_PLAYWRIGHT_CONTEXT_001';
    this.category = 'PLAYWRIGHT';
    this.priority = 80;
  }

  canHandle(evidence) {
    return /Cannot read properties of undefined|reading 'goto'|browserContext|page\.goto is not a function/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const observedFacts = [
      `Failed Step: ${evidence.failedSteps[0] || 'Unknown Step'}`,
      "Exception: TypeError: Cannot read properties of undefined (reading 'goto')",
      `File: ${evidence.codeLocation.file} (Line ${evidence.codeLocation.line}, Method: ${evidence.codeLocation.method})`
    ];

    if (evidence.evidenceSources.screenshot) {
      observedFacts.push('📸 Failure Screenshot captured');
    }
    if (evidence.evidenceSources.trace) {
      observedFacts.push('🔍 Playwright Trace package captured (.zip)');
    }

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 25, 98),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'PLAYWRIGHT_CONTEXT',
      issueOrigin: 'TEST_SCRIPT_ISSUE',
      severity: 'HIGH',
      matchedRuleId: this.id,
      affectedStep: evidence.failedSteps[0] || 'Given user is on login page',
      codeLocation: evidence.codeLocation,
      observedFailure: "Uninitialized Playwright page instance: 'goto' called on undefined page object.",
      isRootCauseConfirmed: Boolean(evidence.evidenceSources.stackTrace),
      observedFacts,
      technicalInference: `The test scenario step at ${evidence.codeLocation.file}:${evidence.codeLocation.line} attempted to invoke Playwright's page.goto() method before initializing the browser page context in the Cucumber Before hook or CustomWorld object.`,
      possibleCauses: [
        'Before hook did not execute before scenario step',
        'Browser context creation failed during launchBrowser()',
        'this.page was not assigned to Cucumber CustomWorld instance'
      ],
      categorizedRecommendations: {
        developerActions: [
          'Verify Cucumber Before() hook properly initializes browser context and assigns this.page.',
          'Ensure world.js constructor calls launchBrowser() before scenario step execution.',
          'Verify setWorldConstructor(CustomWorld) registration.'
        ],
        qaActions: [
          'Verify step definition method signatures receive the shared CustomWorld scope.'
        ],
        infrastructureActions: [
          'Check Playwright browser dependency binary paths.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new PlaywrightContextRule();
