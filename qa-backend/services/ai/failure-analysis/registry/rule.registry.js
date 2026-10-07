const authFailureRule = require('../rules/auth/auth-failure.rule');
const browserLaunchRule = require('../rules/browser/browser-launch.rule');
const envFailureRule = require('../rules/env/env-failure.rule');
const networkHttpRule = require('../rules/network/network-http.rule');
const network4xxRule = require('../rules/network/network-4xx.rule');
const locatorNotFoundRule = require('../rules/playwright/locator-not-found.rule');
const playwrightTimeoutRule = require('../rules/playwright/playwright-timeout.rule');
const navTimeoutRule = require('../rules/playwright/nav-timeout.rule');
const playwrightContextRule = require('../rules/playwright/playwright-context.rule');
const javascriptExceptionRule = require('../rules/js/javascript-exception.rule');
const assertionMismatchRule = require('../rules/assertion/assertion-mismatch.rule');
const AnalysisModel = require('../models/analysis.model');

/**
 * Rule Registry
 * Manages prioritized evaluation across 11 deterministic diagnostic rules with fallback safety.
 */
class RuleRegistry {
  constructor() {
    this.rules = [
      authFailureRule,
      browserLaunchRule,
      envFailureRule,
      networkHttpRule,
      network4xxRule,
      locatorNotFoundRule,
      playwrightTimeoutRule,
      navTimeoutRule,
      playwrightContextRule,
      javascriptExceptionRule,
      assertionMismatchRule
    ];
    // Sort rules by priority descending
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  registerRule(rule) {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  analyze(evidence) {
    // Multi-rule matching: find highest priority matching deterministic rule
    for (const rule of this.rules) {
      if (rule.canHandle(evidence)) {
        return rule.analyze(evidence);
      }
    }

    // Emergency Fallback Rule (Reserved exclusively for unclassifiable unknown errors)
    const locatorDetail = evidence.failedLocator ? ` '${evidence.failedLocator}'` : '';
    const observedFacts = [
      `Exception: ${evidence.exceptionType}`,
      `Scenario: ${evidence.scenarioName}`,
      `Step: ${evidence.stepText}`,
      `⚠️ Unclassified Exception stream${locatorDetail}`,
      `Location: ${evidence.codeLocation.file}:${evidence.codeLocation.line} (${evidence.codeLocation.method})`
    ];

    if (evidence.failedLocator) {
      observedFacts.push(`🎯 Target Locator: \`${evidence.failedLocator}\``);
    }

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.max(evidence.evidenceStrengthScore, 35),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'UNKNOWN_FAILURE',
      issueOrigin: 'TEST_SCRIPT_ISSUE',
      severity: 'MEDIUM',
      matchedRuleId: 'RULE_FALLBACK_001',
      affectedStep: evidence.stepText,
      scenarioName: evidence.scenarioName,
      exceptionType: evidence.exceptionType,
      codeLocation: evidence.codeLocation,
      observedFailure: evidence.failedLocator
        ? `Observed Error: Unclassified failure involving target element '${evidence.failedLocator}'.`
        : 'Observed Error: Test scenario failed due to unclassified execution error.',
      isRootCauseConfirmed: false,
      observedFacts,
      technicalInference: 'The execution stream produced a failure that did not match a specific deterministic diagnostic rule pattern.',
      possibleCauses: [
        'Unclassified test script exception or custom step failure',
        'Asynchronous event loop state mismatch'
      ],
      categorizedRecommendations: {
        developerActions: [
          'Inspect raw execution logs and stack trace for exception details.'
        ],
        qaActions: [
          'Verify scenario step implementation and assertions.'
        ],
        infrastructureActions: [
          'Check system environment logs.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new RuleRegistry();
