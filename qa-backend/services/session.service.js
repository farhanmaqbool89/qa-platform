const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '../artifacts/sessions');

/**
 * Session Lifecycle States
 */
const SESSION_STATES = Object.freeze({
  NEW: 'NEW',
  AUTHENTICATING: 'AUTHENTICATING',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  INVALID: 'INVALID',
  CLOSED: 'CLOSED'
});

class SessionService {
  constructor() {
    this.ensureSessionDir();
    this.SESSION_STATES = SESSION_STATES;
  }

  ensureSessionDir() {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  /**
   * Format session file path per project & environment (Milestone 2 Specification)
   * Example: artifacts/sessions/customerportal_QA.json
   */
  getSessionPath(projectId = 'customerportal', environment = 'QA') {
    this.ensureSessionDir();
    const cleanProj = String(projectId || 'customerportal').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanEnv = String(environment || 'QA').replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(SESSIONS_DIR, `${cleanProj}_${cleanEnv}.json`);
  }

  /**
   * Helper to derive session path from URL if project/env not provided
   */
  getSessionPathForUrl(urlStr) {
    this.ensureSessionDir();
    try {
      const parsed = new URL(urlStr);
      const domain = parsed.hostname.replace(/[^a-zA-Z0-9]/g, '_');
      return path.join(SESSIONS_DIR, `${domain}_storageState.json`);
    } catch (e) {
      return this.getSessionPath('customerportal', 'QA');
    }
  }

  /**
   * Check if a session file exists and contains valid cookies/storage
   */
  hasSavedSession(projectId = 'customerportal', environment = 'QA') {
    try {
      let sessionPath = typeof projectId === 'string' && fs.existsSync(projectId) ? projectId : this.getSessionPath(projectId, environment);
      if (!fs.existsSync(sessionPath) && typeof projectId === 'string' && projectId.startsWith('http')) {
        sessionPath = this.getSessionPathForUrl(projectId);
      }
      if (!fs.existsSync(sessionPath)) return false;

      const stat = fs.statSync(sessionPath);
      if (stat.size < 10) return false;

      const content = fs.readFileSync(sessionPath, 'utf8');
      const parsed = JSON.parse(content);
      const hasCookies = Array.isArray(parsed.cookies) && parsed.cookies.length > 0;
      const hasOrigins = Array.isArray(parsed.origins) && parsed.origins.length > 0;
      const hasLocal = parsed.customLocalStorage && Object.keys(parsed.customLocalStorage).length > 0;
      const hasSession = parsed.customSessionStorage && Object.keys(parsed.customSessionStorage).length > 0;

      return hasCookies || hasOrigins || hasLocal || hasSession;
    } catch (err) {
      return false;
    }
  }

  /**
   * Get storageState path if session is valid
   */
  getStorageState(projectId = 'customerportal', environment = 'QA') {
    const sessionPath = this.getSessionPath(projectId, environment);
    if (fs.existsSync(sessionPath) && this.hasSavedSession(sessionPath)) {
      console.log(`[SessionService] 🔑 Found valid session file: ${sessionPath}`);
      return sessionPath;
    }
    if (typeof projectId === 'string' && projectId.startsWith('http')) {
      const urlPath = this.getSessionPathForUrl(projectId);
      if (fs.existsSync(urlPath) && this.hasSavedSession(urlPath)) {
        console.log(`[SessionService] 🔑 Found valid session file: ${urlPath}`);
        return urlPath;
      }
    }
    const defaultPath = path.join(SESSIONS_DIR, 'storageState.json');
    if (fs.existsSync(defaultPath) && this.hasSavedSession(defaultPath)) {
      return defaultPath;
    }
    return undefined;
  }

  /**
   * Milestone 6: Check if current page is session-valid or redirected to login
   */
  async isSessionValid(page) {
    if (!page || page.isClosed()) return { valid: false, reason: 'PAGE_CLOSED' };

    try {
      const currentUrl = page.url().toLowerCase();
      const loginPatterns = ['/login', '/#/login', '/signin', '/auth', '/sso', '/oauth', 'realm='];
      
      const isLoginRedirect = loginPatterns.some(p => currentUrl.includes(p));
      if (isLoginRedirect) {
        console.warn(`[SessionService] ⚠️ Session Expiry Detected: Redirected to auth route (${currentUrl})`);
        return { valid: false, reason: 'LOGIN_REDIRECT', url: currentUrl };
      }

      // Check DOM for unauthenticated elements or HTTP status if available
      const isUnauthenticatedBanner = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
        return bodyText.includes('session expired') || bodyText.includes('please log in') || bodyText.includes('unauthorized');
      }).catch(() => false);

      if (isUnauthenticatedBanner) {
        return { valid: false, reason: 'SESSION_EXPIRED_TEXT' };
      }

      return { valid: true };
    } catch (err) {
      return { valid: true }; // Assume valid if check encounters transient evaluation issue
    }
  }

  /**
   * Save Playwright storageState + DOM localStorage & sessionStorage (No plain-text passwords stored)
   */
  async saveSession(context, pageOrUrl, projectId = 'customerportal', environment = 'QA') {
    if (!context) return null;
    let page = null;
    let targetUrl = '';

    if (pageOrUrl && typeof pageOrUrl === 'object' && pageOrUrl.evaluate) {
      page = pageOrUrl;
      targetUrl = page.url ? page.url() : '';
    } else if (typeof pageOrUrl === 'string') {
      targetUrl = pageOrUrl;
    }

    if (!page && context.pages && context.pages().length > 0) {
      page = context.pages()[0];
    }

    try {
      const sessionPath = this.getSessionPath(projectId, environment);

      // Native Playwright storage state
      const state = await context.storageState().catch(() => ({ cookies: [], origins: [] }));

      // Custom DOM localStorage and sessionStorage extraction
      let customLocalStorage = {};
      let customSessionStorage = {};

      if (page && !page.isClosed()) {
        const captured = await page.evaluate(() => {
          const local = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            local[key] = localStorage.getItem(key);
          }
          const session = {};
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            session[key] = sessionStorage.getItem(key);
          }
          return { local, session };
        }).catch(() => ({ local: {}, session: {} }));

        customLocalStorage = captured.local || {};
        customSessionStorage = captured.session || {};
      }

      const fullSessionData = {
        projectId,
        environment,
        savedAt: new Date().toISOString(),
        url: targetUrl,
        cookies: state.cookies || [],
        origins: state.origins || [],
        customLocalStorage,
        customSessionStorage
      };

      const localCount = Object.keys(customLocalStorage).length;
      const sessionCount = Object.keys(customSessionStorage).length;
      const cookieCount = fullSessionData.cookies.length;

      if (cookieCount > 0 || localCount > 0 || sessionCount > 0) {
        console.log(`[SessionService] 🔑 Persisting session storageState (${cookieCount} cookies, ${localCount} localStorage, ${sessionCount} sessionStorage) ➔ ${sessionPath}`);
        fs.writeFileSync(sessionPath, JSON.stringify(fullSessionData, null, 2), 'utf8');

        // Also save default backup if domain URL available
        if (targetUrl) {
          const domainPath = this.getSessionPathForUrl(targetUrl);
          fs.writeFileSync(domainPath, JSON.stringify(fullSessionData, null, 2), 'utf8');
        }
        return sessionPath;
      }
      return null;
    } catch (err) {
      console.error(`[SessionService] Failed to save session state:`, err.message);
      return null;
    }
  }

  /**
   * Restore storageState + localStorage & sessionStorage into context before navigation
   */
  async restoreSessionToContext(context, projectId = 'customerportal', environment = 'QA') {
    if (!context) return;
    const sessionPath = this.getStorageState(projectId, environment);
    if (!sessionPath) return;

    try {
      const content = fs.readFileSync(sessionPath, 'utf8');
      const parsed = JSON.parse(content);

      if (parsed.customLocalStorage || parsed.customSessionStorage) {
        console.log(`[SessionService] 🔑 Restoring localStorage (${Object.keys(parsed.customLocalStorage || {}).length} keys) & sessionStorage (${Object.keys(parsed.customSessionStorage || {}).length} keys) via initScript...`);

        await context.addInitScript(({ local, session }) => {
          try {
            if (local) {
              Object.keys(local).forEach(k => {
                try { localStorage.setItem(k, local[k]); } catch (e) {}
              });
            }
            if (session) {
              Object.keys(session).forEach(k => {
                try { sessionStorage.setItem(k, session[k]); } catch (e) {}
              });
            }
          } catch (err) {}
        }, {
          local: parsed.customLocalStorage || {},
          session: parsed.customSessionStorage || {}
        });
      }
    } catch (err) {
      console.error(`[SessionService] Error restoring session init script:`, err.message);
    }
  }

  /**
   * List all stored sessions for API endpoints
   */
  listSessions() {
    this.ensureSessionDir();
    try {
      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      return files.map(file => {
        const filePath = path.join(SESSIONS_DIR, file);
        const stat = fs.statSync(filePath);
        let metadata = {};
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(content);
          metadata = {
            projectId: parsed.projectId || file.replace('.json', ''),
            environment: parsed.environment || 'QA',
            savedAt: parsed.savedAt || stat.mtime.toISOString(),
            url: parsed.url || '',
            cookiesCount: parsed.cookies ? parsed.cookies.length : 0,
            localStorageCount: parsed.customLocalStorage ? Object.keys(parsed.customLocalStorage).length : 0,
            sessionStorageCount: parsed.customSessionStorage ? Object.keys(parsed.customSessionStorage).length : 0
          };
        } catch (e) {}
        return {
          fileName: file,
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
          ...metadata
        };
      });
    } catch (err) {
      return [];
    }
  }

  /**
   * Clear session file per project & environment
   */
  clearSession(projectId = 'customerportal', environment = 'QA') {
    try {
      const sessionPath = this.getSessionPath(projectId, environment);
      let cleared = false;

      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
        cleared = true;
      }
      if (typeof projectId === 'string' && projectId.startsWith('http')) {
        const domainPath = this.getSessionPathForUrl(projectId);
        if (fs.existsSync(domainPath)) {
          fs.unlinkSync(domainPath);
          cleared = true;
        }
      }
      console.log(`[SessionService] 🧹 Session cleared for ${projectId} [${environment}].`);
      return cleared;
    } catch (err) {
      return false;
    }
  }
}

module.exports = new SessionService();
