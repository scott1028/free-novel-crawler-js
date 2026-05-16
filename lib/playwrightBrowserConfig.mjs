export const DEFAULT_BROWSER = 'firefox';
export const SUPPORTED_BROWSERS = ['chrome', 'chromium', 'firefox', 'webkit'];

const SUPPORTED_BROWSER_SET = new Set(SUPPORTED_BROWSERS);

export function resolveBrowserName(browserName = process.env.BROWSER) {
  const normalized = String(browserName ?? DEFAULT_BROWSER).trim().toLowerCase() || DEFAULT_BROWSER;

  if (!SUPPORTED_BROWSER_SET.has(normalized)) {
    throw new Error(
      `Unsupported BROWSER "${browserName}". ` +
      `Allowed values: ${SUPPORTED_BROWSERS.join(', ')}.`
    );
  }

  return normalized;
}

export function getPlaywrightInstallPlan(browserName = process.env.BROWSER) {
  const resolvedBrowserName = resolveBrowserName(browserName);

  if (resolvedBrowserName === 'chrome') {
    return {
      browserName: resolvedBrowserName,
      installBrowser: null,
      shouldInstall: false,
    };
  }

  return {
    browserName: resolvedBrowserName,
    installBrowser: resolvedBrowserName,
    shouldInstall: true,
  };
}
