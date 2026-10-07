const path = require('path');
const fs = require('fs');

const evidenceCollector = require('../shared/evidence/evidence-collector');
const aiOrchestrator = require('../shared/ai-orchestrator');
const contextManager = require('../shared/context-manager');
const ruleRegistry = require('./registry/rule.registry');
const providerFactory = require('../shared/provider-factory');
const locatorHealer = require('../locator-healing/locator-healer.facade');

/**
 * Failure Analysis Service Facade
 * Public entry point coordinating Failure Analysis workflow.
 */
class FailureAnalysisService {

  async analyzeExecution(executionId, rawData = {}, options = {}) {
    const { force = false, provider = 'RULE_ENGINE' } = options;

    if (!force) {
      const cached = contextManager.getCachedAnalysis(executionId);
      if (cached) return cached;
    }

    const artifactDirs = this.getArtifactDirs(executionId);
    const aiProvider = providerFactory.getProvider(provider);

    const workflowResult = await aiOrchestrator.executeWorkflow({
      executionId,
      collectEvidence: () => evidenceCollector.collect(executionId, rawData, artifactDirs),
      runRuleAnalysis: (evidenceModel) => ruleRegistry.analyze(evidenceModel),
      runAiEnhancement: (ruleAnalysis, evidenceModel) => aiProvider.enhance(ruleAnalysis, evidenceModel),
      persistArtifacts: async (evidenceModel, ruleAnalysis, aiEnhancement, timingMetrics) => {
        ruleAnalysis.durationMs = timingMetrics.totalDurationMs;
        ruleAnalysis.timingMetrics = timingMetrics;

        // Phase 2A: Integrate read-only deterministic locator healing
        if (evidenceModel.failedLocator) {
          try {
            let htmlSnapshot = rawData.htmlSnapshot || '';
            if (!htmlSnapshot) {
              const privateSnapshotPath = path.resolve(__dirname, '../../../data/history/healing', `dom_snapshot_${executionId}.html`);
              if (fs.existsSync(privateSnapshotPath)) {
                htmlSnapshot = fs.readFileSync(privateSnapshotPath, 'utf8');
              }
            }

            let originalAction = 'click';
            if (evidenceModel.combinedLogText) {
              const actionMatch = evidenceModel.combinedLogText.match(/\.(click|fill|press|check|uncheck|selectOption|setInputFiles)\s*\(/i);
              if (actionMatch) {
                originalAction = actionMatch[1].toLowerCase();
              }
            }

            const healingReport = await locatorHealer.heal({
              executionId,
              scenarioName: evidenceModel.scenarioName,
              projectName: rawData.projectName || 'default',
              stepText: evidenceModel.stepText,
              originalLocator: evidenceModel.failedLocator,
              originalAction,
              htmlSnapshot
            });
            ruleAnalysis.locatorHealing = healingReport;
          } catch (e) {
            console.error('[FailureAnalysisService] Healing integration error:', e.message);
          }
        }

        return contextManager.saveAnalysisArtifacts(executionId, evidenceModel, ruleAnalysis);
      }
    });

    return workflowResult.ruleAnalysis;
  }

  getCachedAnalysis(executionId) {
    return contextManager.getCachedAnalysis(executionId);
  }

  getArtifactDirs(executionId) {
    const baseDir = path.join(__dirname, '../../../artifacts', String(executionId));
    const screenshotsDir = path.join(baseDir, 'screenshots');
    const videosDir = path.join(baseDir, 'videos');
    const tracesDir = path.join(baseDir, 'traces');

    return {
      screenshots: fs.existsSync(screenshotsDir) ? fs.readdirSync(screenshotsDir) : [],
      videos: fs.existsSync(videosDir) ? fs.readdirSync(videosDir) : [],
      traces: fs.existsSync(tracesDir) ? fs.readdirSync(tracesDir) : []
    };
  }
}

module.exports = new FailureAnalysisService();
