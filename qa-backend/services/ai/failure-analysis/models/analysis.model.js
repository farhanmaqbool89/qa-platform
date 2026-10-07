/**
 * Analysis Model for Failure Analysis Module
 * Data contract for failure reports.
 */
class AnalysisModel {
  constructor({
    executionId,
    status = 'FAILED',
    analysisSource = 'RULE_ENGINE',
    schemaVersion = '1.0',
    ruleEngineVersion = '2.1.0',
    createdAt = new Date().toISOString(),
    durationMs = 0,
    confidence = 90,
    evidenceStrengthScore = 0,
    failureCategory = 'ELEMENT_TIMEOUT',
    issueOrigin = 'TEST_SCRIPT_ISSUE',
    severity = 'MEDIUM',
    matchedRuleId = 'RULE_DEFAULT_001',
    affectedStep = 'Unknown Step',
    scenarioName = 'Unknown Scenario',
    featureFile = 'Unknown Feature',
    exceptionType = 'Error',
    codeLocation = { file: 'Unknown File', line: 0, method: 'Unknown Method' },
    rootCauseSummary = '',
    observedFailure = '',
    isRootCauseConfirmed = false,
    causeLabel = null,
    observedFacts = [],
    technicalInference = '',
    possibleCauses = [],
    categorizedRecommendations = {
      developerActions: [],
      qaActions: [],
      infrastructureActions: []
    },
    timingMetrics = {},
    failedLocator = null,
    failedAssertion = null,
    evidenceBreakdown = { available: [], missing: [], justification: '' }
  }) {
    this.executionId = Number(executionId) || 1;
    this.status = status;
    this.analysisSource = analysisSource;
    this.schemaVersion = schemaVersion;
    this.ruleEngineVersion = ruleEngineVersion;
    this.createdAt = createdAt;
    this.durationMs = durationMs;
    this.confidence = confidence;
    this.evidenceStrengthScore = evidenceStrengthScore;
    this.failureCategory = failureCategory;
    this.issueOrigin = issueOrigin;
    this.severity = severity;
    this.matchedRuleId = matchedRuleId;
    this.affectedStep = affectedStep;
    this.scenarioName = scenarioName;
    this.featureFile = featureFile || (codeLocation.file.includes('features/') ? codeLocation.file : 'features/execution.feature');
    this.exceptionType = exceptionType;
    this.codeLocation = codeLocation;
    
    // Requirement 2: Rename "Root Cause Summary" to "Observed Failure" unless confirmed by evidence
    this.isRootCauseConfirmed = Boolean(isRootCauseConfirmed || (confidence >= 90 && evidenceStrengthScore >= 70));
    this.causeLabel = causeLabel || (this.isRootCauseConfirmed ? 'Confirmed Root Cause' : 'Observed Failure');
    this.observedFailure = observedFailure || rootCauseSummary;
    this.rootCauseSummary = this.observedFailure; // Maintain backwards compatibility

    this.observedFacts = observedFacts;
    this.technicalInference = technicalInference;
    this.possibleCauses = possibleCauses;
    this.categorizedRecommendations = categorizedRecommendations;
    this.timingMetrics = timingMetrics;
    this.failedLocator = failedLocator;
    this.failedAssertion = failedAssertion;
    this.evidenceBreakdown = evidenceBreakdown;
  }
}

module.exports = AnalysisModel;
