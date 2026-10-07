/**
 * Original Locator & Action Analyzer
 * Parses the original broken locator and requested action to extract semantic intent,
 * expected tag, and text/ID hints.
 */
class OriginalLocatorAnalyzer {

  analyze(locatorStr, actionStr = '') {
    const locator = (locatorStr || '').trim();
    const action = (actionStr || '').trim().toLowerCase();

    const result = {
      originalLocator: locator,
      originalAction: action,
      intent: 'UNKNOWN',
      tagHint: 'unknown',
      textHint: '',
      idHint: ''
    };

    // 1. Determine Business Intent Semantics
    const textLower = (locator + ' ' + action).toLowerCase();

    if (/\b(cancel|close|dismiss|back|abort)\b/i.test(textLower)) {
      result.intent = 'CANCEL';
    } else if (/\b(delete|remove|destroy|purge|trash)\b/i.test(textLower)) {
      result.intent = 'DELETE';
    } else if (/\b(submit|checkout|buy|order|purchase|pay|complete)\b/i.test(textLower)) {
      result.intent = 'SUBMIT';
    } else if (/\b(archive)\b/i.test(textLower)) {
      result.intent = 'ARCHIVE';
    } else if (/\b(save|update|store|apply|draft)\b/i.test(textLower)) {
      result.intent = 'SAVE';
    } else if (/\b(confirm|approve|yes|agree)\b/i.test(textLower)) {
      result.intent = 'CONFIRM';
    } else if (/\b(reject|deny|no|decline)\b/i.test(textLower)) {
      result.intent = 'REJECT';
    } else if (/\b(next|forward|continue)\b/i.test(textLower)) {
      result.intent = 'NEXT';
    } else if (/\b(prev|previous|backwards)\b/i.test(textLower)) {
      result.intent = 'PREVIOUS';
    } else if (/\b(enable|activate|unlock|turn-on)\b/i.test(textLower)) {
      result.intent = 'ENABLE';
    } else if (/\b(disable|deactivate|lock|turn-off)\b/i.test(textLower)) {
      result.intent = 'DISABLE';
    }

    // 2. Extract Tag Hint
    if (/\b(button|submit|btn)\b/i.test(locator)) {
      result.tagHint = 'button';
    } else if (/\b(input|text|email|password|text-field)\b/i.test(locator)) {
      result.tagHint = 'input';
    } else if (/\b(select|dropdown|combobox)\b/i.test(locator)) {
      result.tagHint = 'select';
    } else if (/\b(a|link|href)\b/i.test(locator)) {
      result.tagHint = 'a';
    }

    // 3. Extract ID and Text Hints using Regex
    const idMatch = locator.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      result.idHint = idMatch[1];
    }

    const textMatch = locator.match(/(?:has-text|text|label|value|alt|title)\(['"]([^'"]+)['"]\)/i);
    if (textMatch) {
      result.textHint = textMatch[1];
    } else {
      // Also support bracketed attributes like [aria-label="Toggle Navigation"]
      const attrMatch = locator.match(/\[(?:aria-label|title|alt|value|placeholder)\s*=\s*['"]([^'"]+)['"]\]/i);
      if (attrMatch) {
        result.textHint = attrMatch[1];
      }
    }

    return result;
  }
}

module.exports = new OriginalLocatorAnalyzer();
