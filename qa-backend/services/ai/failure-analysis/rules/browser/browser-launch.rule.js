const AnalysisModel = require('../../models/analysis.model');

/**
 * Browser Launch Diagnostic Rule (Priority 95)
 * Detects Playwright browser binary missing, launch failed, or executable path errors.
 */
class BrowserLaunchRule {
  constructor() {
    this.id = 'RULE_BROWSER_LAUNCH_001';
    this.category = 'BROWSER';
    this.priority = 95;
  }

  canHandle(evidence) {
    return /browserType\.launch: Executable doesn't exist|Failed to launch browser|chromium\.launch|browser\.newContext: Target page, context or browser has been closed/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const observedFacts = [
      `Exception: ${evidence.exceptionType}`,
      `Scenario: ${evidence.scenarioName}`,
      '🌐 Playwright Browser Launch Failure: Could not spawn headless chromium/firefox process',
      `Location: ${evidence.codeLocation.file}:${evidence.codeLocation.line} (${evidence.codeLocation.method})`
    ];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 25, 98),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'BROWSER_LAUNCH_FAILURE',
      issueOrigin: 'ENVIRONMENT_ISSUE',
      severity: 'CRITICAL',
      matchedRuleId: this.id,
      affectedStep: evidence.stepText,
      scenarioName: evidence.scenarioName,
      exceptionType: evidence.exceptionType,
      codeLocation: evidence.codeLocation,
      observedFailure: 'Browser Launch Failure: Playwright failed to start browser process or binaries missing.',
      isRootCauseConfirmed: true,
      observedFacts,
      technicalInference: 'The test execution engine attempted to launch a Playwright browser instance, but the browser binary executable was missing, corrupted, or crashed on startup.',
      possibleCauses: [
        'Playwright browser binaries not installed in CI/runner environment (missing npx playwright install)',
        'System OS library dependency missing for headless Chromium',
        'Insufficient system RAM/CPU resources to spawn browser process'
      ],
      categorizedRecommendations: {
        developerActions: [
          'Run `npx playwright install --with-deps` to ensure all browser binaries are downloaded.'
        ],
        qaActions: [
          'Verify launch options in CustomWorld/world.js (headless: true, args).'
        ],
        infrastructureActions: [
          'Update CI Docker container image to include Playwright browser prerequisites.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new BrowserLaunchRule();
