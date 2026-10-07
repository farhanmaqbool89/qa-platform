/**
 * Browser Options Manager
 * Responsible for defining and resolving launch options based on browser execution mode.
 */

const BROWSER_MODES = {
  HEADLESS: 'headless',
  INTERACTIVE: 'interactive'
};

/**
 * Get Playwright browser launch options for given mode
 * @param {string} browserMode - 'headless' or 'interactive'
 * @returns {object} Playwright launch options object
 */
function getLaunchOptions(browserMode = BROWSER_MODES.HEADLESS) {
  const isInteractive = String(browserMode).toLowerCase() === BROWSER_MODES.INTERACTIVE;
  const options = {
    headless: !isInteractive,
    slowMo: isInteractive ? 500 : 0,
    channel: process.env.BROWSER_CHANNEL || undefined,
    args: isInteractive
      ? [
          '--start-maximized',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      : [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
  };

  console.log('[Backend Layer 4 - BrowserOptions] Resolved launch parameters:', {
    inputMode: browserMode,
    isInteractive,
    headless: options.headless,
    channel: options.channel,
    slowMo: options.slowMo
  });

  return options;
}

module.exports = {
  BROWSER_MODES,
  getLaunchOptions
};
