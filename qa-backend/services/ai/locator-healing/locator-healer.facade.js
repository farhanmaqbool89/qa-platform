const originalLocatorAnalyzer = require('./original-locator.analyzer');
const domSnapshotAnalyzer = require('./dom-snapshot.analyzer');
const candidateGenerator = require('./candidate.generator');
const candidateScorer = require('./candidate.scorer');
const candidateValidator = require('./candidate.validator');
const confidenceGate = require('./confidence.gate');
const sanitizer = require('../../../src/services/sanitizer.service');
const fs = require('fs');
const path = require('path');
const aiCandidateRanker = require('./ai-candidate-ranker');

/**
 * Deterministic Locator Healer Facade
 * Central orchestration point for Phase 2A locator healing.
 * Enforces strict limits, sanitization bounds, and read-only validator locks.
 */
class LocatorHealerFacade {
  constructor() {
    this.maxAnalysisDurationMs = 3000;
    this.maxCandidates = 20;
    this.auditDir = path.resolve(__dirname, '../../../data/history/healing');
    this.ensureAuditDir();
  }

  ensureAuditDir() {
    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true });
    }
  }

  /**
   * Main healing runner
   */
  async heal(options = {}) {
    const start = Date.now();
    const {
      executionId = `exec_${Date.now()}`,
      projectName = 'default',
      scenarioName = 'unknown_scenario',
      stepText = '',
      originalLocator,
      originalAction = 'click',
      page = null,
      htmlSnapshot = ''
    } = options;

    if (!originalLocator) {
      return { status: 'REJECT', reasonCode: 'MISSING_ORIGINAL_LOCATOR', topCandidate: null, suggestions: [] };
    }

    // Guard against CSS / HTML selector injection attacks
    if (/[{};\r\n<]/.test(originalLocator)) {
      return { status: 'REJECT', reasonCode: 'MALFORMED_SELECTOR_DETECTED', topCandidate: null, suggestions: [] };
    }

    // Guard against path traversal in identifiers
    if (executionId.includes('..') || executionId.includes('/') || executionId.includes('\\') ||
        scenarioName.includes('..') || scenarioName.includes('/') || scenarioName.includes('\\')) {
      return { status: 'REJECT', reasonCode: 'PATH_TRAVERSAL_DETECTED', topCandidate: null, suggestions: [] };
    }

    try {
      // 1. Analyze Original Locator & Intent
      const originalAnalysis = originalLocatorAnalyzer.analyze(originalLocator, originalAction);

      // 2. Extract DOM Candidates (Primary: live Page, Fallback: HTML string)
      let rawElements = [];
      if (page) {
        rawElements = await domSnapshotAnalyzer.extractFromPage(page);
      } else if (htmlSnapshot) {
        rawElements = domSnapshotAnalyzer.extractFromHtml(htmlSnapshot);
      }

      // Limit candidates count early
      const limitedElements = rawElements.slice(0, this.maxCandidates);

      // 3. Generate candidate locators
      const allCandidates = [];
      limitedElements.forEach(el => {
        const generated = candidateGenerator.generate(el);
        generated.forEach(g => {
          allCandidates.push({
            selector: g.selector,
            strategy: g.strategy,
            element: el
          });
        });
      });

      // 4. Rank and Score candidates
      const rankedCandidates = candidateScorer.rankCandidates(allCandidates, originalAnalysis);

      // 5. Live Playwright Validation (if Page is active)
      let validatedCandidates = [];
      if (page) {
        validatedCandidates = await candidateValidator.validateBatch(page, rankedCandidates);
      } else {
        // Mock validation state if static snapshot run
        validatedCandidates = rankedCandidates.map(c => ({
          ...c,
          isValid: true,
          validationReason: 'Validation bypassed: no active page instance'
        }));
      }

      // 6. Tri-State Confidence Gate evaluation
      const gateResult = confidenceGate.evaluate(validatedCandidates);

      const durationMs = Date.now() - start;

      // 7. Construct Triage Output
      const triageReport = {
        executionId,
        project: projectName,
        scenarioName,
        stepText: sanitizer.sanitizeString(stepText),
        originalLocator,
        originalAction,
        status: gateResult.status,
        reasonCode: gateResult.reasonCode,
        topCandidate: gateResult.topCandidate,
        suggestions: gateResult.suggestions,
        durationMs,
        timestamp: new Date().toISOString()
      };

      // 8. Run AI Shadow / Advisory Ranker
      const aiMode = process.env.HEALING_AI_MODE || 'SHADOW';
      let aiResult = { status: 'UNAVAILABLE', reason: 'AI Ranking bypassed' };

      try {
        aiResult = await aiCandidateRanker.rank(originalAnalysis, validatedCandidates);
      } catch (ae) {
        console.error('[LocatorHealerFacade] AI Ranker exception:', ae.message);
      }

      triageReport.aiAudit = {
        mode: aiMode,
        status: aiResult.status,
        reason: aiResult.reason || '',
        confidence: aiResult.confidence || 0.0,
        uncertainty: aiResult.uncertainty || 'UNKNOWN',
        explanation: aiResult.explanation || ''
      };

      if (aiResult.status === 'SUCCESS' && aiResult.rankedCandidates && aiResult.rankedCandidates.length > 0) {
        triageReport.aiAudit.topRankedSelector = aiResult.rankedCandidates[0].selector;
        const detTopSelector = gateResult.topCandidate ? gateResult.topCandidate.selector : null;
        triageReport.aiAudit.agreesWithDeterministic = (detTopSelector === triageReport.aiAudit.topRankedSelector);

        if (aiMode === 'ADVISORY') {
          triageReport.aiAdvisory = {
            rankedCandidates: aiResult.rankedCandidates,
            explanation: aiResult.explanation
          };
        }
      }

      // Ensure 100% output sanitization before storage or emission
      const sanitizedReport = sanitizer.sanitizeObject(triageReport);

      // Log to audit history
      this.logAudit(sanitizedReport);

      return sanitizedReport;

    } catch (err) {
      console.error('[LocatorHealerFacade] Healing run threw unhandled error:', err.message);
      return {
        status: 'REJECT',
        reasonCode: 'UNHANDLED_EXCEPTION',
        message: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  logAudit(report) {
    try {
      const key = `${report.executionId}_${Date.now()}`;
      const logFile = path.join(this.auditDir, `${key}.json`);
      fs.writeFileSync(logFile, JSON.stringify(report, null, 2), 'utf8');
    } catch (e) {
      console.error('[LocatorHealerFacade] Failed writing audit log:', e.message);
    }
  }

  async captureAndPersistSnapshot(page, executionId, metadata = {}) {
    // Path traversal protection on executionId
    if (!executionId || executionId.includes('..') || executionId.includes('/') || executionId.includes('\\')) {
      throw new Error('Path traversal or invalid executionId detected');
    }

    try {
      // Fetch page content
      const rawContent = await page.content();

      // Enforce 2MB maximum limit
      const maxDomSizeBytes = 2 * 1024 * 1024;
      const truncatedContent = rawContent.substring(0, maxDomSizeBytes);

      // Sanitize (pii / secrets redaction)
      const sanitizedContent = sanitizer.sanitizeString(truncatedContent);

      // Ensure directory exists
      this.ensureAuditDir();

      // Write HTML snapshot
      const snapshotPath = path.join(this.auditDir, `dom_snapshot_${executionId}.html`);
      fs.writeFileSync(snapshotPath, sanitizedContent, 'utf8');

      // Write metadata JSON
      const metadataPath = path.join(this.auditDir, `metadata_${executionId}.json`);
      const fullMetadata = {
        executionId,
        snapshotAvailable: true,
        snapshotSize: Buffer.byteLength(sanitizedContent),
        sanitizedSnapshotPath: snapshotPath,
        timestamp: new Date().toISOString(),
        ...metadata
      };
      fs.writeFileSync(metadataPath, JSON.stringify(fullMetadata, null, 2), 'utf8');

      console.log(`[LocatorHealerFacade] Snapshot and metadata successfully saved for: ${executionId}`);
      return true;
    } catch (err) {
      console.error('[LocatorHealerFacade] Failed to capture and persist snapshot:', err.message);
      return false;
    }
  }
}

module.exports = new LocatorHealerFacade();
