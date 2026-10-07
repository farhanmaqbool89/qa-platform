const OpenAIProvider = require('./openai.provider');
const MockLLMProvider = require('./mock.provider');

class LLMProviderFactory {
  static getProvider(overrideProviderName = null) {
    const providerName = (overrideProviderName || process.env.LLM_PROVIDER || 'openai').toLowerCase();
    const isMockMode = process.env.AI_MOCK_MODE === 'true';
    const isProd = process.env.NODE_ENV === 'production';

    // If mock mode is explicitly set or running in test mode without OpenAI API Key
    if (isMockMode || providerName === 'mock') {
      if (isProd && !isMockMode) {
        throw new Error('[PROVIDER-FACTORY] 🚨 Production Error: Mock LLM provider is forbidden in production mode unless AI_MOCK_MODE=true is explicitly set.');
      }
      return new MockLLMProvider();
    }

    if (providerName === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        if (isMockMode || (!isProd && process.env.NODE_ENV !== 'production')) {
          console.warn('[PROVIDER-FACTORY] ⚠️ OPENAI_API_KEY missing in dev/test mode. Falling back to MockLLMProvider.');
          return new MockLLMProvider();
        }
        throw new Error('[PROVIDER-FACTORY] 🚨 Production Error: OPENAI_API_KEY is missing. Production AI generation requires a valid LLM provider configuration.');
      }
      return new OpenAIProvider();
    }

    throw new Error(`[PROVIDER-FACTORY] Unsupported LLM Provider: ${providerName}`);
  }
}

module.exports = LLMProviderFactory;
