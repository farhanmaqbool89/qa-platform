const OpenAI = require('openai');
const BaseLLMProvider = require('./llm-provider.interface');

class OpenAIProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super('openai');
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.timeout = config.timeout || 30000; // 30s default timeout
    this.maxTokens = config.maxTokens || 3000;
    this.lastUsage = null;

    if (!this.apiKey) {
      if (process.env.NODE_ENV === 'production' && process.env.AI_MOCK_MODE !== 'true') {
        throw new Error('[OPENAI-PROVIDER] 🚨 Production Error: OPENAI_API_KEY is missing and AI_MOCK_MODE is disabled.');
      }
    }

    if (this.apiKey) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        timeout: this.timeout,
        maxRetries: 2
      });
    } else {
      this.client = null;
    }
  }

  async generateText(prompt, systemMessage = '', options = {}) {
    if (!this.client) {
      throw new Error('[OPENAI-PROVIDER] OpenAI client is not initialized (OPENAI_API_KEY missing).');
    }

    const sanitizedPrompt = this.truncatePrompt(this.sanitizeInput(prompt));
    const sanitizedSystem = this.sanitizeInput(systemMessage || 'You are an expert QA Automation Lead and Principal Software Architect.');

    const startTime = Date.now();
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: [
          { role: 'system', content: sanitizedSystem },
          { role: 'user', content: sanitizedPrompt }
        ],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens || this.maxTokens
      });

      const durationMs = Date.now() - startTime;
      this.lastUsage = {
        model: response.model || this.model,
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
        durationMs
      };

      return response.choices[0]?.message?.content?.trim() || '';
    } catch (err) {
      console.error('[OPENAI-PROVIDER] Text Generation Error:', err.message);
      throw new Error(`OpenAI LLM Request Failed: ${err.message}`);
    }
  }

  async generateJSON(prompt, systemMessage = '', schemaValidator = null, options = {}) {
    if (!this.client) {
      throw new Error('[OPENAI-PROVIDER] OpenAI client is not initialized (OPENAI_API_KEY missing).');
    }

    const jsonInstruction = '\n\nIMPORTANT: Respond with valid JSON only. Do not include markdown codeblock wrappers like ```json.';
    const sanitizedPrompt = this.truncatePrompt(this.sanitizeInput(prompt + jsonInstruction));
    const sanitizedSystem = this.sanitizeInput(systemMessage || 'You are an expert QA Automation Lead. Output strictly valid JSON.');

    const startTime = Date.now();
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: [
          { role: 'system', content: sanitizedSystem },
          { role: 'user', content: sanitizedPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens || this.maxTokens
      });

      const durationMs = Date.now() - startTime;
      this.lastUsage = {
        model: response.model || this.model,
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
        durationMs
      };

      const rawContent = response.choices[0]?.message?.content?.trim() || '{}';
      
      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch (parseErr) {
        throw new Error(`Failed to parse LLM JSON response: ${parseErr.message}`);
      }

      if (typeof schemaValidator === 'function') {
        const isValid = schemaValidator(parsed);
        if (!isValid) {
          throw new Error('LLM output failed schema validation requirements.');
        }
      }

      return {
        data: parsed,
        usage: this.lastUsage
      };
    } catch (err) {
      console.error('[OPENAI-PROVIDER] JSON Generation Error:', err.message);
      throw new Error(`OpenAI LLM JSON Generation Failed: ${err.message}`);
    }
  }

  getUsage() {
    return this.lastUsage;
  }
}

module.exports = OpenAIProvider;
