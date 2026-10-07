const { chromium } = require('playwright');
const { getLaunchOptions, BROWSER_MODES } = require('./browser-options');

/**
 * Enterprise Browser Lifecycle States Enum
 */
const BROWSER_LIFECYCLE_STATES = Object.freeze({
  NEW: 'NEW',
  AUTHENTICATING: 'AUTHENTICATING',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  INVALID: 'INVALID',
  CLOSED: 'CLOSED'
});

/**
 * Enterprise BrowserPoolManager
 * Responsible for maintaining reusable Playwright browser instances, context pools,
 * tracking browser lifecycle states and PID supervision across QA Platform modules.
 */
class BrowserPoolManager {
  constructor() {
    // Map of sessionKey -> PoolEntry
    // PoolEntry = { browser, context, page, pid, state, lastActive, keepAliveTimer, projectId, environment }
    this.pools = new Map();
    this.BROWSER_LIFECYCLE_STATES = BROWSER_LIFECYCLE_STATES;
  }

  /**
   * Resolve a session key from parameters
   */
  resolveSessionKey(projectId = 'default', environment = 'QA') {
    const cleanProj = String(projectId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanEnv = String(environment || 'QA').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${cleanProj}_${cleanEnv}`;
  }

  /**
   * Get an existing pool entry if valid & alive, or create a new browser instance
   */
  async getOrCreateBrowser(sessionKey = 'default_QA', browserMode = BROWSER_MODES.HEADLESS, extraOptions = {}) {
    const isInteractive = String(browserMode).toLowerCase() === BROWSER_MODES.INTERACTIVE;
    let entry = this.pools.get(sessionKey);

    // Check if entry exists and browser process is still alive
    if (entry && entry.browser) {
      const isConnected = entry.browser.isConnected && entry.browser.isConnected();
      if (isConnected && entry.state !== BROWSER_LIFECYCLE_STATES.CLOSED) {
        console.log(`[BrowserPoolManager] ♻️ Reusing existing active browser instance (PID: ${entry.pid}, State: ${entry.state}) for session: ${sessionKey}`);
        entry.lastActive = Date.now();
        return entry.browser;
      } else {
        console.warn(`[BrowserPoolManager] ⚠️ Browser process for session "${sessionKey}" (PID: ${entry.pid}) was disconnected/closed. Recreating...`);
        this.cleanupEntry(sessionKey);
      }
    }

    // Launch a new browser process
    const launchOptions = {
      ...getLaunchOptions(browserMode),
      ...extraOptions
    };

    console.log(`[BrowserPoolManager] 🚀 Launching new Playwright Chromium instance for session "${sessionKey}" (Mode: ${browserMode}, Headless: ${launchOptions.headless})...`);
    
    let browser;
    try {
      browser = await chromium.launch(launchOptions);
    } catch (err) {
      console.warn(`[BrowserPoolManager] Preferred launch failed (${err.message}). Trying fallback launch without channel...`);
      const fallbackOptions = { ...launchOptions };
      delete fallbackOptions.channel;
      try {
        browser = await chromium.launch(fallbackOptions);
      } catch (err2) {
        console.warn(`[BrowserPoolManager] Default launch failed (${err2.message}). Trying system browser fallback (msedge / chrome)...`);
        try {
          browser = await chromium.launch({ ...fallbackOptions, channel: 'msedge' });
        } catch (err3) {
          browser = await chromium.launch({ ...fallbackOptions, channel: 'chrome' });
        }
      }
    }

    let pid = null;
    try {
      if (browser.process && typeof browser.process === 'function') {
        const proc = browser.process();
        pid = proc ? proc.pid : null;
      }
    } catch (e) {}

    console.log(`[BrowserPoolManager] ✅ Browser launched successfully (PID: ${pid || 'N/A'}, SessionKey: ${sessionKey}).`);

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

    // Track unexpected browser exit
    browser.on('disconnected', () => {
      console.log(`[BrowserPoolManager] 🔌 Browser process (PID: ${pid}, Session: ${sessionKey}) disconnected.`);
      const current = this.pools.get(sessionKey);
      if (current && current.browser === browser) {
        current.state = BROWSER_LIFECYCLE_STATES.CLOSED;
      }
    });

    return browser;
  }

  /**
   * Get or create a reusable browser context for a sessionKey
   */
  async getOrCreateContext(sessionKey = 'default_QA', browserMode = BROWSER_MODES.HEADLESS, contextOptions = {}) {
    const browser = await this.getOrCreateBrowser(sessionKey, browserMode);
    const entry = this.pools.get(sessionKey);

    // Reuse context if context exists and is alive
    if (entry.context) {
      try {
        const pages = entry.context.pages();
        if (pages && pages.length >= 0 && entry.state !== BROWSER_LIFECYCLE_STATES.CLOSED) {
          console.log(`[BrowserPoolManager] ♻️ Reusing existing BrowserContext for session: ${sessionKey}`);
          return entry.context;
        }
      } catch (e) {
        console.warn(`[BrowserPoolManager] Existing context invalid for session "${sessionKey}". Recreating context...`);
      }
    }

    console.log(`[BrowserPoolManager] ➕ Creating new BrowserContext for session: ${sessionKey}`);
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

  /**
   * Get or create a reusable active Page for a sessionKey
   */
  async getOrCreatePage(sessionKey = 'default_QA', browserMode = BROWSER_MODES.HEADLESS, contextOptions = {}) {
    const context = await this.getOrCreateContext(sessionKey, browserMode, contextOptions);
    const entry = this.pools.get(sessionKey);

    if (entry.page && !entry.page.isClosed()) {
      console.log(`[BrowserPoolManager] ♻️ Reusing active Page for session: ${sessionKey}`);
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

    console.log(`[BrowserPoolManager] 📄 Opening new Page in context for session: ${sessionKey}`);
    const page = await context.newPage();
    entry.page = page;
    try {
      await page.bringToFront();
    } catch (e) {}
    return page;
  }

  /**
   * Set lifecycle state for a session
   */
  setSessionState(sessionKey, state) {
    const entry = this.pools.get(sessionKey);
    if (entry) {
      console.log(`[BrowserPoolManager] 🔄 Session "${sessionKey}" state transition: ${entry.state} ➔ ${state}`);
      entry.state = state;
    }
  }

  /**
   * Get metadata for a session
   */
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

  /**
   * Keep browser window alive for interactive inspection
   */
  keepAlive(sessionKey, durationMs = 25000) {
    const entry = this.pools.get(sessionKey);
    if (!entry) return;

    if (entry.keepAliveTimer) {
      clearTimeout(entry.keepAliveTimer);
    }

    console.log(`[BrowserPoolManager] ⏳ Session "${sessionKey}" keep-alive extend: ${durationMs}ms`);
    entry.lastActive = Date.now();
  }

  /**
   * Clean up pool entry object
   */
  cleanupEntry(sessionKey) {
    const entry = this.pools.get(sessionKey);
    if (entry) {
      if (entry.keepAliveTimer) clearTimeout(entry.keepAliveTimer);
      entry.state = BROWSER_LIFECYCLE_STATES.CLOSED;
      this.pools.delete(sessionKey);
    }
  }

  /**
   * Gracefully close browser for a specific sessionKey
   */
  async close(sessionKey) {
    const entry = this.pools.get(sessionKey);
    if (entry) {
      console.log(`[BrowserPoolManager] 🛑 Closing browser session: ${sessionKey} (PID: ${entry.pid})`);
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

  /**
   * Close all active browser instances in pool
   */
  async closeAll() {
    console.log(`[BrowserPoolManager] 🛑 Closing all active browser instances (${this.pools.size} active sessions)...`);
    const keys = Array.from(this.pools.keys());
    for (const key of keys) {
      await this.close(key);
    }
    this.pools.clear();
    console.log(`[BrowserPoolManager] ✅ All browser sessions closed.`);
  }
}

module.exports = new BrowserPoolManager();
