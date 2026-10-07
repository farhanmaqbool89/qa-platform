/**
 * Live Playwright Candidate Validator
 * Performs strictly READ-ONLY checks against active page instance to verify candidate selector validity.
 * NO clicks, forms submissions, page navigations, state changes, or script injections are allowed.
 */
class CandidateValidator {

  constructor() {
    this.maxValidationAttempts = 5;
  }

  /**
   * Safe read-only validation of candidate selector against Playwright page instance
   */
  async validate(page, selector) {
    if (!page) {
      return { isValid: false, reason: 'Live Playwright Page instance unavailable' };
    }

    try {
      // 1. Uniqueness check: must resolve to exactly ONE element
      const count = await page.locator(selector).count();
      if (count === 0) {
        return { isValid: false, reason: 'Selector resolved to 0 elements' };
      }
      if (count > 1) {
        return { isValid: false, reason: `Ambiguous selector: resolved to ${count} elements` };
      }

      // 2. Read-only state checks: Visibility and Enabled states
      const loc = page.locator(selector);
      const isVisible = await loc.isVisible();
      const isEnabled = await loc.isEnabled();

      if (!isVisible) {
        return { isValid: false, reason: 'Selector element is hidden' };
      }
      if (!isEnabled) {
        return { isValid: false, reason: 'Selector element is disabled' };
      }

      return {
        isValid: true,
        reason: 'Live target resolved, unique, visible, and enabled'
      };

    } catch (err) {
      return {
        isValid: false,
        reason: `Locator evaluation threw error: ${err.message}`
      };
    }
  }

  /**
   * Validates a batch of candidates, respecting the maxValidationAttempts guard
   */
  async validateBatch(page, candidates) {
    const validated = [];
    let attempts = 0;

    for (const cand of candidates) {
      if (attempts >= this.maxValidationAttempts) {
        validated.push({
          ...cand,
          isValid: false,
          validationReason: 'Skipped: Max validation attempts limit reached'
        });
        continue;
      }

      attempts++;
      const res = await this.validate(page, cand.selector);

      validated.push({
        ...cand,
        isValid: res.isValid,
        validationReason: res.reason
      });
    }

    return validated;
  }
}

module.exports = new CandidateValidator();
