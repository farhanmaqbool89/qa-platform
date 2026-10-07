const AnalysisModel = require('../../models/analysis.model');

/**
 * Locator Not Found Diagnostic Rule (Priority 88)
 * Specifically detects target element missing from DOM or invalid selector errors.
 */
class LocatorNotFoundRule {
  constructor() {
    this.id = 'RULE_LOCATOR_NOT_FOUND_001';
    this.category = 'PLAYWRIGHT';
    this.priority = 88;
  }

  canHandle(evidence) {
    return /selector (?:['"`])([^'"`]+)(?:['"`]) not found|element matching|locator\.waitFor: Target page, context or browser has been closed|Failed to find element|element not found|no element matching selector/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const locatorDetail = evidence.failedLocator ? ` '${evidence.failedLocator}'` : '';

    const observedFacts = [
      `Exception: ${evidence.exceptionType}`,
      `Scenario: ${evidence.scenarioName}`,
      `Step: ${evidence.stepText}`,
      `🎯 Locator Error: Target DOM node${locatorDetail} was not found in page document`,
      `Location: ${evidence.codeLocation.file}:${evidence.codeLocation.line} (${evidence.codeLocation.method})`
    ];

    if (evidence.failedLocator) {
      observedFacts.push(`🔍 Failed Selector: \`${evidence.failedLocator}\``);
    }
    if (evidence.evidenceSources.screenshot) {
      observedFacts.push('📸 Failure Screenshot captured');
    }

    const devRecs = evidence.failedLocator
      ? [`Verify DOM template in application component contains selector '${evidence.failedLocator}'.`, `Ensure component is rendered before step execution.`]
      : ['Verify component DOM structure and data-testid attributes.'];

    const qaRecs = evidence.failedLocator
      ? [`Update locator '${evidence.failedLocator}' in step definition to match updated component HTML.`]
      : ['Inspect target DOM element using browser DevTools inspect element mode.'];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 20, 95),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'LOCATOR_NOT_FOUND',
      issueOrigin: 'TEST_SCRIPT_ISSUE',
      severity: 'HIGH',
      matchedRuleId: this.id,
      affectedStep: evidence.stepText,
      scenarioName: evidence.scenarioName,
      exceptionType: evidence.exceptionType,
      codeLocation: evidence.codeLocation,
      observedFailure: evidence.failedLocator
        ? `Target Locator Not Found: Element '${evidence.failedLocator}' does not exist in DOM.`
        : 'Target Locator Not Found: Playwright selector failed to match any DOM node.',
      isRootCauseConfirmed: Boolean(evidence.failedLocator && evidence.evidenceSources.stackTrace),
      observedFacts,
      technicalInference: evidence.failedLocator
        ? `The step '${evidence.stepText}' at ${evidence.codeLocation.file}:${evidence.codeLocation.line} attempted to query selector '${evidence.failedLocator}', but the node was absent from the DOM tree.`
        : 'The selector specified in the test script did not match any element in the active page DOM.',
      possibleCauses: [
        'Incorrect CSS/XPath selector or changed element ID/class',
        'Element is conditionally rendered behind a feature flag or permission check',
        'Navigation page transition had not completed when query was executed'
      ],
      categorizedRecommendations: {
        developerActions: devRecs,
        qaActions: qaRecs,
        infrastructureActions: [
          'Verify test application version matches expected release tag.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new LocatorNotFoundRule();
