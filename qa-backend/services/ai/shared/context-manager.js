const fs = require('fs');
const path = require('path');

/**
 * Context Manager
 * Handles artifact persistence and separate directories:
 * - artifacts/<executionId>/analysis/ (evidence.json, failure-analysis.json)
 * - artifacts/<executionId>/ai/ (ai-enhancement.json, conversation-context.json, prompts.json)
 */
class ContextManager {

  saveAnalysisArtifacts(executionId, evidenceModel, analysisReport) {
    const baseDir = path.join(__dirname, '../../../artifacts', String(executionId));
    const analysisDir = path.join(baseDir, 'analysis');
    const aiDir = path.join(baseDir, 'ai');

    fs.mkdirSync(analysisDir, { recursive: true });
    fs.mkdirSync(aiDir, { recursive: true });

    // 1. Save deterministic raw evidence
    const evidencePath = path.join(analysisDir, 'evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify(evidenceModel, null, 2), 'utf8');

    // 2. Save deterministic failure analysis report
    const analysisPath = path.join(analysisDir, 'failure-analysis.json');
    fs.writeFileSync(analysisPath, JSON.stringify(analysisReport, null, 2), 'utf8');

    // 3. Save AI Conversation Context for future Conversational AI Chat
    const conversationContext = {
      executionId: Number(executionId),
      generatedAt: new Date().toISOString(),
      summary: analysisReport.rootCauseSummary,
      category: analysisReport.failureCategory,
      origin: analysisReport.issueOrigin,
      evidenceSummary: evidenceModel.activeSourceNames,
      codeLocation: evidenceModel.codeLocation,
      observedFacts: analysisReport.observedFacts,
      technicalInference: analysisReport.technicalInference
    };

    const contextPath = path.join(aiDir, 'conversation-context.json');
    fs.writeFileSync(contextPath, JSON.stringify(conversationContext, null, 2), 'utf8');

    return {
      evidencePath,
      analysisPath,
      contextPath
    };
  }

  getCachedAnalysis(executionId) {
    const filePath = path.join(__dirname, '../../../artifacts', String(executionId), 'analysis', 'failure-analysis.json');
    if (fs.existsSync(filePath)) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

module.exports = new ContextManager();
