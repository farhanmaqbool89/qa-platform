/**
 * Technology-Agnostic AI Provider Base Facade
 * Provides standard interface for LLMs (OpenAI, Azure OpenAI, Ollama, Claude, Gemini).
 */
class AIProvider {
  constructor(name = 'AI_PROVIDER_BASE') {
    this.name = name;
  }

  async enhance(ruleAnalysis, evidenceModel) {
    // Default pass-through enhancement without changing rule analysis
    return {
      enhancedBy: this.name,
      naturalLanguageSummary: ruleAnalysis.technicalInference,
      enhancedAt: new Date().toISOString()
    };
  }
}

module.exports = AIProvider;
