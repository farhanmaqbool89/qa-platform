/**
 * Confidence Gate & Tri-State Evaluator
 * Evaluates candidate scores and validation results to classify recommendations
 * into strictly defined tri-state outcomes: ACCEPT, SUGGEST, or REJECT.
 */
class ConfidenceGate {

  constructor() {
    this.minAcceptScore = 0.85;
    this.minSuggestScore = 0.60;
    this.minSafetyMargin = 0.15;
  }

  evaluate(candidates = []) {
    if (candidates.length === 0) {
      return {
        status: 'REJECT',
        reasonCode: 'NO_CANDIDATES',
        topCandidate: null,
        suggestions: []
      };
    }

    const validated = candidates.filter(c => c.isValid);
    if (validated.length === 0) {
      return {
        status: 'REJECT',
        reasonCode: 'LIVE_VALIDATION_FAILED',
        topCandidate: null,
        suggestions: []
      };
    }

    const top = validated[0];

    // Find the next best candidate representing a DIFFERENT DOM element
    let nextBestDiffElement = null;
    for (let i = 1; i < validated.length; i++) {
      const c = validated[i];
      const isSameElement = top.element && c.element &&
        (top.element === c.element ||
         (top.element.outerHTML === c.element.outerHTML && top.element.id === c.element.id));
      if (!isSameElement) {
        nextBestDiffElement = c;
        break;
      }
    }

    let safetyMarginPassed = true;
    if (nextBestDiffElement) {
      const margin = top.score - nextBestDiffElement.score;
      top.margin = Math.round(margin * 100) / 100;
      if (margin < this.minSafetyMargin) {
        safetyMarginPassed = false;
      }
    } else {
      top.margin = top.score;
    }

    // 1. High Confidence: ACCEPT (Advisory recommendation for QA review)
    if (top.score >= this.minAcceptScore && safetyMarginPassed) {
      return {
        status: 'ACCEPT',
        reasonCode: 'HIGH_CONFIDENCE_MATCH',
        topCandidate: {
          selector: top.selector,
          strategy: top.strategy,
          score: top.score,
          margin: top.margin || 0
        },
        suggestions: validated.slice(1, 5).map(c => ({
          selector: c.selector,
          strategy: c.strategy,
          score: c.score
        }))
      };
    }

    // 2. Medium Confidence: SUGGEST (Presented as an advisory option)
    if (top.score >= this.minSuggestScore) {
      return {
        status: 'SUGGEST',
        reasonCode: safetyMarginPassed ? 'MEDIUM_CONFIDENCE_MATCH' : 'AMBIGUOUS_CANDIDATES_MARGIN_LOW',
        topCandidate: {
          selector: top.selector,
          strategy: top.strategy,
          score: top.score,
          margin: top.margin || 0
        },
        suggestions: validated.slice(1, 5).map(c => ({
          selector: c.selector,
          strategy: c.strategy,
          score: c.score
        }))
      };
    }

    // 3. Low Confidence: REJECT
    return {
      status: 'REJECT',
      reasonCode: 'INSUFFICIENT_CONFIDENCE',
      topCandidate: {
        selector: top.selector,
        strategy: top.strategy,
        score: top.score,
        margin: top.margin || 0
      },
      suggestions: []
    };
  }
}

module.exports = new ConfidenceGate();
