const path = require('path');

/**
 * Evidence Normalizer
 * Sanitizes logs, parses exact stack trace locations, scenario names, exception types, failed locators, and assertion details.
 */
class EvidenceNormalizer {

  parseStackTrace(text) {
    if (!text) return { file: 'Unknown File', line: 0, method: 'Unknown Method' };

    const lines = text.split('\n');
    for (const lineText of lines) {
      // 1. "at CustomWorld.<anonymous> (steps/login.steps.js:13:10)" or "at submitRefund (steps/refund.steps.js:42:15)"
      const withMethodMatch = lineText.match(/at\s+([^\s()]+)\s*\(([^():]+):(\d+)(?::(\d+))?\)/);
      if (withMethodMatch) {
        const method = withMethodMatch[1].trim();
        const rawFile = withMethodMatch[2];
        const line = Number(withMethodMatch[3]);
        return { file: this.cleanFilePath(rawFile), line, method: this.cleanMethod(method, text) };
      }

      // 2. "at steps/login.steps.js:13:10" or "steps/refund.steps.js:42"
      const noMethodMatch = lineText.match(/(?:at\s+)?([^\s():]+\.(?:js|ts|feature)):(\d+)(?::(\d+))?/);
      if (noMethodMatch) {
        const rawFile = noMethodMatch[1];
        const line = Number(noMethodMatch[2]);
        return { file: this.cleanFilePath(rawFile), line, method: this.cleanMethod('Execution Step', text) };
      }
    }

    return { file: 'Unknown File', line: 0, method: 'Unknown Method' };
  }

  cleanFilePath(rawFile) {
    if (!rawFile) return 'Unknown File';
    let relativeFile = rawFile.replace(/:\d+.*$/, '');
    if (relativeFile.includes('steps')) {
      relativeFile = 'steps/' + relativeFile.substring(relativeFile.indexOf('steps') + 5).replace(/^[/\\]/, '');
    } else if (relativeFile.includes('pages')) {
      relativeFile = 'pages/' + relativeFile.substring(relativeFile.indexOf('pages') + 5).replace(/^[/\\]/, '');
    } else if (relativeFile.includes('features')) {
      relativeFile = 'features/' + relativeFile.substring(relativeFile.indexOf('features') + 8).replace(/^[/\\]/, '');
    } else {
      relativeFile = path.basename(relativeFile);
    }
    return relativeFile;
  }

  cleanMethod(method, text) {
    if (!method || method === 'Execution Step' || method === 'Object.<anonymous>') {
      const methodMatch = text.match(/(goto|click|fill|submitRefund|waitForSelector|waitForLocator|expect|assert[a-zA-Z]*)\s*\(/i);
      if (methodMatch) return `${methodMatch[1]}()`;
      return 'Execution Step';
    }
    return method;
  }

  extractScenarioName(text) {
    if (!text) return 'Unknown Scenario';
    const match = text.match(/(?:Scenario|Scenario Outline):\s*([^\r\n]+)/i);
    return match ? match[1].trim() : 'Unknown Scenario';
  }

  extractExceptionType(text) {
    if (!text) return 'Error';

    if (/TimeoutError|Timeout \d+ms exceeded/i.test(text)) return 'TimeoutError';
    if (/AssertionError/i.test(text)) return 'AssertionError';
    if (/TypeError/i.test(text)) return 'TypeError';
    if (/ReferenceError/i.test(text)) return 'ReferenceError';
    if (/500|502|503|ERR_CONNECTION_REFUSED/i.test(text)) return 'NetworkError';
    if (/401 Unauthorized|403 Forbidden/i.test(text)) return 'AuthenticationError';

    const match = text.match(/([a-zA-Z0-9_$]+Error):/);
    return match ? match[1] : 'Error';
  }

  extractFailedLocator(text) {
    if (!text) return null;

    const locatorPatterns = [
      /waiting for (?:locator|selector) (?:['"`])([^'"`]+)(?:['"`])/i,
      /locator\((?:['"`])([^'"`]+)(?:['"`])\)/i,
      /getByRole\(([^)]+)\)/i,
      /getByTestId\(([^)]+)\)/i,
      /element matching (?:['"`])([^'"`]+)(?:['"`])/i,
      /selector (?:['"`])([^'"`]+)(?:['"`]) not found/i
    ];

    for (const pattern of locatorPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  extractFailedAssertion(text) {
    if (!text) return null;

    const assertionPatterns = [
      /AssertionError \[ERR_ASSERTION\]:\s*([^\r\n]+)/i,
      /AssertionError:\s*([^\r\n]+)/i,
      /Expected values to be strictly equal:\s*([^\r\n]+)/i,
      /expect\([^)]+\)\.([a-zA-Z]+)\([^)]*\)/i
    ];

    for (const pattern of assertionPatterns) {
      const match = text.match(pattern);
      if (match) {
        return (match[1] || match[0]).trim();
      }
    }

    return null;
  }

  calculateEvidenceStrength(sources = {}) {
    let score = 0;
    if (sources.stackTrace) score += 35;
    if (sources.failedStep) score += 20;
    if (sources.consoleLogs) score += 15;
    if (sources.networkLogs) score += 15;
    if (sources.screenshot) score += 10;
    if (sources.trace) score += 5;
    return Math.min(score, 100);
  }

  extractFailedSteps(text) {
    if (!text) return ['Step execution failed'];
    const matches = text.match(/(Given|When|Then|And)\s+([^\r\n]+)/ig);
    return matches ? matches.map(s => s.trim()) : ['Step execution failed'];
  }
}

module.exports = new EvidenceNormalizer();
