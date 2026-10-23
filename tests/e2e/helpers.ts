import { expect, type Locator, type Page } from '@playwright/test';

export const OKAI = '00000000-0000-4000-8000-0000000000c1';
export const STORAGE_KEY = 'ai-team-space-v3';

export async function open(page: Page, path = '/today') {
  await page.goto(path);
  // DOM check: an open dialog hides <main> from the accessibility tree.
  await expect(page.locator('main h1').first()).toBeVisible();
}

export function sheet(page: Page): Locator {
  return page.getByRole('dialog');
}

export async function newTask(page: Page) {
  await page.getByRole('button', { name: 'Ny opgave' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Ny opgave' })).toBeVisible();
}

export async function save(page: Page) {
  await sheet(page).getByRole('button', { name: 'Gem', exact: true }).click();
}

export function status(page: Page): Locator {
  return page.getByRole('status').filter({ hasText: /.+/ });
}

/** Every visible task title button with exactly this text. */
export function taskTitles(scope: Page | Locator, title: string): Locator {
  return scope.getByRole('button', { name: title, exact: true });
}

export async function storedTasks(page: Page): Promise<Array<{ title: string; projectId: string | null; areaId: string | null; status: string }>> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{"data":{"tasks":[]}}').data.tasks, STORAGE_KEY);
}
