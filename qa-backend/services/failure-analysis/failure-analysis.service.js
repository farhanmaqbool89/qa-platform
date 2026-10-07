const fs = require('fs');
const path = require('path');
const ProviderFactory = require('./provider-factory');

const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'artifacts');

/**
 * Main Orchestration Service for AI Failure Analysis
 * Gathers evidence, runs provider analysis, and persists report under artifacts/<id>/analysis/failure-analysis.json
 */
class FailureAnalysisService {

  async analyzeExecution(executionId, contextData = {}, options = {}) {
    const runArtifactDir = path.join(ARTIFACTS_DIR, String(executionId));
    const analysisDir = path.join(runArtifactDir, 'analysis');
    const analysisFilePath = path.join(analysisDir, 'failure-analysis.json');

    // 1. Return cached analysis unless force=true is passed
    if (!options.force && fs.existsSync(analysisFilePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(analysisFilePath, 'utf8'));
        return cached;
      } catch (err) {}
    }

    // 2. Gather Evidence Artifacts
    const screenshotsDir = path.join(runArtifactDir, 'screenshots');
    const videosDir = path.join(runArtifactDir, 'videos');
    const tracesDir = path.join(runArtifactDir, 'traces');

    const artifacts = {
      screenshots: fs.existsSync(screenshotsDir) ? fs.readdirSync(screenshotsDir) : [],
      videos: fs.existsSync(videosDir) ? fs.readdirSync(videosDir) : [],
      traces: fs.existsSync(tracesDir) ? fs.readdirSync(tracesDir) : []
    };

    const fullContext = {
      executionId,
      logs: contextData.logs || [],
      failureReason: contextData.failureReason || 'Element not interactable or assertion mismatch',
      stackTrace: contextData.stackTrace || '',
      artifacts
    };

    // 3. Select Provider & Perform Analysis
    const startTime = Date.now();
    const provider = ProviderFactory.getProvider(options.providerType);
    const analysisResult = await provider.analyze(fullContext);
    analysisResult.durationMs = Date.now() - startTime;

    // 4. Persist Analysis to artifacts/<executionId>/analysis/failure-analysis.json
    fs.mkdirSync(analysisDir, { recursive: true });
    fs.writeFileSync(analysisFilePath, JSON.stringify(analysisResult, null, 2));

    return analysisResult;
  }

  getCachedAnalysis(executionId) {
    const analysisFilePath = path.join(ARTIFACTS_DIR, String(executionId), 'analysis', 'failure-analysis.json');
    if (fs.existsSync(analysisFilePath)) {
      try {
        return JSON.parse(fs.readFileSync(analysisFilePath, 'utf8'));
      } catch (err) {}
    }
    return null;
  }
}

module.exports = new FailureAnalysisService();
