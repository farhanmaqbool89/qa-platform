const AnalysisModel = require('../../models/analysis.model');

/**
 * Navigation Timeout Diagnostic Rule (Priority 86)
 * Detects page.goto navigation timeouts and domcontentloaded load state timeouts.
 */
class NavTimeoutRule {
  constructor() {
    this.id = 'RULE_NAV_TIMEOUT_001';
    this.category = 'PLAYWRIGHT';
    this.priority = 86;
  }

  canHandle(evidence) {
    return /page\.goto: Timeout \d+ms exceeded|Navigation timeout of \d+ms exceeded|page\.waitForLoadState: Timeout/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const observedFacts = [
      `Exception: ${evidence.exceptionType}`,
      `Scenario: ${evidence.scenarioName}`,
      `Step: ${evidence.stepText}`,
      '⏱️ Page Navigation Timeout: page.goto() exceeded maximum wait duration',
      `Location: ${evidence.codeLocation.file}:${evidence.codeLocation.line} (${evidence.codeLocation.method})`
    ];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 20, 92),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'NAVIGATION_TIMEOUT',
      issueOrigin: 'ENVIRONMENT_ISSUE',
      severity: 'HIGH',
      matchedRuleId: this.id,
      affectedStep: evidence.stepText,
      scenarioName: evidence.scenarioName,
      exceptionType: evidence.exceptionType,
      codeLocation: evidence.codeLocation,
      observedFailure: 'Navigation Timeout: Target URL failed to reach ready state within wait timeout.',
      isRootCauseConfirmed: Boolean(evidence.evidenceSources.stackTrace),
      observedFacts,
      technicalInference: `The page navigation at ${evidence.codeLocation.file}:${evidence.codeLocation.line} did not emit domcontentloaded or load events before the Playwright default navigation timeout expired.`,
      possibleCauses: [
        'Slow server response time or heavy initial bundle size',
        'Blocked third-party script or unfulfilled background network request',
        'Staging application environment cold start delay'
      ],
      categorizedRecommendations: {
        developerActions: [
          'Optimize initial web application asset bundle loading and backend API response times.'
        ],
        qaActions: [
          'Use waitUntil: "domcontentloaded" instead of "networkidle" for page.goto calls.'
        ],
        infrastructureActions: [
          'Ensure staging application server resources are warm before running automated suites.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new NavTimeoutRule();
