const { BROWSER_MODES, getLaunchOptions } = require('./browser-options');
const browserPoolManager = require('./browser-pool.manager');
const sessionService = require('../session.service');

/**
 * Enterprise Browser Service (Milestone 4 Refactor)
 * Delegates all browser, context, and page allocations to BrowserPoolManager.
 * Integrates storageState injection and authentication session persistence.
 */
class BrowserService {
  constructor() {
    this.BROWSER_MODES = BROWSER_MODES;
    this.poolManager = browserPoolManager;
  }

  /**
   * Resolve and normalize browser mode parameter
   */
  resolveBrowserMode(mode) {
    if (typeof mode === 'string' && mode.toLowerCase() === BROWSER_MODES.INTERACTIVE) {
      return BROWSER_MODES.INTERACTIVE;
    }
    return BROWSER_MODES.HEADLESS;
  }

  /**
   * Milestone 4 API: Allocate browser through BrowserPoolManager
   */
  async launchBrowser(browserMode = BROWSER_MODES.HEADLESS, options = {}, sessionKey = 'default_QA') {
    const resolvedMode = this.resolveBrowserMode(browserMode);
    return this.poolManager.getOrCreateBrowser(sessionKey, resolvedMode, options);
  }

  /**
   * Milestone 4 API: Allocate context and page through BrowserPoolManager
   */
  async createContextAndPage(browser, options = {}, sessionKey = 'default_QA') {
    const context = await this.poolManager.getOrCreateContext(sessionKey, BROWSER_MODES.HEADLESS, options);
    const page = await this.poolManager.getOrCreatePage(sessionKey, BROWSER_MODES.HEADLESS, options);
    return { context, page };
  }

  /**
   * Milestone 3 & 4 API: Create Authenticated Context and Page via SessionService & BrowserPoolManager
   */
  async createAuthenticatedContextAndPage({ projectId = 'customerportal', environment = 'QA', domainUrl = '', browserMode = BROWSER_MODES.HEADLESS, extraOptions = {} } = {}) {
    const resolvedMode = this.resolveBrowserMode(browserMode);
    const sessionKey = this.poolManager.resolveSessionKey(projectId, environment);

    // Step 1: Obtain or resolve Playwright storageState.json
    const storageStatePath = sessionService.getStorageState(projectId, environment) || sessionService.getStorageState(domainUrl);
    
    const contextOptions = { ...extraOptions };
    if (storageStatePath) {
      contextOptions.storageState = storageStatePath;
      console.log(`[BrowserService] 🔑 Injecting authenticated session storageState: ${storageStatePath}`);
    }

    // Step 2: Delegate allocation to BrowserPoolManager
    const context = await this.poolManager.getOrCreateContext(sessionKey, resolvedMode, contextOptions);
    
    // Step 3: Inject DOM localStorage & sessionStorage init scripts
    await sessionService.restoreSessionToContext(context, projectId, environment);

    const page = await this.poolManager.getOrCreatePage(sessionKey, resolvedMode, contextOptions);

    return { context, page, sessionKey, storageStatePath };
  }

  /**
   * Close browser instance via pool manager
   */
  async closeBrowser(browser, sessionKey = 'default_QA') {
    return this.poolManager.close(sessionKey);
  }

  /**
   * Format structured browser launch log output
   */
  formatBrowserLog(browserMode) {
    const resolved = this.resolveBrowserMode(browserMode);
    const isInteractive = resolved === BROWSER_MODES.INTERACTIVE;
    const modeDisplay = isInteractive ? 'Interactive' : 'Headless';

    return [
      'Starting Browser...',
      `Browser Mode: ${modeDisplay}`,
      'Browser: Chromium',
      `Headless: ${!isInteractive}`
    ].join('\n');
  }

  /**
   * Format WCAG Scan Log array for status broadcasts
   */
  getWcagScanLogs(browserMode, url) {
    const resolved = this.resolveBrowserMode(browserMode);
    const isInteractive = resolved === BROWSER_MODES.INTERACTIVE;
    const modeDisplay = isInteractive ? 'Interactive' : 'Headless';

    return [
      'Starting WCAG Scan',
      `Browser Mode: ${modeDisplay}`,
      'Launching Chromium...',
      `Headless: ${!isInteractive}`,
      `Navigating to: ${url}`
    ];
  }

  getLaunchOptions(browserMode) {
    return getLaunchOptions(this.resolveBrowserMode(browserMode));
  }
}

module.exports = new BrowserService();
