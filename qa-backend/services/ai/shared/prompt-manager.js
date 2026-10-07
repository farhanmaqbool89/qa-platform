/**
 * Prompt Manager
 * Centralized store for system prompts across AI platform modules.
 */
class PromptManager {

  getFailureAnalysisPrompt(evidenceModel, ruleAnalysis) {
    return {
      systemPrompt: "You are an Enterprise QA Automation AI Specialist. Enhance the following evidence-based rule diagnosis with natural language formatting. DO NOT modify or contradict the underlying facts or code location.",
      userPrompt: `Execution ID: ${evidenceModel.executionId}
Observed Facts: ${JSON.stringify(ruleAnalysis.observedFacts)}
Technical Inference: ${ruleAnalysis.technicalInference}
Code Location: ${JSON.stringify(evidenceModel.codeLocation)}`
    };
  }
}

module.exports = new PromptManager();
