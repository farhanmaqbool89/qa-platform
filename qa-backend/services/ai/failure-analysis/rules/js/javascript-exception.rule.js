const AnalysisModel = require('../../models/analysis.model');

/**
 * JavaScript Exception Diagnostic Rule (Priority 75)
 * Detects uncaught TypeError, ReferenceError, SyntaxError in browser or test execution code.
 */
class JavaScriptExceptionRule {
  constructor() {
    this.id = 'RULE_JS_EXCEPTION_001';
    this.category = 'JAVASCRIPT';
    this.priority = 75;
  }

  canHandle(evidence) {
    return /TypeError:|ReferenceError:|SyntaxError:|RangeError:|UnhandledPromiseRejectionWarning/i.test(evidence.combinedLogText);
  }

  analyze(evidence) {
    const observedFacts = [
      `Exception: ${evidence.exceptionType}`,
      `Scenario: ${evidence.scenarioName}`,
      `Step: ${evidence.stepText}`,
      `💻 Uncaught JavaScript Exception (${evidence.exceptionType}) detected in runtime context`,
      `Location: ${evidence.codeLocation.file}:${evidence.codeLocation.line} (${evidence.codeLocation.method})`
    ];

    return new AnalysisModel({
      executionId: evidence.executionId,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      ruleEngineVersion: '2.1.0',
      confidence: Math.min(evidence.evidenceStrengthScore + 20, 95),
      evidenceStrengthScore: evidence.evidenceStrengthScore,
      failureCategory: 'JAVASCRIPT_EXCEPTION',
      issueOrigin: 'APPLICATION_BUG',
      severity: 'HIGH',
      matchedRuleId: this.id,
      affectedStep: evidence.stepText,
      scenarioName: evidence.scenarioName,
      exceptionType: evidence.exceptionType,
      codeLocation: evidence.codeLocation,
      observedFailure: `JavaScript Runtime Exception: Uncaught ${evidence.exceptionType} thrown during execution.`,
      isRootCauseConfirmed: Boolean(evidence.evidenceSources.stackTrace),
      observedFacts,
      technicalInference: `An unhandled JavaScript runtime error (${evidence.exceptionType}) occurred at ${evidence.codeLocation.file}:${evidence.codeLocation.line} during step evaluation.`,
      possibleCauses: [
        'Attempted property access on null or undefined object reference',
        'Undefined function or variable reference in client bundle or step helper',
        'Asynchronous promise rejection without catch block'
      ],
      categorizedRecommendations: {
        developerActions: [
          `Inspect file ${evidence.codeLocation.file} at line ${evidence.codeLocation.line} for null check guards.`,
          'Add optional chaining (?.) or defensive null checks before dereferencing object properties.'
        ],
        qaActions: [
          'Verify step definition helper parameters are correctly passed.'
        ],
        infrastructureActions: [
          'Ensure Node.js and browser engine versions match application runtime targets.'
        ]
      },
      failedLocator: evidence.failedLocator,
      failedAssertion: evidence.failedAssertion,
      evidenceBreakdown: evidence.evidenceBreakdown
    });
  }
}

module.exports = new JavaScriptExceptionRule();
