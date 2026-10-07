const { setWorldConstructor, Before, After, Status, setDefaultTimeout } = require('@cucumber/cucumber');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const path = require('path');
const { emitEvent } = require('../../support/socket');
const browserService = require('../../services/browser/browser.service');
const sessionService = require('../../services/session.service');

setDefaultTimeout(30000);

class CustomWorld {
  async launchBrowser() {
    const executionId = process.env.CURRENT_EXECUTION_ID || 'default';
    const artifactBaseDir = process.env.ARTIFACT_DIR || path.join(__dirname, '../../artifacts', String(executionId));

    const screenshotsDir = path.join(artifactBaseDir, 'screenshots');
    const videosDir = path.join(artifactBaseDir, 'videos');
    const tracesDir = path.join(artifactBaseDir, 'traces');
    const a11yDir = path.join(artifactBaseDir, 'accessibility');

    fs.mkdirSync(screenshotsDir, { recursive: true });
    fs.mkdirSync(videosDir, { recursive: true });
    fs.mkdirSync(tracesDir, { recursive: true });
    fs.mkdirSync(a11yDir, { recursive: true });

    this.executionId = executionId;
    this.artifactBaseDir = artifactBaseDir;
    this.screenshotsDir = screenshotsDir;
    this.videosDir = videosDir;
    this.tracesDir = tracesDir;
    this.a11yDir = a11yDir;

    const browserMode = process.env.BROWSER_MODE || (process.env.HEADLESS === 'false' ? 'interactive' : 'headless');
    console.log('[Cucumber Process Layer 1 - World] Reading environment variables:', {
      BROWSER_MODE: process.env.BROWSER_MODE,
      HEADLESS: process.env.HEADLESS,
      resolvedMode: browserMode
    });
    this.browser = await browserService.launchBrowser(browserMode);

    let storageState = null;
    const sessionFile = process.env.SESSION_STATE_FILE;
    if (sessionFile && sessionFile !== 'none') {
      const explicitPath = path.join(__dirname, '../../artifacts/sessions', sessionFile);
      if (fs.existsSync(explicitPath)) {
        storageState = explicitPath;
      }
    }
    if (!storageState) {
      storageState = sessionService.getStorageState(process.env.TARGET_URL);
    }

    const enableVideo = process.env.ENABLE_VIDEO !== 'false';
    const contextOptions = {};
    if (enableVideo) {
      contextOptions.recordVideo = { dir: videosDir };
    }
    if (storageState) {
      contextOptions.storageState = storageState;
      console.log(`[CustomWorld] 🔑 Reusing saved login session state: ${storageState}`);
    }

    this.context = await this.browser.newContext(contextOptions);

    const enableTrace = process.env.ENABLE_TRACE !== 'false';
    if (enableTrace) {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });
    }

    this.page = await this.context.newPage();
  }

  async runAccessibilityScan(tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']) {
    if (!this.page) return null;

    if (process.env.TARGET_URL && (this.page.url() === 'about:blank' || !this.page.url())) {
      try {
        await this.page.goto(process.env.TARGET_URL, { timeout: 15000 });
      } catch (e) {
        console.error('Failed to navigate to TARGET_URL:', e.message);
      }
    }

    try {
      const results = await new AxeBuilder({ page: this.page })
        .withTags(tags)
        .analyze();

      const violations = results.violations.map(v => ({
        id: v.id,
        impact: v.impact || 'moderate',
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.map(node => ({
          target: node.target,
          html: node.html,
          failureSummary: node.failureSummary
        }))
      }));

      const criticalCount = violations.filter(v => v.impact === 'critical').length;
      const seriousCount = violations.filter(v => v.impact === 'serious').length;
      const moderateCount = violations.filter(v => v.impact === 'moderate').length;
      const minorCount = violations.filter(v => v.impact === 'minor').length;
      const pageTitle = (await this.page.title().catch(() => '')) || this.page.url();
      const score = Math.max(0, 100 - (criticalCount * 10 + seriousCount * 5 + moderateCount * 2));

      let criticalIssues = violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
      if (criticalIssues.length === 0 && violations.length > 0) {
        criticalIssues = [...violations];
      }

      const summary = {
        scanTime: new Date().toISOString(),
        url: this.page.url(),
        targetTitle: pageTitle,
        score,
        standard: 'WCAG 2.1 AA',
        passesCount: results.passes.length,
        violationsCount: violations.length,
        incompleteCount: results.incomplete.length,
        summary: {
          criticalCount,
          seriousCount,
          moderateCount,
          minorCount,
          totalViolationsCount: violations.length,
          passesCount: results.passes.length
        },
        criticalIssues,
        violations
      };

      const a11yFilePath = path.join(this.a11yDir, 'a11y_report.json');
      fs.writeFileSync(a11yFilePath, JSON.stringify(summary, null, 2), 'utf8');

      const a11yUrl = `/artifacts/${this.executionId}/accessibility/a11y_report.json`;

      emitEvent({
        type: 'accessibility-report',
        executionId: this.executionId,
        summary,
        reportUrl: a11yUrl
      });

      return summary;
    } catch (err) {
      console.error('Accessibility scan error:', err.message);
      return null;
    }
  }

  async closeBrowser(scenarioResult) {
    const scenarioName = scenarioResult?.pickle?.name
      ? scenarioResult.pickle.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      : `scenario_${Date.now()}`;

    // Capture Scenario Screenshot if enabled
    const enableScreenshots = process.env.ENABLE_SCREENSHOTS !== 'false';
    if (enableScreenshots && this.page && !this.page.isClosed()) {
      try {
        const isFail = scenarioResult && scenarioResult.result?.status === Status.FAILED;
        const screenshotFileName = `${isFail ? 'fail' : 'step'}_${scenarioName}.png`;
        const screenshotFilePath = path.join(this.screenshotsDir, screenshotFileName);
        await this.page.screenshot({ path: screenshotFilePath, fullPage: true });

        const screenshotUrl = `/artifacts/${this.executionId}/screenshots/${screenshotFileName}`;
        emitEvent({
          type: 'artifact',
          executionId: this.executionId,
          artifactType: 'screenshot',
          name: screenshotFileName,
          url: screenshotUrl
        });
      } catch (err) {
        console.error('Failed to capture screenshot:', err.message);
      }
    }

    // Export Trace Zip if enabled
    let traceUrl = null;
    const enableTrace = process.env.ENABLE_TRACE !== 'false';
    if (this.context) {
      try {
        if (enableTrace) {
          const traceFileName = `trace_${scenarioName}.zip`;
          const traceFilePath = path.join(this.tracesDir, traceFileName);
          await this.context.tracing.stop({ path: traceFilePath });
          traceUrl = `/artifacts/${this.executionId}/traces/${traceFileName}`;

          emitEvent({
            type: 'artifact',
            executionId: this.executionId,
            artifactType: 'trace',
            name: traceFileName,
            url: traceUrl
          });
        } else {
          await this.context.tracing.stop();
        }
      } catch (err) {
        console.error('Failed to export trace:', err.message);
      }
    }

    // Get Video path before context close if enabled
    const enableVideo = process.env.ENABLE_VIDEO !== 'false';
    const videoPage = this.page;

    if (this.context) {
      await this.context.close();
    }

    if (enableVideo && videoPage) {
      try {
        const video = videoPage.video();
        if (video) {
          const videoPath = await video.path();
          if (fs.existsSync(videoPath)) {
            const videoFileName = path.basename(videoPath);
            const videoUrl = `/artifacts/${this.executionId}/videos/${videoFileName}`;

            emitEvent({
              type: 'artifact',
              executionId: this.executionId,
              artifactType: 'video',
              name: videoFileName,
              url: videoUrl
            });
          }
        }
      } catch (err) {
        console.error('Failed to resolve video path:', err.message);
      }
    }

    if (this.context) {
      await sessionService.saveSession(this.context, process.env.TARGET_URL);
    }

    if (this.browser) {
      const isInteractiveMode = process.env.BROWSER_MODE === 'interactive' || process.env.HEADLESS === 'false';
      if (isInteractiveMode) {
        console.log('[CustomWorld] Interactive mode active: keeping browser window open on screen for 8 seconds...');
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
      await this.browser.close();
    }
  }
}

setWorldConstructor(CustomWorld);

Before(async function () {
  await this.launchBrowser();
});

After(async function (scenarioResult) {
  // Phase 2A: Capture failure DOM snapshot (best-effort, never fails the hook)
  if (scenarioResult && scenarioResult.result?.status === Status.FAILED && this.page) {
    const executionId = process.env.CURRENT_EXECUTION_ID || `exec_${Date.now()}`;
    const locatorHealer = require('../../services/ai/locator-healing/locator-healer.facade');
    await locatorHealer.captureAndPersistSnapshot(this.page, executionId, {
      scenarioId: scenarioResult.pickle?.id || '',
      scenarioName: scenarioResult.pickle?.name || ''
    });
  }

  // Automatically run WCAG 2.1/2.2 accessibility scan if enabled
  if (process.env.ENABLE_ACCESSIBILITY !== 'false') {
    await this.runAccessibilityScan();
  }
  await this.closeBrowser(scenarioResult);
});