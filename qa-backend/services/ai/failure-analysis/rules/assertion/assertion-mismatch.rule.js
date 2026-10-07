const AnalysisModel = require('../../models/analysis.model');

/**
 * Assertion Mismatch Diagnostic Rule (Priority 70)
 * Detects AssertionError and value mismatches.
 */
class AssertionMismatchRule {
  constructor() {
    this.id = 'RULE_ASSERTION_FAIL_001';
    this.category = 'ASSERTION';
    this.priority = 70;
  }

  canHandle(evidence) {
    return /AssertionError|Expected values to be strictly equal|expect\(.*?\)\.to|toEqual|toBeVisible|toHaveText/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const assertionDetail = evidence.failedAssertion ? `: ${evidence.failedAssertion}` : '';

    const observedFacts = [
      `Failed Step: ${evidence.failedSteps[0] || 'Unknown Step'}`,
      `✔ Playwright AssertionError captured in execution log stream${assertionDetail}`,
      `File: ${evidence.codeLocation.file} (Line ${evidence.codeLocation.line}, Method: ${evidence.codeLocation.method})`
    ];

    if (evidence.failedAssertion) {
      observedFacts.push(`⚠️ Specific Failed Assertion: \`${evidence.failedAssertion}\``);
    }

    const qaRecs = evidence.failedAssertion
      ? [
          `Inspect assertion '${evidence.failedAssertion}' against latest UI design spec.`,
          'Update scenario assertion expected values if UI change was intentional.'
        ]
      : [
          'Compare failure screenshot with expected UI design specification.',
          'Update scenario assertion expected values if UI change was intentional.'
        ];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 20, 95),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'ASSERTION_MISMATCH',
      issueOrigin: 'APPLICATION_BUG',
      severity: 'HIGH',
      matchedRuleId: this.id,
      affectedStep: evidence.failedSteps[0] || 'Then error message is displayed',
      codeLocation: evidence.codeLocation,
      observedFailure: evidence.failedAssertion
        ? `Assertion Failure: ${evidence.failedAssertion}`
        : 'Assertion Failure: Actual page state did not match expected Playwright assertion criteria.',
      isRootCauseConfirmed: Boolean(evidence.failedAssertion && evidence.evidenceSources.stackTrace),
      observedFacts,
      technicalInference: evidence.failedAssertion
        ? `The Playwright assertion '${evidence.failedAssertion}' at ${evidence.codeLocation.file}:${evidence.codeLocation.line} expected specific UI state, but application returned a different state.`
        : 'The Playwright assertion expected specific UI element states or values, but received a different state from the application.',
      possibleCauses: [
        'Application regression introduced in recent build commit',
        'UI text or state change modified intentionally without test update',
        'Asynchronous timing delay causing assertion to run before state rendered'
      ],
      categorizedRecommendations: {
        developerActions: [
          'Verify recent application commits for UI regression or state changes.'
        ],
        qaActions: qaRecs,
        infrastructureActions: [
          'Ensure test execution environment CPU resources are not throttled.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new AssertionMismatchRule();
