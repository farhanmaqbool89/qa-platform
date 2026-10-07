const ruleEngine = require('./rule-engine');
const LLMProvider = require('./llm-provider');

/**
 * Provider Factory
 * Selects active failure analysis provider based on configuration without changing API or UI contracts.
 */
class ProviderFactory {
  static getProvider(type = process.env.AI_PROVIDER_TYPE || 'RULE_ENGINE') {
    switch (type.toUpperCase()) {
      case 'LLM_PROVIDER':
      case 'OPENAI':
      case 'OLLAMA':
        return new LLMProvider();
      case 'RULE_ENGINE':
      default:
        return ruleEngine;
    }
  }
}

module.exports = ProviderFactory;
