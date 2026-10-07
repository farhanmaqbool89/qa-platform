/**
 * Abstract Base LLM Provider Interface
 * Standard contract for all AI LLM providers (OpenAI, Anthropic, Google, Mock).
 */
class BaseLLMProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Sanitizes input text to remove sensitive credentials/secrets before sending to LLM.
   */
  sanitizeInput(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/qa_sec_[A-Za-z0-9_]{16,}/g, '[REDACTED_API_KEY]')
      .replace(/(password|secret|apiKey|api_key|private_key)\s*[:=]\s*["']?([^"'\s,]+)["']?/gi, '$1: "[REDACTED_SECRET]"')
      .replace(/(token|access_token)\s*[:=]\s*["']?([^"'\s,]+)["']?/gi, '$1: "[REDACTED_TOKEN]"')
      .replace(/ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT_TOKEN]');
  }

  /**
   * Enforces prompt size limits (default max 32,000 characters).
   */
  truncatePrompt(text, maxChars = 32000) {
    if (!text || text.length <= maxChars) return text;
    return text.substring(0, maxChars) + '\n...[TRUNCATED_DUE_TO_SIZE_LIMIT]';
  }

  /**
   * Abstract method: Generate text output
   */
  async generateText(prompt, systemMessage = '', options = {}) {
    throw new Error(`generateText() not implemented for provider ${this.name}`);
  }

  /**
   * Abstract method: Generate structured JSON output
   */
  async generateJSON(prompt, systemMessage = '', schemaValidator = null, options = {}) {
    throw new Error(`generateJSON() not implemented for provider ${this.name}`);
  }
}

module.exports = BaseLLMProvider;
