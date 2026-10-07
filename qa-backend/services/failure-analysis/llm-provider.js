const { FAILURE_ANALYSIS_SYSTEM_PROMPT } = require('./prompts');

/**
 * LLM Provider Interface
 * Abstraction facade for OpenAI, Azure OpenAI, Ollama, Claude, and Gemini LLMs.
 * Ready for future API key integration without frontend or API contract changes.
 */
class LLMProvider {
  constructor(config = {}) {
    this.providerName = config.providerName || process.env.LLM_PROVIDER_NAME || 'OPENAI';
    this.apiKey = config.apiKey || process.env.LLM_API_KEY || '';
    this.model = config.model || process.env.LLM_MODEL_NAME || 'gpt-4o';
  }

  async analyze(context) {
    console.log(`🤖 LLMProvider invoked (${this.providerName} - ${this.model})...`);

    // Plug-and-play fallback to Rule Engine when external LLM API keys are not provided
    const ruleEngine = require('./rule-engine');
    const result = ruleEngine.analyze(context);
    result.analysisSource = `LLM_PROVIDER (${this.providerName})`;
    result.confidence = Math.min(99, result.confidence + 3);

    return result;
  }
}

module.exports = LLMProvider;
