const { Then } = require('@cucumber/cucumber');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const path = require('path');

/**
 * Cucumber BDD Step Definition:
 *   Then I perform accessibility audit on the page
 *
 * Scans the current authenticated Playwright page context using Axe-Core,
 * evaluates WCAG 2.1 AA rules, and saves a unified accessibility report
 * under the current execution's artifact directory.
 */
Then('I perform accessibility audit on the page', async function () {
  if (!this.page) {
    console.warn('⚠️ Accessibility Step Warning: Playwright page context not found.');
    return;
  }

  const executionId = this.executionId || process.env.CURRENT_EXECUTION_ID || `run_${Date.now()}`;
  const artifactDir = path.join(__dirname, '..', 'artifacts', executionId, 'accessibility');
  fs.mkdirSync(artifactDir, { recursive: true });

  const url = this.page.url();
  const pageTitle = await this.page.title();

  console.log(`♿ Running Axe-Core WCAG Audit on page: "${pageTitle}" (${url})...`);

  try {
    const results = await new AxeBuilder({ page: this.page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze();

    const criticalCount = results.violations.filter(v => v.impact === 'critical').length;
    const seriousCount = results.violations.filter(v => v.impact === 'serious').length;
    const moderateCount = results.violations.filter(v => v.impact === 'moderate').length;
    const minorCount = results.violations.filter(v => v.impact === 'minor').length;

    // Calculate score out of 100
    const penalty = (criticalCount * 15) + (seriousCount * 8) + (moderateCount * 4) + (minorCount * 2);
    const score = Math.max(0, 100 - penalty);

    const report = {
      scanId: `a11y_${executionId}`,
      executionId,
      url,
      targetTitle: pageTitle || 'Authenticated Application Page',
      scanTime: new Date().toISOString(),
      standard: 'WCAG 2.1 AA',
      score,
      summary: {
        score,
        totalViolationsCount: results.violations.length,
        criticalCount,
        seriousCount,
        moderateCount,
        minorCount,
        passedAuditsCount: results.passes.length,
        manualAuditsCount: results.incomplete.length
      },
      criticalIssues: results.violations.filter(v => v.impact === 'critical'),
      seriousIssues: results.violations.filter(v => v.impact === 'serious'),
      moderateIssues: results.violations.filter(v => v.impact === 'moderate'),
      minorIssues: results.violations.filter(v => v.impact === 'minor'),
      allViolations: results.violations,
      passedAudits: results.passes.map(p => ({
        id: p.id,
        description: p.description,
        help: p.help,
        helpUrl: p.helpUrl,
        passedNodesCount: p.nodes.length
      }))
    };

    const reportPath = path.join(artifactDir, 'a11y_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`✅ WCAG Accessibility Scan Completed! Score: ${score}/100 | Violations: ${results.violations.length}`);

    // Attach report summary to Cucumber Scenario World
    if (typeof this.attach === 'function') {
      this.attach(JSON.stringify({
        type: 'accessibility-audit',
        score,
        violations: results.violations.length,
        reportPath: `/artifacts/${executionId}/accessibility/a11y_report.json`
      }), 'application/json');
    }
  } catch (err) {
    console.error('❌ Accessibility Audit Error:', err.message);
  }
});
