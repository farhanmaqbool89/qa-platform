const EvidenceModel = require('./evidence.model');
const normalizer = require('./evidence-normalizer');

/**
 * Shared Evidence Collector
 * Gathers logs, stack traces, console outputs, HTTP errors, and artifact metadata into EvidenceModel.
 */
class EvidenceCollector {

  collect(executionId, rawData = {}, artifactDirs = {}) {
    const { logs = [], failureReason = '', stackTrace = '', failedSteps = [], scenarioName: rawScenario = '' } = rawData;

    const logMessages = logs.map(l => (typeof l === 'string' ? l : l.message || ''));
    const combinedLogText = logMessages.join('\n') + '\n' + failureReason + '\n' + stackTrace;

    const codeLocation = normalizer.parseStackTrace(combinedLogText);
    const consoleErrors = logMessages.filter(m => /error|uncaught|exception|typeerror|referenceerror/i.test(m));
    const networkErrors = logMessages.filter(m => /500|502|503|401|403|404|ERR_CONNECTION|failed to load/i.test(m));

    const failedLocator = normalizer.extractFailedLocator(combinedLogText);
    const failedAssertion = normalizer.extractFailedAssertion(combinedLogText);
    const scenarioName = rawScenario || normalizer.extractScenarioName(combinedLogText);
    const exceptionType = normalizer.extractExceptionType(combinedLogText);

    const extractedSteps = failedSteps.length > 0 ? failedSteps : normalizer.extractFailedSteps(combinedLogText);
    const stepText = extractedSteps[0] || 'Step execution failed';

    const hasStackTrace = Boolean(stackTrace || /at\s+.*?\(/i.test(combinedLogText) || codeLocation.file !== 'Unknown File');
    const hasFailedStep = Boolean(stepText && stepText !== 'Step execution failed');
    const hasConsoleLogs = consoleErrors.length > 0;
    const hasNetworkLogs = networkErrors.length > 0;
    const hasScreenshot = Boolean(artifactDirs.screenshots && artifactDirs.screenshots.length > 0);
    const hasTrace = Boolean(artifactDirs.traces && artifactDirs.traces.length > 0);
    const hasVideo = Boolean(artifactDirs.videos && artifactDirs.videos.length > 0);

    const evidenceSources = {
      stackTrace: hasStackTrace,
      failedStep: hasFailedStep,
      consoleLogs: hasConsoleLogs,
      networkLogs: hasNetworkLogs,
      screenshot: hasScreenshot,
      trace: hasTrace,
      video: hasVideo
    };

    const availableSources = [];
    const missingSources = [];

    if (hasStackTrace) availableSources.push('Stack Trace'); else missingSources.push('Stack Trace');
    if (hasFailedStep) availableSources.push('Failed Step Context'); else missingSources.push('Failed Step Context');
    if (hasConsoleLogs) availableSources.push('Console Logs'); else missingSources.push('Console Logs');
    if (hasNetworkLogs) availableSources.push('Network Logs'); else missingSources.push('Network Logs');
    if (hasScreenshot) availableSources.push('Failure Screenshot'); else missingSources.push('Failure Screenshot');
    if (hasTrace) availableSources.push('Playwright Trace (.zip)'); else missingSources.push('Playwright Trace (.zip)');

    const activeSourceNames = availableSources.map(s => s.toUpperCase().replace(/\s+/g, '_').replace(/[^A_Z_]/g, ''));

    const evidenceStrengthScore = normalizer.calculateEvidenceStrength(evidenceSources);

    const justificationItems = [];
    if (hasStackTrace) justificationItems.push('+35 (Stack Trace)');
    if (hasFailedStep) justificationItems.push('+20 (Failed Step Context)');
    if (hasConsoleLogs) justificationItems.push('+15 (Console Logs)');
    if (hasNetworkLogs) justificationItems.push('+15 (Network Logs)');
    if (hasScreenshot) justificationItems.push('+10 (Screenshot)');
    if (hasTrace) justificationItems.push('+5 (Playwright Trace)');

    const justification = justificationItems.length > 0
      ? `${justificationItems.join(', ')} = ${evidenceStrengthScore}% Dynamic Evidence Weight`
      : 'Basic log stream = Minimum Evidence Weight';

    const evidenceBreakdown = {
      available: availableSources,
      missing: missingSources,
      justification
    };

    return new EvidenceModel({
      executionId,
      timestamp: new Date().toISOString(),
      combinedLogText,
      failureReason,
      stackTrace,
      codeLocation,
      scenarioName,
      stepText,
      exceptionType,
      consoleErrors,
      networkErrors,
      evidenceSources,
      activeSourceNames,
      failedSteps: extractedSteps,
      evidenceStrengthScore,
      failedLocator,
      failedAssertion,
      availableSources,
      missingSources,
      evidenceBreakdown
    });
  }
}

module.exports = new EvidenceCollector();
