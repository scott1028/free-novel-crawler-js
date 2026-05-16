import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BROWSER,
  getPlaywrightInstallPlan,
  resolveBrowserName,
} from '../lib/playwrightBrowserConfig.mjs';
import { resolvePlaywrightBrowser } from '../lib/playwrightFetcher.mjs';

console.log = () => {};

test('resolveBrowserName defaults to firefox when BROWSER is absent', () => {
  const previousBrowser = process.env.BROWSER;
  delete process.env.BROWSER;

  try {
    assert.equal(DEFAULT_BROWSER, 'firefox');
    assert.equal(resolveBrowserName(), 'firefox');
  } finally {
    if (previousBrowser === undefined) {
      delete process.env.BROWSER;
    } else {
      process.env.BROWSER = previousBrowser;
    }
  }
});

test('resolvePlaywrightBrowser maps chrome to system Chrome launch options', () => {
  const browserConfig = resolvePlaywrightBrowser('chrome');
  assert.equal(browserConfig.name, 'chrome');
  assert.deepEqual(browserConfig.launchOptions, {
    channel: 'chrome',
    headless: true,
  });
});

test('resolvePlaywrightBrowser maps bundled browser names', () => {
  assert.equal(resolvePlaywrightBrowser('chromium').name, 'chromium');
  assert.equal(resolvePlaywrightBrowser('firefox').name, 'firefox');
  assert.equal(resolvePlaywrightBrowser('webkit').name, 'webkit');
});

test('resolveBrowserName normalizes casing and whitespace', () => {
  assert.equal(resolveBrowserName('  Firefox  '), 'firefox');
});

test('resolveBrowserName treats an empty value as the default browser', () => {
  assert.equal(resolveBrowserName('  '), 'firefox');
});

test('resolveBrowserName rejects unsupported browser names', () => {
  assert.throws(
    () => resolveBrowserName('edge'),
    /Unsupported BROWSER "edge".*Allowed values: chrome, chromium, firefox, webkit\./
  );
});

test('getPlaywrightInstallPlan skips install for system Chrome', () => {
  assert.deepEqual(getPlaywrightInstallPlan('chrome'), {
    browserName: 'chrome',
    installBrowser: null,
    shouldInstall: false,
  });
});

test('getPlaywrightInstallPlan installs Playwright-managed browsers', () => {
  assert.deepEqual(getPlaywrightInstallPlan('firefox'), {
    browserName: 'firefox',
    installBrowser: 'firefox',
    shouldInstall: true,
  });
  assert.deepEqual(getPlaywrightInstallPlan('chromium'), {
    browserName: 'chromium',
    installBrowser: 'chromium',
    shouldInstall: true,
  });
  assert.deepEqual(getPlaywrightInstallPlan('webkit'), {
    browserName: 'webkit',
    installBrowser: 'webkit',
    shouldInstall: true,
  });
});
