const { chromium } = require('playwright');
const { getLaunchOptions, BROWSER_MODES } = require('./browser-options');

const BROWSER_LIFECYCLE_STATES = {
  NEW: 'NEW',
  ACTIVE: 'ACTIVE',
  IDLE: 'IDLE',
  CLOSED: 'CLOSED'
};

class BrowserPoolManager {
  constructor() {
    this.pools = new Map();
  }

  resolveSessionKey(projectId = 'customerportal', environment = 'QA') {
    return `${projectId}_${environment}`;
  }

  async getOrCreateBrowser(sessionKey = 'default_QA', browserMode = BROWSER_MODES.HEADLESS, extraOptions = {}) {
    const isInteractive = String(browserMode).toLowerCase() === BROWSER_MODES.INTERACTIVE;
    
    let entry = this.pools.get(sessionKey);
    if (entry && entry.browser && entry.state !== BROWSER_LIFECYCLE_STATES.CLOSED) {
      if (entry.browser.isConnected()) {
        entry.state = BROWSER_LIFECYCLE_STATES.ACTIVE;
        entry.lastActive = Date.now();
        return entry.browser;
      } else {
        this.cleanupEntry(sessionKey);
      }
    }

    const launchOptions = {
      ...getLaunchOptions(browserMode),
      ...extraOptions
    };

    console.log(`[BrowserPoolManager] ?? Launching Playwright Chromium for session "${sessionKey}" (Mode: ${browserMode}, Headless: ${launchOptions.headless})...`);
    
    let browser;
    try {
      browser = await chromium.launch(launchOptions);
    } catch (err) {
      console.warn(`[BrowserPoolManager] Preferred launch failed (${err.message}). Trying fallback with container flags...`);
      const fallbackOptions = {
        headless: !isInteractive,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run'
        ]
      };
      try {
        browser = await chromium.launch(fallbackOptions);
      } catch (err2) {
        console.error(`[BrowserPoolManager] Chromium launch failed: ${err2.message}`);
        throw new Error(`Failed to launch browser: ${err2.message}. Ensure Playwright Chromium is installed.`);
      }
    }

    let pid = null;
    try {
      if (browser.process && typeof browser.process === 'function') {
        const proc = browser.process();
        pid = proc ? proc.pid : null;
      }
    } catch (e) {}

    console.log(`[BrowserPoolManager] ? Browser launched successfully (PID: ${pid || 'N/A'}, SessionKey: ${sessionKey}).`);

    entry = {
      browser,
      context: null,
      page: null,
      pid,
      state: BROWSER_LIFECYCLE_STATES.NEW,
      lastActive: Date.now(),
      keepAliveTimer: null,
      mode: browserMode,
      isInteractive
    };

    this.pools.set(sessionKey, entry);

    browser.on('disconnected', () => {
      console.log(`[BrowserPoolManager] ?? Browser process (PID: ${pid}, Session: ${sessionKey}) disconnected.`);
      const current = this.pools.get(sessionKey);
      if (current && current.browser === browser) {
        current.state = BROWSER_LIFECYCLE_STATES.CLOSED;
      }
    });

    return browser;
  }

  async getOrCreateContext(sessionKey = 'default_QA', browserMode = BROWSER_MODES.HEADLESS, contextOptions = {}) {
    const browser = await this.getOrCreateBrowser(sessionKey, browserMode);
    const entry = this.pools.get(sessionKey);

    if (entry.context) {
      try {
        const pages = entry.context.pages();
        if (pages && pages.length >= 0 && entry.state !== BROWSER_LIFECYCLE_STATES.CLOSED) {
          return entry.context;
        }
      } catch (e) {
        console.warn(`[BrowserPoolManager] Context invalid for "${sessionKey}", recreating...`);
      }
    }

    const defaultOptions = {
      viewport: entry.isInteractive ? null : { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...contextOptions
    };

    const context = await browser.newContext(defaultOptions);
    entry.context = context;
    if (entry.state === BROWSER_LIFECYCLE_STATES.NEW) {
      entry.state = BROWSER_LIFECYCLE_STATES.ACTIVE;
    }
    return context;
  }

  async getOrCreatePage(sessionKey = 'default_QA', browserMode = BROWSER_MODES.HEADLESS, contextOptions = {}) {
    const context = await this.getOrCreateContext(sessionKey, browserMode, contextOptions);
    const entry = this.pools.get(sessionKey);

    if (entry.page && !entry.page.isClosed()) {
      try {
        await entry.page.bringToFront();
      } catch (e) {}
      return entry.page;
    }

    const pages = context.pages();
    if (pages && pages.length > 0 && !pages[0].isClosed()) {
      entry.page = pages[0];
      try {
        await entry.page.bringToFront();
      } catch (e) {}
      return entry.page;
    }

    const page = await context.newPage();
    entry.page = page;
    try {
      await page.bringToFront();
    } catch (e) {}
    return page;
  }

  setSessionState(sessionKey, state) {
    const entry = this.pools.get(sessionKey);
    if (entry) {
      entry.state = state;
    }
  }

  getSessionInfo(sessionKey) {
    const entry = this.pools.get(sessionKey);
    if (!entry) return null;
    return {
      sessionKey,
      pid: entry.pid,
      state: entry.state,
      mode: entry.mode,
      isInteractive: entry.isInteractive,
      lastActive: entry.lastActive,
      hasContext: !!entry.context,
      hasPage: !!entry.page && !entry.page.isClosed()
    };
  }

  keepAlive(sessionKey, durationMs = 25000) {
    const entry = this.pools.get(sessionKey);
    if (!entry) return;
    if (entry.keepAliveTimer) clearTimeout(entry.keepAliveTimer);
    entry.lastActive = Date.now();
  }

  cleanupEntry(sessionKey) {
    const entry = this.pools.get(sessionKey);
    if (entry) {
      if (entry.keepAliveTimer) clearTimeout(entry.keepAliveTimer);
      entry.state = BROWSER_LIFECYCLE_STATES.CLOSED;
      this.pools.delete(sessionKey);
    }
  }

  async close(sessionKey) {
    const entry = this.pools.get(sessionKey);
    if (entry) {
      if (entry.keepAliveTimer) clearTimeout(entry.keepAliveTimer);
      entry.state = BROWSER_LIFECYCLE_STATES.CLOSED;
      try {
        if (entry.page && !entry.page.isClosed()) await entry.page.close().catch(() => {});
        if (entry.context) await entry.context.close().catch(() => {});
        if (entry.browser) await entry.browser.close().catch(() => {});
      } catch (err) {
        console.error(`[BrowserPoolManager] Error closing browser for ${sessionKey}:`, err.message);
      } finally {
        this.pools.delete(sessionKey);
      }
    }
  }

  async closeAll() {
    const keys = Array.from(this.pools.keys());
    for (const key of keys) {
      await this.close(key);
    }
    this.pools.clear();
  }
}

module.exports = new BrowserPoolManager();
