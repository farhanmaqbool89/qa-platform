const AnalysisModel = require('../../models/analysis.model');

/**
 * Network HTTP 4xx Diagnostic Rule (Priority 89)
 * Detects HTTP 400 Bad Request, 404 Not Found, 422 Unprocessable Entity.
 */
class Network4xxRule {
  constructor() {
    this.id = 'RULE_NETWORK_HTTP_4XX_001';
    this.category = 'NETWORK';
    this.priority = 89;
  }

  canHandle(evidence) {
    return /400 Bad Request|404 Not Found|422 Unprocessable Entity|409 Conflict/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const observedFacts = [
      `Exception: ${evidence.exceptionType}`,
      `Scenario: ${evidence.scenarioName}`,
      `Step: ${evidence.stepText}`,
      '⚡ HTTP 4xx Client Request Error detected in network logs',
      `Location: ${evidence.codeLocation.file}:${evidence.codeLocation.line} (${evidence.codeLocation.method})`
    ];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 20, 94),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'NETWORK_HTTP_4XX',
      issueOrigin: 'APPLICATION_BUG',
      severity: 'HIGH',
      matchedRuleId: this.id,
      affectedStep: evidence.stepText,
      scenarioName: evidence.scenarioName,
      exceptionType: evidence.exceptionType,
      codeLocation: evidence.codeLocation,
      observedFailure: 'HTTP Client Error: Upstream REST API returned 4xx Client Error.',
      isRootCauseConfirmed: Boolean(evidence.evidenceSources.networkLogs),
      observedFacts,
      technicalInference: 'The application client dispatched an HTTP request with invalid payload parameters, missing resource paths, or conflicting entity states.',
      possibleCauses: [
        'API endpoint route changed or deprecated',
        'Request payload body schema validation mismatch',
        'Resource record ID deleted or unavailable'
      ],
      categorizedRecommendations: {
        developerActions: [
          'Verify API endpoint routes and request payload validation rules in backend controller.'
        ],
        qaActions: [
          'Inspect API request headers and body payload in Playwright network log trace.'
        ],
        infrastructureActions: [
          'Ensure mock API server or backend service version matches test suite target.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new Network4xxRule();
