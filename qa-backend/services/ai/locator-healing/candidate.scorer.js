/**
 * Candidate Scorer Module
 * Computes dynamic confidence scores using multiple independent evidence signals.
 * Enforces business action safety rules and candidate validation constraints.
 */
class CandidateScorer {

  constructor() {
    this.weights = {
      uniqueness: 0.15,
      businessAction: 0.15,
      stableAttributes: 0.10,
      tagCompatibility: 0.10,
      roleCompatibility: 0.10,
      accessibleName: 0.10,
      textSimilarity: 0.08,
      idSimilarity: 0.07,
      domRelationship: 0.05,
      visibility: 0.05,
      enabled: 0.05,
      marginSeparation: 0.06
    };
  }

  /**
   * Helper function calculating normalized Levenshtein string similarity (0.0 to 1.0)
   */
  getStringSimilarity(s1 = '', s2 = '') {
    const val1 = s1.trim().toLowerCase();
    const val2 = s2.trim().toLowerCase();
    if (val1 === val2) return 1.0;
    if (!val1 || !val2) return 0.0;

    const longer = val1.length > val2.length ? val1 : val2;
    const shorter = val1.length > val2.length ? val2 : val1;
    const longerLength = longer.length;

    const costs = [];
    for (let i = 0; i <= val1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= val2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (val1.charAt(i - 1) !== val2.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[val2.length] = lastValue;
    }
    return (longerLength - costs[val2.length]) / longerLength;
  }

  classifyIntent(text) {
    if (!text) return 'UNKNOWN';
    const textLower = text.toLowerCase();
    if (/\b(delete|remove|destroy|purge|trash)\b/i.test(textLower)) {
      return 'DELETE';
    }
    if (/\b(cancel|close|dismiss|back|abort)\b/i.test(textLower)) {
      return 'CANCEL';
    }
    if (/\b(submit|checkout|buy|order|pay|complete|confirm|approve|yes|agree)\b/i.test(textLower)) {
      return 'SUBMIT';
    }
    if (/\b(save|update|store|apply|draft)\b/i.test(textLower)) {
      return 'SAVE';
    }
    if (/\b(next|continue|forward)\b/i.test(textLower)) {
      return 'NEXT';
    }
    if (/\b(prev|previous|back)\b/i.test(textLower)) {
      return 'PREVIOUS';
    }
    if (/\b(enable|activate|unlock|turn-on)\b/i.test(textLower)) {
      return 'ENABLE';
    }
    if (/\b(disable|deactivate|lock|turn-off)\b/i.test(textLower)) {
      return 'DISABLE';
    }
    if (/\b(archive)\b/i.test(textLower)) {
      return 'ARCHIVE';
    }
    if (/\b(reject|deny|no|decline)\b/i.test(textLower)) {
      return 'REJECT';
    }
    return 'UNKNOWN';
  }

  scoreCandidate(candidate, originalAnalysis) {
    const el = candidate.element;

    // 1. Uniqueness Signal (default to 1.0 since candidate represents a single DOM element)
    const s_uniqueness = 1.0;

    // 2. Business Action Compatibility & Safety Veto Check
    let s_businessAction = 0.5; // neutral base
    if (originalAnalysis.intent !== 'UNKNOWN') {
      const candTextLower = (el.text + ' ' + el.dataTestId + ' ' + el.dataQa + ' ' + el.dataCy + ' ' + el.id + ' ' + el.ariaLabel).toLowerCase();

      const candidateIntent = this.classifyIntent(candTextLower);
      if (candidateIntent !== 'UNKNOWN' && candidateIntent !== originalAnalysis.intent) {
        // Veto action clash pairs
        const isClash =
          (originalAnalysis.intent === 'SUBMIT' && candidateIntent === 'CANCEL') ||
          (originalAnalysis.intent === 'CANCEL' && candidateIntent === 'SUBMIT') ||
          (originalAnalysis.intent === 'DELETE' && candidateIntent === 'SAVE') ||
          (originalAnalysis.intent === 'SAVE' && candidateIntent === 'DELETE') ||
          (originalAnalysis.intent === 'DELETE' && candidateIntent === 'ARCHIVE') ||
          (originalAnalysis.intent === 'NEXT' && candidateIntent === 'PREVIOUS') ||
          (originalAnalysis.intent === 'PREVIOUS' && candidateIntent === 'NEXT') ||
          (originalAnalysis.intent === 'ENABLE' && candidateIntent === 'DISABLE') ||
          (originalAnalysis.intent === 'DISABLE' && candidateIntent === 'ENABLE') ||
          (originalAnalysis.intent === 'CONFIRM' && candidateIntent === 'REJECT') ||
          (originalAnalysis.intent === 'REJECT' && candidateIntent === 'CONFIRM');

        if (isClash) {
          return { score: 0.0, isVetoed: true, vetoReason: `Hard semantic action clash: ${originalAnalysis.intent} vs ${candidateIntent}` };
        }
      }

      // Exact semantic alignment
      const actionPatterns = {
        SUBMIT: /\b(submit|checkout|buy|order|pay|complete|confirm)\b/i,
        CANCEL: /\b(cancel|close|dismiss|back|abort)\b/i,
        DELETE: /\b(delete|remove|destroy|purge|trash)\b/i,
        SAVE: /\b(save|update|store|apply|draft)\b/i,
        CONFIRM: /\b(confirm|approve|yes|agree)\b/i,
        REJECT: /\b(reject|deny|no|decline)\b/i
      };

      const matchPattern = actionPatterns[originalAnalysis.intent];
      if (matchPattern && matchPattern.test(candTextLower)) {
        s_businessAction = 1.0;
      } else {
        s_businessAction = 0.2; // Match mismatch penalty
      }
    }

    // 3. Stable Attributes Presence (data-testid, data-qa, data-cy, id)
    const s_stableAttributes = (el.dataTestId || el.dataQa || el.dataCy || el.id) ? 1.0 : 0.0;

    // 4. Tag Compatibility (Span/div with role="button" is compatible with button tag)
    const s_tagCompatibility = (originalAnalysis.tagHint !== 'unknown' &&
      (el.tagName === originalAnalysis.tagHint || (originalAnalysis.tagHint === 'button' && el.role === 'button'))) ? 1.0 : 0.5;

    // 5. Role Compatibility
    const s_roleCompatibility = el.role ? 0.8 : 0.5; // neutral role weighting

    // 6. Accessible Name Match (Default to 1.0 if not specified in original locator)
    const s_accessibleName = originalAnalysis.textHint
      ? (el.ariaLabel ? this.getStringSimilarity(originalAnalysis.textHint, el.ariaLabel) : 0.0)
      : 1.0;

    // 7. Text Similarity (Default to 1.0 if not specified in original locator)
    const s_textSimilarity = originalAnalysis.textHint
      ? (el.text ? this.getStringSimilarity(originalAnalysis.textHint, el.text) : 0.0)
      : 1.0;

    // 8. ID Similarity (Default to 1.0 if not specified in original locator)
    const s_idSimilarity = originalAnalysis.idHint
      ? (el.id ? this.getStringSimilarity(originalAnalysis.idHint, el.id) : 0.0)
      : 1.0;

    // 9. DOM Relationship / Ancestor containment
    const s_domRelationship = el.parentHint ? 0.8 : 0.5;

    // 10. Live Visibility
    const s_visibility = el.isVisible ? 1.0 : 0.0;

    // 11. Enabled State
    const s_enabled = el.isEnabled ? 1.0 : 0.0;

    // Accumulate weighted scores
    let finalScore =
      (s_uniqueness * this.weights.uniqueness) +
      (s_businessAction * this.weights.businessAction) +
      (s_stableAttributes * this.weights.stableAttributes) +
      (s_tagCompatibility * this.weights.tagCompatibility) +
      (s_roleCompatibility * this.weights.roleCompatibility) +
      (s_accessibleName * this.weights.accessibleName) +
      (s_textSimilarity * this.weights.textSimilarity) +
      (s_idSimilarity * this.weights.idSimilarity) +
      (s_domRelationship * this.weights.domRelationship) +
      (s_visibility * this.weights.visibility) +
      (s_enabled * this.weights.enabled);

    // Apply safety cap if element lacks stable test-ids or IDs
    if (!el.dataTestId && !el.dataQa && !el.dataCy && !el.id) {
      finalScore = Math.min(0.79, finalScore);
    }

    // Apply attribute mismatch penalties based on matching strategy
    if (candidate.strategy === 'ID' && originalAnalysis.idHint && el.id !== originalAnalysis.idHint) {
      finalScore -= 0.15;
    }
    if (candidate.strategy === 'TEXT' && originalAnalysis.textHint && el.text !== originalAnalysis.textHint) {
      finalScore -= 0.10;
    }
    if (originalAnalysis.tagHint !== 'unknown' && el.tagName !== originalAnalysis.tagHint) {
      finalScore -= 0.10;
    }

    // Apply strategy shift penalty
    let preferredStrategy = 'unknown';
    if (originalAnalysis.idHint) preferredStrategy = 'ID';
    else if (originalAnalysis.originalLocator.includes('data-testid') || originalAnalysis.originalLocator.includes('data-qa') || originalAnalysis.originalLocator.includes('data-cy')) {
      preferredStrategy = 'TEST_ID';
    } else if (originalAnalysis.textHint) preferredStrategy = 'TEXT';

    if (preferredStrategy !== 'unknown' && candidate.strategy !== preferredStrategy && candidate.strategy !== 'TEST_ID') {
      finalScore -= 0.10;
    }

    // Keep score bounded between 0.0 and 1.0
    finalScore = Math.max(0.0, Math.min(1.0, finalScore));

    // Hard Veto: Element must be visible and enabled
    if (el.isVisible === false) {
      return { score: 0.0, isVetoed: true, vetoReason: 'Target element is hidden' };
    }
    if (el.isEnabled === false) {
      return { score: 0.0, isVetoed: true, vetoReason: 'Target element is disabled' };
    }

    return {
      score: Math.round(finalScore * 100) / 100,
      isVetoed: false,
      vetoReason: ''
    };
  }

  /**
   * Sorts candidates and applies Margin Separation Signal (Signal 12)
   */
  rankCandidates(candidates, originalAnalysis) {
    const scored = candidates.map(cand => {
      const res = this.scoreCandidate(cand, originalAnalysis);
      return {
        ...cand,
        score: res.score,
        isVetoed: res.isVetoed,
        vetoReason: res.vetoReason
      };
    }).filter(c => !c.isVetoed && c.score > 0.1);

    scored.sort((a, b) => b.score - a.score);

    // Apply Margin Separation Signal if at least 2 candidates exist
    if (scored.length > 0) {
      if (scored.length >= 2) {
        const margin = scored[0].score - scored[1].score;
        scored[0].margin = Math.round(margin * 100) / 100;
        // Inject margin into first candidate score
        scored[0].score = Math.min(1.0, scored[0].score + (margin * this.weights.marginSeparation));
      } else {
        scored[0].margin = scored[0].score;
        scored[0].score = Math.min(1.0, scored[0].score + (scored[0].score * this.weights.marginSeparation));
      }
    }

    return scored;
  }
}

module.exports = new CandidateScorer();
