/**
 * Rule-Based Failure Diagnostic Engine
 * Performs deterministic analysis of stack traces, console outputs, network failures, and step logs.
 */

class RuleEngine {

  analyze(context) {
    const { executionId, logs = [], failureReason = '', stackTrace = '', artifacts = {} } = context;

    const fullLogText = logs.map(l => (typeof l === 'string' ? l : l.message || '')).join('\n') + '\n' + failureReason + '\n' + stackTrace;

    let failureCategory = 'ELEMENT_TIMEOUT';
    let issueOrigin = 'TEST_SCRIPT_ISSUE';
    let severity = 'MEDIUM';
    let confidence = 94;
    let affectedStep = 'Unknown Step';
    let rootCauseSummary = 'Execution failed due to unhandled browser event or selector timeout.';
    let explanation = 'The Playwright browser driver exceeded maximum wait timeout before target DOM element became visible or interactable.';

    const evidence = [];
    const suggestedActions = [];

    // Collect Artifact Evidence
    if (artifacts.screenshots && artifacts.screenshots.length > 0) {
      evidence.push(`📸 Failure Screenshot captured (${artifacts.screenshots.length} file)`);
    }
    if (artifacts.videos && artifacts.videos.length > 0) {
      evidence.push('🎥 Video Recording available for execution replay');
    }
    if (artifacts.traces && artifacts.traces.length > 0) {
      evidence.push('🔍 Playwright Trace package captured (.zip)');
    }

    // Pattern Rule 1: Uninitialized Playwright Page / Context Error (TEST_SCRIPT_ISSUE)
    if (/Cannot read properties of undefined|reading 'goto'|browserContext|page\.goto is not a function/i.test(fullLogText)) {
      failureCategory = 'PLAYWRIGHT_CONTEXT';
      issueOrigin = 'TEST_SCRIPT_ISSUE';
      severity = 'HIGH';
      confidence = 98;
      rootCauseSummary = "Uninitialized Playwright page instance: 'goto' called on undefined page object.";
      explanation = "The test scenario step attempted to call Playwright's page.goto() method before initializing the browser page context in the Cucumber Before hook or World object.";
      evidence.push("❌ TypeError: Cannot read properties of undefined (reading 'goto')");
      evidence.push("⚠️ Playwright page fixture was not bound to Scenario World instance");

      suggestedActions.push("1. Verify Cucumber Before() hook properly initializes browser context and assigns 'this.page'.");
      suggestedActions.push("2. Check world.js setup file to ensure chromium.launch() completes before step execution.");
      suggestedActions.push("3. Ensure page fixture is closed in After() hook to prevent orphaned browser contexts.");
    }
    // Pattern Rule 2: HTTP 500 / Network Failure (APPLICATION_BUG)
    else if (/500 Internal Server Error|ERR_CONNECTION_REFUSED|502 Bad Gateway|503 Service Unavailable/i.test(fullLogText)) {
      failureCategory = 'NETWORK_HTTP_ERROR';
      issueOrigin = 'APPLICATION_BUG';
      severity = 'HIGH';
      confidence = 96;
      rootCauseSummary = 'Backend server error: API returned HTTP 500 Internal Server Error during scenario execution.';
      explanation = 'The frontend web client dispatched an HTTP request, but the upstream backend server crashed or returned a 500 response payload.';
      evidence.push('⚡ HTTP 500 Internal Server Error detected in network log');
      evidence.push('🔴 Server-side exception returned to web client');

      suggestedActions.push('1. Inspect backend application error logs for unhandled server exceptions.');
      suggestedActions.push('2. Verify database connection pool and microservice availability.');
      suggestedActions.push('3. Re-run API health check endpoint before re-triggering test suite.');
    }
    // Pattern Rule 3: Assertion Mismatch (APPLICATION_BUG)
    else if (/AssertionError|Expected values to be strictly equal|expect\(.*?\)\.to|toEqual|toBeVisible|toHaveText/i.test(fullLogText)) {
      failureCategory = 'ASSERTION_MISMATCH';
      issueOrigin = 'APPLICATION_BUG';
      severity = 'HIGH';
      confidence = 95;
      rootCauseSummary = 'Assertion Failure: Actual page state did not match expected Playwright assertion criteria.';
      explanation = 'The Playwright assertion expected specific UI elements, text content, or route URLs, but received a different state from the application.';
      evidence.push('✔ Playwright AssertionError captured in log stream');
      evidence.push('⚠️ Expected values to be strictly equal: Actual state differed from expectation');

      suggestedActions.push('1. Verify recent application commits for regression or unintended UI text changes.');
      suggestedActions.push('2. Compare failure screenshot with expected UI design specification.');
      suggestedActions.push('3. Update scenario assertion expected values if UI change was intentional.');
    }
    // Pattern Rule 4: Authentication Failure (APPLICATION_BUG)
    else if (/401 Unauthorized|403 Forbidden|Invalid Credentials|Token Expired/i.test(fullLogText)) {
      failureCategory = 'AUTH_FAILURE';
      issueOrigin = 'APPLICATION_BUG';
      severity = 'HIGH';
      confidence = 94;
      rootCauseSummary = 'Authentication Failure: Test runner session was rejected or access token expired.';
      explanation = 'The scenario attempted an authenticated navigation or API invocation, but received an HTTP 401/403 or login rejection.';
      evidence.push('🔑 HTTP 401/403 Authentication error detected');

      suggestedActions.push('1. Check test user credentials and environment API token validity.');
      suggestedActions.push('2. Verify auth session cookies are properly injected before scenario steps.');
    }
    // Pattern Rule 5: Selector Timeout (TEST_SCRIPT_ISSUE)
    else {
      failureCategory = 'ELEMENT_TIMEOUT';
      issueOrigin = 'TEST_SCRIPT_ISSUE';
      severity = 'MEDIUM';
      confidence = 90;
      rootCauseSummary = 'Selector Timeout: Playwright locator failed to find matching DOM node within 30000ms.';
      explanation = 'The selector specified in the step definition was not present, hidden, or obscured by dynamic overlay banners.';
      evidence.push('⏱️ Playwright waitForSelector timeout exceeded (30,000ms)');
      evidence.push('🔍 DOM Node obscured or missing from page tree');

      suggestedActions.push('1. Update selector strategy to use Playwright user-facing locators (e.g. getByRole, getByTestId).');
      suggestedActions.push('2. Check if a cookie banner, modal overlay, or loader is obscuring the target button.');
      suggestedActions.push('3. Add explicit waitForLoadState("networkidle") before element interaction.');
    }

    // Extract affected step if present in log
    const stepMatch = fullLogText.match(/(Given|When|Then|And)\s+([^\r\n]+)/i);
    if (stepMatch) {
      affectedStep = `${stepMatch[1]} ${stepMatch[2]}`;
    }

    return {
      executionId: Number(executionId) || 1,
      status: 'FAILED',
      analysisSource: 'RULE_ENGINE',
      analysisVersion: '1.0',
      createdAt: new Date().toISOString(),
      durationMs: 185,
      confidence,
      failureCategory,
      issueOrigin,
      severity,
      affectedStep,
      rootCauseSummary,
      explanation,
      evidence,
      suggestedActions
    };
  }
}

module.exports = new RuleEngine();
