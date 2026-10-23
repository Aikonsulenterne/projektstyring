// Visual capture for the delivery report (docs/screenshots). Also asserts that no
// view overflows horizontally and that the task editor's Save button is visible.
// Runs only when CAPTURE=1 so the normal suite stays fast.

import { expect, test } from '@playwright/test';
import { OKAI, open } from './helpers';

const SCREENS: Array<[string, string]> = [
  ['today', '/today'],
  ['areas', '/areas'],
  ['projects', '/projects'],
  ['project-kanban', `/projects/${OKAI}`],
  ['thoughts', '/thoughts'],
  ['task-editor', '/today?task=00000000-0000-4000-8000-e00000000001'],
];

const SIZES: Array<[number, number, Array<'dark' | 'light'>]> = [
  [1440, 1000, ['dark', 'light']],
  [1024, 768, ['dark', 'light']],
  [390, 844, ['dark', 'light']],
  [320, 740, ['dark']],
];

for (const [width, height, themes] of SIZES) {
  for (const theme of themes) {
    for (const [name, path] of SCREENS) {
      test(`${name} ${width}x${height} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.addInitScript((t) => localStorage.setItem('teamspace-theme', t), theme);
        await open(page, path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'no page-level horizontal overflow').toBeLessThanOrEqual(0);
        if (name === 'task-editor') {
          await expect(page.getByRole('dialog').getByRole('button', { name: 'Gem', exact: true })).toBeInViewport();
        }
        if (process.env.CAPTURE) {
          await page.screenshot({ path: `docs/screenshots/${width}x${height}-${theme}-${name}.png`, fullPage: name !== 'task-editor' });
        }
      });
    }
  }
}
