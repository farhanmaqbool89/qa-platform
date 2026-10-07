/**
 * Shared AI Orchestrator
 * Generic workflow orchestrator coordinating pipeline steps and timing metrics.
 */
class AIOrchestrator {

  async executeWorkflow({ executionId, collectEvidence, runRuleAnalysis, runAiEnhancement, persistArtifacts }) {
    const startTime = Date.now();
    let evidenceCollectionMs = 0;
    let ruleExecutionMs = 0;
    let aiEnhancementMs = 0;

    // Step 1: Collect Evidence
    const t0 = Date.now();
    const evidenceModel = await collectEvidence();
    evidenceCollectionMs = Date.now() - t0;

    // Step 2: Rule Analysis (Authoritative Source of Truth)
    const t1 = Date.now();
    const ruleAnalysis = await runRuleAnalysis(evidenceModel);
    ruleExecutionMs = Date.now() - t1;

    // Step 3: Optional AI Enhancement
    let aiEnhancement = null;
    if (runAiEnhancement) {
      const t2 = Date.now();
      aiEnhancement = await runAiEnhancement(ruleAnalysis, evidenceModel);
      aiEnhancementMs = Date.now() - t2;
    }

    const totalDurationMs = Date.now() - startTime;

    // Timing metrics
    const timingMetrics = {
      evidenceCollectionMs,
      ruleExecutionMs,
      aiEnhancementMs,
      totalDurationMs
    };

    // Step 4: Persist Artifacts
    if (persistArtifacts) {
      await persistArtifacts(evidenceModel, ruleAnalysis, aiEnhancement, timingMetrics);
    }

    return {
      evidenceModel,
      ruleAnalysis,
      aiEnhancement,
      timingMetrics
    };
  }
}

module.exports = new AIOrchestrator();
