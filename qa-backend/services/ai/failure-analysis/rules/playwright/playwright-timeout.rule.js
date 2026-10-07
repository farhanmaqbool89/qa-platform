const AnalysisModel = require('../../models/analysis.model');

/**
 * Playwright Locator Timeout Diagnostic Rule (Priority 85)
 * Specifically handles element timeout, waiting for locator, or obscured DOM element failures.
 */
class PlaywrightTimeoutRule {
  constructor() {
    this.id = 'RULE_PLAYWRIGHT_TIMEOUT_001';
    this.category = 'PLAYWRIGHT';
    this.priority = 85;
  }

  canHandle(evidence) {
    return /(?:locator|element|action) .*Timeout \d+ms exceeded|waiting for (?:locator|selector)|element is not visible|element is not attached|locator\.click: Timeout/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const locatorDetail = evidence.failedLocator ? ` '${evidence.failedLocator}'` : '';
    
    const observedFacts = [
      `Exception: ${evidence.exceptionType}`,
      `Scenario: ${evidence.scenarioName}`,
      `Step: ${evidence.stepText}`,
      `⏱️ Playwright Locator Timeout: Failed to interact with element${locatorDetail}`,
      `Location: ${evidence.codeLocation.file}:${evidence.codeLocation.line} (${evidence.codeLocation.method})`
    ];

    if (evidence.failedLocator) {
      observedFacts.push(`🎯 Target Element Locator: \`${evidence.failedLocator}\``);
    }
    if (evidence.evidenceSources.screenshot) {
      observedFacts.push('📸 Failure Screenshot captured');
    }
    if (evidence.evidenceSources.trace) {
      observedFacts.push('🔍 Playwright Trace package captured (.zip)');
    }

    const devRecs = evidence.failedLocator
      ? [`Verify element locator '${evidence.failedLocator}' exists in component template and has unique data-testid.`]
      : ['Verify element selector in component template and ensure element is rendered.'];

    const qaRecs = evidence.failedLocator
      ? [
          `Update locator strategy for '${evidence.failedLocator}' to use Playwright user-facing locators (e.g. getByRole, getByTestId).`,
          `Add explicit waitForLoadState("networkidle") or locator('${evidence.failedLocator}').waitFor() before click/fill action.`
        ]
      : [
          'Update selector strategy to use Playwright user-facing locators (getByRole, getByTestId).',
          'Add explicit waitForLoadState("networkidle") before element interaction.'
        ];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 25, 95),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'ELEMENT_TIMEOUT',
      issueOrigin: 'TEST_SCRIPT_ISSUE',
      severity: 'MEDIUM',
      matchedRuleId: this.id,
      affectedStep: evidence.stepText,
      scenarioName: evidence.scenarioName,
      exceptionType: evidence.exceptionType,
      codeLocation: evidence.codeLocation,
      observedFailure: evidence.failedLocator
        ? `Locator Timeout: Playwright timed out waiting for element '${evidence.failedLocator}'.`
        : 'Locator Timeout: Playwright locator failed to find matching DOM node within wait timeout.',
      isRootCauseConfirmed: Boolean(evidence.failedLocator && evidence.evidenceSources.stackTrace),
      observedFacts,
      technicalInference: evidence.failedLocator
        ? `The selector '${evidence.failedLocator}' specified in step definition '${evidence.codeLocation.file}:${evidence.codeLocation.line}' was not visible, delayed in rendering, or obscured by dynamic overlay.`
        : 'The selector specified in step definition was not present, hidden, or obscured by dynamic overlay banners.',
      possibleCauses: [
        'Element selector mismatch or DOM dynamic re-rendering',
        'Modal banner, loading spinner, or cookie overlay obscuring click target',
        'Page route navigation delay'
      ],
      categorizedRecommendations: {
        developerActions: devRecs,
        qaActions: qaRecs,
        infrastructureActions: [
          'Ensure network speed in test environment is stable and server response times are nominal.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new PlaywrightTimeoutRule();
