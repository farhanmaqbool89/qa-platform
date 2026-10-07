const AnalysisModel = require('../../models/analysis.model');

/**
 * Authentication Failure Diagnostic Rule (Priority 100)
 * Detects 401 Unauthorized / 403 Forbidden / Token Expired.
 */
class AuthFailureRule {
  constructor() {
    this.id = 'RULE_AUTH_FAIL_001';
    this.category = 'AUTH';
    this.priority = 100;
  }

  canHandle(evidence) {
    return /401 Unauthorized|403 Forbidden|Invalid Credentials|Token Expired/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const observedFacts = [
      `Failed Step: ${evidence.failedSteps[0] || 'Unknown Step'}`,
      '🔑 HTTP 401/403 Authentication error detected in session token response',
      `File: ${evidence.codeLocation.file} (Line ${evidence.codeLocation.line}, Method: ${evidence.codeLocation.method})`
    ];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 20, 94),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'AUTH_FAILURE',
      issueOrigin: 'APPLICATION_BUG',
      severity: 'HIGH',
      matchedRuleId: this.id,
      affectedStep: evidence.failedSteps[0] || 'Given user authenticates',
      codeLocation: evidence.codeLocation,
      observedFailure: 'Authentication Failure: Test runner session was rejected or access token expired.',
      isRootCauseConfirmed: Boolean(evidence.evidenceSources.networkLogs || evidence.evidenceSources.consoleLogs),
      observedFacts,
      technicalInference: 'The scenario attempted an authenticated navigation or API invocation, but received an HTTP 401/403 or login rejection.',
      possibleCauses: [
        'Test user account credentials expired or locked',
        'API environment authorization token expired during long suite run',
        'Session storage cookies not injected into Playwright context'
      ],
      categorizedRecommendations: {
        developerActions: [
          'Verify authentication microservice endpoint status and JWT key rotation.'
        ],
        qaActions: [
          'Check test user credentials and environment API token validity.',
          'Verify auth session cookies are properly injected before scenario steps.'
        ],
        infrastructureActions: [
          'Ensure SSO / Auth server test realm is active.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new AuthFailureRule();
