const sanitizerService = require('../../../src/services/sanitizer.service');

class AiRankingSanitizer {

  sanitizeInput(data = {}) {
    // 1. Scrub keys, tokens, and PII recursively
    const sanitized = sanitizerService.sanitizeObject(data);

    // 2. Enforce strict limits
    if (sanitized.originalLocator) {
      if (typeof sanitized.originalLocator.originalLocator === 'string') {
        sanitized.originalLocator.originalLocator = sanitized.originalLocator.originalLocator.substring(0, 500);
      }
      if (typeof sanitized.originalLocator.sanitizedTextHint === 'string') {
        sanitized.originalLocator.sanitizedTextHint = sanitized.originalLocator.sanitizedTextHint.substring(0, 100);
      }
    }

    if (Array.isArray(sanitized.candidates)) {
      // Limit to max 20 candidates to control token cost and response size
      sanitized.candidates = sanitized.candidates.slice(0, 20).map(c => {
        return {
          candidateId: c.candidateId || '',
          selector: typeof c.selector === 'string' ? c.selector.substring(0, 500) : '',
          strategy: c.strategy || '',
          tagName: c.tagName || '',
          role: c.role || '',
          text: typeof c.text === 'string' ? c.text.substring(0, 100) : '',
          deterministicScore: typeof c.deterministicScore === 'number' ? c.deterministicScore : 0.0,
          isValid: !!c.isValid,
          isVisible: !!c.isVisible,
          isEnabled: !!c.isEnabled
        };
      });
    }

    return sanitized;
  }

  sanitizeOutput(output = {}) {
    if (!output || typeof output !== 'object') return output;

    // Scrub output recursively
    const sanitized = sanitizerService.sanitizeObject(output);

    // Redact potential injected selectors or URLs in explanation string
    if (typeof sanitized.explanation === 'string') {
      // Truncate explanation to 200 chars to enforce concise explanations
      let exp = sanitized.explanation.substring(0, 200);
      // Remove any http/https URLs from the explanation for safety
      exp = exp.replace(/https?:\/\/[^\s]+/gi, '[REDACTED_URL]');
      sanitized.explanation = exp;
    }

    if (Array.isArray(sanitized.rankedCandidates)) {
      sanitized.rankedCandidates = sanitized.rankedCandidates.map(c => {
        return {
          candidateId: typeof c.candidateId === 'string' ? c.candidateId.substring(0, 50) : '',
          rank: typeof c.rank === 'number' ? c.rank : 99,
          reasonCodes: Array.isArray(c.reasonCodes) ? c.reasonCodes.map(r => String(r).substring(0, 50)) : []
        };
      });
    }

    return sanitized;
  }
}

module.exports = new AiRankingSanitizer();
