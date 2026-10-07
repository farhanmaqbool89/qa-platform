const AIProvider = require('./ai-provider');

/**
 * Provider Factory
 * Plugin-based provider selection for Rule Engine vs AI Providers.
 */
class ProviderFactory {
  constructor() {
    this.providers = new Map();
    this.register('RULE_ENGINE', new AIProvider('RULE_ENGINE'));
  }

  register(name, provider) {
    this.providers.set(name, provider);
  }

  getProvider(name = 'RULE_ENGINE') {
    return this.providers.get(name) || this.providers.get('RULE_ENGINE');
  }
}

module.exports = new ProviderFactory();
