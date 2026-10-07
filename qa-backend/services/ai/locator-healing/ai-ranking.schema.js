class AiRankingSchema {

  validate(responseObj, inputCandidateIds = []) {
    if (!responseObj || typeof responseObj !== 'object') {
      throw new Error('AI response is not a valid JSON object');
    }

    // 1. Validate root level properties
    if (!Array.isArray(responseObj.rankedCandidates)) {
      throw new Error('Schema validation error: rankedCandidates must be an array');
    }

    if (typeof responseObj.confidence !== 'number' || isNaN(responseObj.confidence)) {
      throw new Error('Schema validation error: confidence must be a number');
    }

    const uncertaintyValues = ['LOW', 'MEDIUM', 'HIGH'];
    if (typeof responseObj.uncertainty !== 'string' || !uncertaintyValues.includes(responseObj.uncertainty.toUpperCase())) {
      throw new Error('Schema validation error: uncertainty must be LOW, MEDIUM, or HIGH');
    }

    if (typeof responseObj.explanation !== 'string') {
      throw new Error('Schema validation error: explanation must be a string');
    }

    // 2. Validate ranked candidates and cross-reference with input IDs
    const validatedRanked = [];
    const seenIds = new Set();

    for (const item of responseObj.rankedCandidates) {
      if (!item || typeof item !== 'object') continue;

      const cid = item.candidateId;
      if (typeof cid !== 'string' || !cid) {
        throw new Error('Schema validation error: candidateId is missing or invalid in ranked item');
      }

      // Detect and drop invented/unknown candidate IDs (Strict security requirement!)
      if (!inputCandidateIds.includes(cid)) {
        console.warn(`[AiRankingSchema] Dropping unknown/invented candidate ID from LLM response: ${cid}`);
        continue;
      }

      // Check duplicates in response
      if (seenIds.has(cid)) {
        continue;
      }
      seenIds.add(cid);

      const rank = item.rank;
      if (typeof rank !== 'number' || isNaN(rank)) {
        throw new Error(`Schema validation error: rank must be a number for candidate: ${cid}`);
      }

      const reasonCodes = [];
      if (Array.isArray(item.reasonCodes)) {
        item.reasonCodes.forEach(rc => {
          if (typeof rc === 'string' && rc.length < 50) {
            reasonCodes.push(rc.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
          }
        });
      }

      validatedRanked.push({
        candidateId: cid,
        rank,
        reasonCodes
      });
    }

    // Must return at least one valid candidate from input list
    if (validatedRanked.length === 0 && inputCandidateIds.length > 0) {
      throw new Error('Schema validation error: rankedCandidates did not contain any valid candidate IDs matching the input');
    }

    // Sort by rank ascending
    validatedRanked.sort((a, b) => a.rank - b.rank);

    return {
      rankedCandidates: validatedRanked,
      confidence: Math.max(0.0, Math.min(1.0, responseObj.confidence)),
      uncertainty: responseObj.uncertainty.toUpperCase(),
      explanation: responseObj.explanation
    };
  }
}

module.exports = new AiRankingSchema();
