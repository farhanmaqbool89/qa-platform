const { chromium } = require('playwright');
const { getLaunchOptions, BROWSER_MODES } = require('./browser-options');

/**
 * Browser Launcher Module
 * Handles direct launching of Playwright Chromium instances, creation of browser contexts & pages, and cleanup.
 */
class BrowserLauncher {
  /**
   * Launch a Playwright Chromium browser instance
   * @param {string} browserMode - 'headless' or 'interactive'
   * @param {object} extraOptions - Additional Playwright launch options
   * @returns {Promise<Browser>} Playwright Browser instance
   */
  async launchBrowser(browserMode = BROWSER_MODES.HEADLESS, extraOptions = {}) {
    const launchOptions = {
      ...getLaunchOptions(browserMode),
      ...extraOptions
    };

    console.log('[Backend Layer 5 - BrowserLauncher] Executing launch with configuration:', {
      mode: browserMode,
      headless: launchOptions.headless,
      channel: launchOptions.channel,
      slowMo: launchOptions.slowMo,
      argsCount: launchOptions.args?.length || 0
    });

    try {
      const browser = await chromium.launch(launchOptions);
      console.log(`[Backend Layer 5 - BrowserLauncher] Browser launched successfully via channel: ${launchOptions.channel || 'bundled-chromium'}`);
      return browser;
    } catch (err) {
      console.warn(`[BrowserLauncher] Preferred launch channel (${launchOptions.channel}) warning: ${err.message}`);
      
      // Fallback to msedge if chrome failed
      if (launchOptions.channel === 'chrome') {
        try {
          console.log('[BrowserLauncher] Attempting fallback launch via channel: msedge...');
          const fallbackOptions = { ...launchOptions, channel: 'msedge' };
          const browser = await chromium.launch(fallbackOptions);
          console.log('[BrowserLauncher] Browser launched successfully via fallback channel: msedge');
          return browser;
        } catch (edgeErr) {
          console.warn('[BrowserLauncher] Fallback channel msedge warning:', edgeErr.message);
        }
      }

      // Default fallback without channel
      try {
        console.log('[BrowserLauncher] Attempting launch via default bundled Chromium...');
        const defaultOptions = { ...launchOptions };
        delete defaultOptions.channel;
        const browser = await chromium.launch(defaultOptions);
        console.log('[BrowserLauncher] Browser launched successfully via default bundled Chromium.');
        return browser;
      } catch (finalErr) {
        console.error('[BrowserLauncher] All browser launch options failed:', finalErr.message);
        throw finalErr;
      }
    }
  }

  /**
   * Create a new browser context and page instance
   * @param {Browser} browser 
   * @param {object} contextOptions 
   * @returns {Promise<{ context: BrowserContext, page: Page }>}
   */
  async createContextAndPage(browser, contextOptions = {}) {
    const defaultContextOptions = {
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...contextOptions
    };

    const context = await browser.newContext(defaultContextOptions);
    const page = await context.newPage();
    try {
      await page.bringToFront();
    } catch (e) {}
    return { context, page };
  }

  /**
   * Gracefully close a browser instance
   * @param {Browser} browser 
   */
  async closeBrowser(browser) {
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.error('[BrowserLauncher] Error during browser closure:', err.message);
      }
    }
  }
}

module.exports = new BrowserLauncher();
