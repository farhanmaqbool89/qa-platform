/**
 * Standardized Evidence Model for Platform AI Foundation
 * Data contract representing normalized execution data.
 */
class EvidenceModel {
  constructor({
    executionId,
    timestamp = new Date().toISOString(),
    combinedLogText = '',
    failureReason = '',
    stackTrace = '',
    codeLocation = { file: 'Unknown File', line: 0, method: 'Unknown Method' },
    scenarioName = 'Unknown Scenario',
    stepText = 'Step execution failed',
    exceptionType = 'Error',
    consoleErrors = [],
    networkErrors = [],
    evidenceSources = {},
    activeSourceNames = [],
    failedSteps = [],
    evidenceStrengthScore = 0,
    failedLocator = null,
    failedAssertion = null,
    availableSources = [],
    missingSources = [],
    evidenceBreakdown = { available: [], missing: [], justification: '' }
  }) {
    this.executionId = Number(executionId) || 1;
    this.timestamp = timestamp;
    this.combinedLogText = combinedLogText;
    this.failureReason = failureReason;
    this.stackTrace = stackTrace;
    this.codeLocation = codeLocation;
    this.scenarioName = scenarioName;
    this.stepText = stepText;
    this.exceptionType = exceptionType;
    this.consoleErrors = consoleErrors;
    this.networkErrors = networkErrors;
    this.evidenceSources = evidenceSources;
    this.activeSourceNames = activeSourceNames;
    this.failedSteps = failedSteps;
    this.evidenceStrengthScore = evidenceStrengthScore;
    this.failedLocator = failedLocator;
    this.failedAssertion = failedAssertion;
    this.availableSources = availableSources;
    this.missingSources = missingSources;
    this.evidenceBreakdown = evidenceBreakdown;
  }
}

module.exports = EvidenceModel;
