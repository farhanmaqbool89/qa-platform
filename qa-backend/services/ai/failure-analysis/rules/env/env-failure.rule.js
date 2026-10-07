const AnalysisModel = require('../../models/analysis.model');

/**
 * Environment Connection Refused Rule (Priority 92)
 * Detects ERR_CONNECTION_REFUSED or target server down.
 */
class EnvFailureRule {
  constructor() {
    this.id = 'RULE_ENV_FAILURE_001';
    this.category = 'ENVIRONMENT';
    this.priority = 92;
  }

  canHandle(evidence) {
    return /ERR_CONNECTION_REFUSED|connect ECONNREFUSED|net::ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError when attempting to fetch resource/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const observedFacts = [
      `Exception: ${evidence.exceptionType}`,
      `Scenario: ${evidence.scenarioName}`,
      '☁️ Environment Network Failure: Connection refused by target server host',
      `Location: ${evidence.codeLocation.file}:${evidence.codeLocation.line} (${evidence.codeLocation.method})`
    ];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 25, 96),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'ENVIRONMENT_FAILURE',
      issueOrigin: 'ENVIRONMENT_ISSUE',
      severity: 'CRITICAL',
      matchedRuleId: this.id,
      affectedStep: evidence.stepText,
      scenarioName: evidence.scenarioName,
      exceptionType: evidence.exceptionType,
      codeLocation: evidence.codeLocation,
      observedFailure: 'Environment Offline: Target web application or API server host is unavailable.',
      isRootCauseConfirmed: true,
      observedFacts,
      technicalInference: 'The test runner attempted to establish a network connection to the target web application host, but the server port was closed or unreachable.',
      possibleCauses: [
        'Local dev server or staging backend is not running on target port',
        'Incorrect target URL hostname or environment variable configuration',
        'Firewall or VPN blocking access to target internal staging URL'
      ],
      categorizedRecommendations: {
        developerActions: [
          'Verify local web application / dev server is running and listening on target port.'
        ],
        qaActions: [
          'Check target URL configuration parameter in cucumber.js or environment config.'
        ],
        infrastructureActions: [
          'Verify staging environment health status and network firewall ingress rules.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new EnvFailureRule();
