const AnalysisModel = require('../../models/analysis.model');

/**
 * Network HTTP Error Diagnostic Rule (Priority 90)
 * Detects HTTP 500, 502, 503 Internal Server Errors.
 */
class NetworkHttpRule {
  constructor() {
    this.id = 'RULE_NETWORK_HTTP_001';
    this.category = 'NETWORK';
    this.priority = 90;
  }

  canHandle(evidence) {
    return /500 Internal Server Error|ERR_CONNECTION_REFUSED|502 Bad Gateway|503 Service Unavailable/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const observedFacts = [
      `Failed Step: ${evidence.failedSteps[0] || 'Unknown Step'}`,
      '⚡ HTTP 500 Internal Server Error detected in console/network log stream',
      `File: ${evidence.codeLocation.file} (Line ${evidence.codeLocation.line}, Method: ${evidence.codeLocation.method})`
    ];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 20, 96),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'NETWORK_HTTP_ERROR',
      issueOrigin: 'APPLICATION_BUG',
      severity: 'HIGH',
      matchedRuleId: this.id,
      affectedStep: evidence.failedSteps[0] || 'When API request is sent',
      codeLocation: evidence.codeLocation,
      observedFailure: 'Backend server error: API endpoint returned HTTP 500 Internal Server Error.',
      isRootCauseConfirmed: Boolean(evidence.evidenceSources.networkLogs),
      observedFacts,
      technicalInference: 'The web application client dispatched an HTTP API request, but the upstream backend server crashed or returned a 500 response payload.',
      possibleCauses: [
        'Unhandled exception in backend API controller code',
        'Database connection pool exhaustion or query failure',
        'Upstream microservice dependency timeout'
      ],
      categorizedRecommendations: {
        developerActions: [
          'Inspect backend application server logs for unhandled 500 server exceptions.',
          'Verify database connection pool health and microservice API availability.'
        ],
        qaActions: [
          'Re-run API health check endpoint before re-triggering test suite.'
        ],
        infrastructureActions: [
          'Check server load, memory utilization, and container logs.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new NetworkHttpRule();
