import 'dotenv/config';

import { spawnSync } from 'node:child_process';

import { getPlaywrightInstallPlan } from '../lib/playwrightBrowserConfig.mjs';

const installPlan = getPlaywrightInstallPlan();

if (!installPlan.shouldInstall) {
  console.log(
    `[playwright] BROWSER=${installPlan.browserName}; using system Chrome, skip Playwright browser install.`
  );
  process.exit(0);
}

console.log(`[playwright] installing ${installPlan.installBrowser}`);

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npxCommand,
  ['playwright', 'install', installPlan.installBrowser],
  { stdio: 'inherit' }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
