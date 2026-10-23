// Automated accessibility checks (axe) for every main view in both themes.
// Automated checks find only part of the issues; manual review is still required.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { OKAI, open } from './helpers';

const VIEWS: Array<[string, string]> = [
  ['I dag', '/today'],
  ['Vores områder', '/areas'],
  ['Projekter', '/projects'],
  ['Projekt (kanban)', `/projects/${OKAI}`],
  ['Tanker', '/thoughts'],
  ['Opgavepanel', '/today?task=00000000-0000-4000-8000-e00000000001'],
  ['Arkiv', '/archive'],
];

for (const theme of ['dark', 'light'] as const) {
  for (const [name, path] of VIEWS) {
    test(`axe: ${name} (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('teamspace-theme', t), theme);
      await open(page, path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`),
      ).toEqual([]);
    });
  }
}
