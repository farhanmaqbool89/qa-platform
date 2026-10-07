const sanitizer = require('../../../src/services/sanitizer.service');

/**
 * DOM & Snapshot Analyzer
 * Extracts candidate elements with their full attribute and state models.
 * Enforces size limits and prevents raw DOM leakage.
 */
class DomSnapshotAnalyzer {
  constructor() {
    this.maxDomSizeBytes = 2 * 1024 * 1024; // 2 MB
  }

  /**
   * Extracts candidates from a live Playwright page instance.
   */
  async extractFromPage(page) {
    if (!page) return [];

    try {
      return await page.evaluate(() => {
        const interactiveTags = 'button, input, a, select, [role], [data-testid], [data-qa], [data-cy]';
        const elements = Array.from(document.querySelectorAll(interactiveTags));

        // Limit candidate list to avoid DoS / memory bloat
        const limitedElements = elements.slice(0, 100);

        return limitedElements.map(el => {
          // Get nearest parent/ancestor id/class hint
          const parent = el.parentElement;
          const parentHint = parent ? `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : ''}` : '';

          return {
            tagName: el.tagName.toLowerCase(),
            id: el.id || '',
            className: typeof el.className === 'string' ? el.className : '',
            text: (el.innerText || el.value || '').trim().substring(0, 100),
            role: el.getAttribute('role') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            title: el.getAttribute('title') || '',
            dataTestId: el.getAttribute('data-testid') || '',
            dataQa: el.getAttribute('data-qa') || '',
            dataCy: el.getAttribute('data-cy') || '',
            isVisible: el.offsetWidth > 0 && el.offsetHeight > 0,
            isEnabled: !el.disabled,
            parentHint,
            outerHTML: el.outerHTML.substring(0, 300) // Minimal snippet
          };
        });
      });
    } catch (err) {
      console.error('[DomSnapshotAnalyzer] Page extraction failed, falling back to HTML parse:', err.message);
      return [];
    }
  }

  /**
   * Fallback regex-based HTML scanner if page instance is unavailable.
   */
  extractFromHtml(htmlStr) {
    if (!htmlStr) return [];

    const truncatedHtml = htmlStr.substring(0, this.maxDomSizeBytes);
    const candidates = [];

    const elementRegex = /<(button|input|a|select|span|img|svg)[^>]*>/gi;
    let match;
    let count = 0;

    while ((match = elementRegex.exec(truncatedHtml)) !== null && count < 100) {
      const tagOpen = match[0];
      const tagName = match[1].toLowerCase();

      // Extract attributes deterministically using standard regexes
      const getAttr = (name) => {
        const r = new RegExp(`\\b${name}\\s*=\\s*['"]([^'"]+)['"]`, 'i');
        const m = tagOpen.match(r);
        return m ? m[1] : '';
      };

      const startIdx = match.index + tagOpen.length;
      const endTag = `</${tagName}>`;
      const endIdx = truncatedHtml.indexOf(endTag, startIdx);
      let textContent = '';
      if (endIdx > -1 && endIdx - startIdx < 1000) {
        textContent = truncatedHtml.substring(startIdx, endIdx).replace(/<[^>]*>/g, '').trim().substring(0, 100);
      }

      const style = getAttr('style');
      const isVisible = !tagOpen.includes('hidden') &&
                        !/display\s*:\s*none/i.test(style) &&
                        !/visibility\s*:\s*hidden/i.test(style);
      const isEnabled = !tagOpen.includes('disabled') && !tagOpen.includes('disabled="disabled"');

      candidates.push({
        tagName,
        id: getAttr('id'),
        className: getAttr('class'),
        text: textContent,
        role: getAttr('role'),
        ariaLabel: getAttr('aria-label'),
        title: getAttr('title'),
        dataTestId: getAttr('data-testid'),
        dataQa: getAttr('data-qa'),
        dataCy: getAttr('data-cy'),
        isVisible,
        isEnabled,
        parentHint: '',
        outerHTML: tagOpen.substring(0, 300)
      });
      count++;
    }

    return candidates;
  }
}

module.exports = new DomSnapshotAnalyzer();
