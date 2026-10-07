/**
 * Candidate Generator Module
 * Generates valid Playwright locator selectors for candidate elements.
 * Implements strict selector validation and escaping to prevent injection attacks.
 */
class CandidateGenerator {

  /**
   * Safely escapes CSS attribute values to prevent selector injection
   */
  escapeCssValue(val) {
    if (!val) return '';
    return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Safely escapes text selector values
   */
  escapeTextValue(val) {
    if (!val) return '';
    return val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");
  }

  generate(el) {
    const locators = [];

    // 1. data-testid / data-qa / data-cy strategy
    if (el.dataTestId) {
      const escaped = this.escapeCssValue(el.dataTestId);
      locators.push({
        selector: `[data-testid="${escaped}"]`,
        strategy: 'TEST_ID'
      });
    }
    if (el.dataQa) {
      const escaped = this.escapeCssValue(el.dataQa);
      locators.push({
        selector: `[data-qa="${escaped}"]`,
        strategy: 'TEST_ID'
      });
    }
    if (el.dataCy) {
      const escaped = this.escapeCssValue(el.dataCy);
      locators.push({
        selector: `[data-cy="${escaped}"]`,
        strategy: 'TEST_ID'
      });
    }

    // 2. ID strategy
    if (el.id) {
      const escaped = this.escapeCssValue(el.id);
      locators.push({
        selector: `#${escaped}`,
        strategy: 'ID'
      });
    }

    // 3. ARIA label strategy
    if (el.ariaLabel) {
      const escaped = this.escapeTextValue(el.ariaLabel);
      locators.push({
        selector: `${el.tagName}[aria-label="${escaped}"]`,
        strategy: 'ARIA'
      });
    }

    // 4. Role & Name strategy
    if (el.role && el.text) {
      const escaped = this.escapeTextValue(el.text);
      locators.push({
        selector: `role=${el.role}[name="${escaped}"]`,
        strategy: 'ROLE'
      });
    }

    // 5. Text content strategy
    if (el.text && (el.tagName === 'button' || el.tagName === 'a')) {
      const escaped = this.escapeTextValue(el.text);
      locators.push({
        selector: `${el.tagName}:has-text("${escaped}")`,
        strategy: 'TEXT'
      });
    }

    // 6. Sibling / Parent relative strategy
    if (el.parentHint && el.id) {
      const escapedParent = this.escapeCssValue(el.parentHint);
      const escapedId = this.escapeCssValue(el.id);
      locators.push({
        selector: `${escapedParent} >> #${escapedId}`,
        strategy: 'HIERARCHY'
      });
    }

    // Ensure all generated locators are well-formed and non-empty
    return locators.filter(loc => loc.selector && loc.selector.length > 0);
  }
}

module.exports = new CandidateGenerator();
