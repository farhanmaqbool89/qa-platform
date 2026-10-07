const path = require('path');

/**
 * Dedicated Multi-Stage Sanitization Service
 * Ensures NO secrets, raw tokens, DB connection strings, PII, or raw un-sanitized logs
 * are ever persisted to disk or emitted over REST/Socket.IO endpoints.
 */
class SanitizerService {

  /**
   * Primary string sanitizer applying multi-stage regex redaction.
   */
  sanitizeString(str) {
    if (!str || typeof str !== 'string') return str;

    let sanitized = str;

    // 1. Authorization Headers & Bearer Tokens
    sanitized = sanitized.replace(/(authorization:\s*)(bearer|basic|token)\s+[^\s\r\n]+/gi, '$1$2 [REDACTED_AUTH_TOKEN]');
    sanitized = sanitized.replace(/(bearer)\s+[a-zA-Z0-9_\-\.=]+/gi, '$1 [REDACTED_BEARER_TOKEN]');

    // 2. JWT Tokens (header.payload.signature pattern)
    sanitized = sanitized.replace(/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT_TOKEN]');

    // 3. Database Connection Strings (Postgres, MySQL, Mongo, Redis)
    sanitized = sanitized.replace(/(postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|rediss):\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi, '$1://[REDACTED_DB_CREDENTIALS]');

    // 4. API Keys & Token Assignments (Query string, JSON, environment)
    sanitized = sanitized.replace(/([?&]|"|'|\b)(api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|private[_-]?key|client[_-]?secret)=([^&"'\s\r\n]+)/gi, '$1$2=[REDACTED_SECRET]');
    sanitized = sanitized.replace(/("?(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd|pwd|private[_-]?key)"?\s*:\s*")([^"\r\n]+)(")/gi, '$1[REDACTED_SECRET]$3');

    // 5. Passwords & Passphrases in Plaintext & Key-Value Pairs
    sanitized = sanitized.replace(/(password|passwd|pwd|pass)\s*[:=]\s*['"]?[^\s"',;\r\n]+['"]?/gi, '$1=[REDACTED_PASSWORD]');

    // 6. Cookies & Session Tokens
    sanitized = sanitized.replace(/(cookie|set-cookie):\s*([^;\r\n]+)/gi, '$1: [REDACTED_COOKIE]');

    // 7. URL Encoded Secrets (%22password%22%3A%22secret%22)
    sanitized = sanitized.replace(/(%22password%22%3A%22|%22token%22%3A%22|%22secret%22%3A%22)([^%"]+)/gi, '$1[REDACTED_SECRET]');

    // 8. PII (Emails & Credit Card patterns)
    sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
    sanitized = sanitized.replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CARD_NUMBER]');

    // 9. Local Absolute File Paths (Prevent internal filesystem exposure)
    sanitized = sanitized.replace(/([a-zA-Z]:\\|\/home\/|\/Users\/|\/usr\/|\/var\/)[^:\s\r\n"']+/g, (match) => {
      // Retain relative filename only
      const base = path.basename(match);
      return `[PATH]/.../${base}`;
    });

    return sanitized;
  }

  /**
   * Recursively sanitizes any JavaScript object, array, or primitive.
   */
  sanitizeObject(obj) {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitizedObj = {};
      const secretKeyPattern = /^(password|passwd|pwd|token|accessToken|authToken|secret|apiKey|api_key|authorization|cookie|session|privateKey|creditCard)$/i;

      for (const [key, value] of Object.entries(obj)) {
        if (secretKeyPattern.test(key) && typeof value === 'string') {
          sanitizedObj[key] = '[REDACTED_SECRET]';
        } else {
          sanitizedObj[key] = this.sanitizeObject(value);
        }
      }
      return sanitizedObj;
    }

    return obj;
  }

  /**
   * HTML Entity Escaping for XSS Prevention in UI/Report rendering
   */
  escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

module.exports = new SanitizerService();
