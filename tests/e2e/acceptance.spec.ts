// Browser acceptance scenarios AT-01 … AT-16 from docs/handoff/11_TESTS_AND_ACCEPTANCE.md,
// executed against demo mode (browser storage). Each test gets a fresh browser context.

import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { newTask, OKAI, open, save, sheet, STORAGE_KEY, storedTasks, taskTitles } from './helpers';

test('AT-01 task with only a title and no project saves and survives reload', async ({ page }) => {
  await open(page);
  await newTask(page);
  await sheet(page).getByLabel('Navn').fill('Kun en titel AT01');
  await expect(sheet(page).getByLabel('Projekt (valgfrit)')).toHaveValue('');
  await save(page);
  await expect(page.getByRole('status').filter({ hasText: 'Gemt.' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await expect(taskTitles(page, 'Kun en titel AT01')).toHaveCount(1);
  await page.getByLabel('Projekt', { exact: true }).selectOption({ label: 'Uden projekt' });
  await expect(taskTitles(page, 'Kun en titel AT01')).toHaveCount(1);
  const stored = (await storedTasks(page)).find((t) => t.title === 'Kun en titel AT01');
  expect(stored).toMatchObject({ projectId: null, areaId: null });
});

test('AT-02 quick-create Opgave without project with Enter and with the button', async ({ page }) => {
  await open(page);
  const bar = page.getByRole('form', { name: 'Hurtig registrering' });
  await bar.getByLabel('Type').selectOption('task');
  await bar.getByLabel('Ny opgave').fill('Hurtig via Enter');
  await bar.getByLabel('Ny opgave').press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Opgaven er oprettet.' })).toBeVisible();
  await expect(bar.getByLabel('Ny opgave')).toHaveValue('');
  await bar.getByLabel('Ny opgave').fill('Hurtig via knap');
  await bar.getByRole('button', { name: 'Tilføj' }).click();
  await expect(taskTitles(page, 'Hurtig via Enter')).toHaveCount(1);
  await expect(taskTitles(page, 'Hurtig via knap')).toHaveCount(1);
  const stored = await storedTasks(page);
  expect(stored.filter((t) => t.title.startsWith('Hurtig via')).every((t) => t.projectId === null)).toBe(true);
});

test('AT-03 Model task without project appears once in the area board and not on project boards', async ({ page }) => {
  await open(page, '/areas');
  await page.getByRole('button', { name: /^Model/ }).click();
  await expect(page).toHaveURL(/area=/);
  await newTask(page);
  await expect(sheet(page).getByLabel('Område (valgfrit)')).toHaveValue(/.+/);
  await sheet(page).getByLabel('Navn').fill('Model uden projekt AT03');
  await save(page);
  await expect(taskTitles(page, 'Model uden projekt AT03')).toHaveCount(1);
  await open(page, `/projects/${OKAI}`);
  await expect(page.getByText('opgaver matcher')).toBeVisible();
  await expect(taskTitles(page, 'Model uden projekt AT03')).toHaveCount(0);
});

test('AT-04 one canonical task: status changed in the area board shows in project board and list', async ({ page }) => {
  await open(page, '/areas');
  await newTask(page);
  await sheet(page).getByLabel('Navn').fill('Delt opgave AT04');
  await sheet(page).getByLabel('Projekt (valgfrit)').selectOption({ label: 'OKAI' });
  await sheet(page).getByLabel('Område (valgfrit)').selectOption({ label: 'Model' });
  await save(page);
  await page.getByLabel('Status for Delt opgave AT04').selectOption('blocked');
  await expect(page.getByRole('status').filter({ hasText: 'Flyttet til Blokeret.' })).toBeVisible();

  await open(page, `/projects/${OKAI}`);
  const blocked = page.getByRole('region', { name: 'Blokeret' });
  await expect(taskTitles(blocked, 'Delt opgave AT04')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Liste' }).click();
  await expect(page.getByLabel('Status for Delt opgave AT04')).toHaveValue('blocked');
});

test('AT-05 combined filters give matching count and cards; reset keeps project route scope', async ({ page }) => {
  await open(page, '/areas');
  await page.getByLabel('Område', { exact: true }).selectOption({ label: 'Model' });
  await page.getByLabel('Ansvarlig', { exact: true }).selectOption({ label: 'Nicholas' });
  await page.getByLabel('Projekt', { exact: true }).selectOption({ label: 'OKAI' });
  await page.getByLabel('Søg').fill('KVALITET');
  await expect(page.getByText('1 opgave matcher')).toBeVisible();
  await expect(page.locator('[data-task-id]')).toHaveCount(1);
  await expect(taskTitles(page, 'Afklar kvalitetskriterier')).toHaveCount(1);
  // Card count per area uses the same selector.
  await expect(page.getByRole('button', { name: /^Model/ })).toContainText('1 opgave');

  await open(page, `/projects/${OKAI}?area=00000000-0000-4000-8000-0000000000b2&q=kval`);
  await expect(page.getByText('1 opgave matcher')).toBeVisible();
  await page.getByRole('button', { name: 'Nulstil' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${OKAI}$`));
  await expect(page.getByText('3 opgaver matcher')).toBeVisible();
});

test('AT-06 typed comment and checklist text are saved exactly once without pressing Tilføj', async ({ page }) => {
  await open(page);
  await taskTitles(page, 'Afklar kvalitetskriterier').click();
  await sheet(page).getByPlaceholder('Ny delopgave').fill('Ikke tilføjet delopgave');
  await sheet(page).getByLabel('Ny kommentar').fill('Ikke tilføjet kommentar');
  await save(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await taskTitles(page, 'Afklar kvalitetskriterier').click();
  await expect(sheet(page).getByRole('textbox', { name: /Delopgave \d/ })).toHaveCount(3);
  await expect(sheet(page).getByText('Ikke tilføjet kommentar', { exact: true })).toHaveCount(1);
  await expect(sheet(page).locator('input[value="Ikke tilføjet delopgave"]')).toHaveCount(1);
});

test('AT-07 dirty panel asks before closing; Bliv keeps the draft; focus returns to the opener', async ({ page }) => {
  await open(page);
  const opener = taskTitles(page, 'Afklar kvalitetskriterier');
  await opener.click();
  await sheet(page).getByLabel('Navn').fill('Ændret navn AT07');

  await page.keyboard.press('Escape');
  const ask = page.getByRole('alertdialog', { name: 'Du har ændringer, der ikke er gemt.' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Bliv' }).click();
  await expect(sheet(page).getByLabel('Navn')).toHaveValue('Ændret navn AT07');

  await page.mouse.click(100, 500); // backdrop
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Bliv' }).click();
  await expect(sheet(page).getByLabel('Navn')).toHaveValue('Ændret navn AT07');

  // Navigating away from the page asks as well (sidebar sits behind the sheet, so use the guard via URL-less nav).
  await sheet(page).getByRole('button', { name: 'Annuller' }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Kassér' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(taskTitles(page, 'Afklar kvalitetskriterier')).toHaveCount(1);
});

test('AT-07b navigation with a dirty editor asks Gem / Kassér / Bliv', async ({ page }) => {
  await open(page);
  await newTask(page);
  await sheet(page).getByLabel('Navn').fill('Kladde AT07b');
  // Close the sheet's focus trap first by asking, staying, then navigating from the keyboard shortcut path.
  await page.evaluate(() => {
    // Simulate an in-app navigation request while the editor is dirty.
    (document.querySelector('a[href="/thoughts"]') as HTMLAnchorElement).click();
  });
  const ask = page.getByRole('alertdialog');
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Bliv' }).click();
  await expect(page).toHaveURL(/\/today/);
  await expect(sheet(page).getByLabel('Navn')).toHaveValue('Kladde AT07b');
});

test('AT-08 failed save shows no success, keeps the draft and retries without duplicates', async ({ page }) => {
  await open(page);
  await newTask(page);
  await sheet(page).getByLabel('Navn').fill('Fejler først AT08');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { __restore: () => void }).__restore = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'ai-team-space-v3') throw new DOMException('Quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await save(page);
  await expect(sheet(page).getByRole('alert')).toContainText('Kunne ikke gemme. Din tekst er bevaret. Prøv igen.');
  await expect(page.getByRole('status').filter({ hasText: 'Gemt.' })).toHaveCount(0);
  await expect(sheet(page).getByLabel('Navn')).toHaveValue('Fejler først AT08');

  await page.evaluate(() => (window as unknown as { __restore: () => void }).__restore());
  await save(page);
  await expect(page.getByRole('status').filter({ hasText: 'Gemt.' })).toBeVisible();
  expect((await storedTasks(page)).filter((t) => t.title === 'Fejler først AT08')).toHaveLength(1);
});

test('AT-09 two tabs editing the same task: second save conflicts and keeps its draft', async ({ context }) => {
  const a = await context.newPage();
  await open(a);
  const b = await context.newPage();
  await open(b);
  for (const page of [a, b]) await taskTitles(page, 'Afklar kvalitetskriterier').click();
  await sheet(a).getByLabel('Navn').fill('Fra fane A');
  await sheet(b).getByLabel('Navn').fill('Fra fane B');
  await save(a);
  await expect(a.getByRole('status').filter({ hasText: 'Gemt.' })).toBeVisible();
  await save(b);
  await expect(sheet(b).getByRole('alert')).toContainText('Opgaven er blevet opdateret af en anden. Din kladde er bevaret.');
  await expect(sheet(b).getByLabel('Navn')).toHaveValue('Fra fane B');
  expect((await storedTasks(b)).some((t) => t.title === 'Fra fane A')).toBe(true);

  await sheet(b).getByRole('button', { name: 'Brug nyeste og anvend mine ændringer' }).click();
  await expect(sheet(b).getByLabel('Navn')).toHaveValue('Fra fane B');
  await save(b);
  await expect(b.getByRole('status').filter({ hasText: 'Gemt.' })).toBeVisible();
});

test('AT-10 export, change and restore a backup; an invalid backup leaves data untouched', async ({ page }, testInfo) => {
  await open(page);
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await sheet(page).getByRole('button', { name: 'Eksportér backup' }).click();
  const backupPath = testInfo.outputPath('backup.json');
  await (await downloadPromise).saveAs(backupPath);
  await sheet(page).getByRole('button', { name: 'Luk', exact: true }).first().click();

  const bar = page.getByRole('form', { name: 'Hurtig registrering' });
  await bar.getByLabel('Type').selectOption('task');
  await bar.getByLabel('Ny opgave').fill('Efter backup AT10');
  await bar.getByLabel('Ny opgave').press('Enter');
  await expect(taskTitles(page, 'Efter backup AT10')).toHaveCount(1);

  const invalidPath = testInfo.outputPath('invalid.json');
  const broken = JSON.parse(readFileSync(backupPath, 'utf8'));
  broken.data.tasks[0].projectId = '99999999-9999-4999-8999-999999999999';
  writeFileSync(invalidPath, JSON.stringify(broken));
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await sheet(page).getByLabel(/Vælg en backupfil/).setInputFiles(invalidPath);
  await expect(sheet(page).getByRole('alert')).toContainText('Filen kan ikke gendannes');
  expect((await storedTasks(page)).some((t) => t.title === 'Efter backup AT10')).toBe(true);

  await sheet(page).getByLabel(/Vælg en backupfil/).setInputFiles(backupPath);
  await sheet(page).getByRole('button', { name: 'Gendan backup' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Erstat de nuværende data?' });
  const safetyCopy = page.waitForEvent('download');
  await confirm.getByRole('button', { name: 'Gendan backup' }).click();
  await safetyCopy;
  await expect(page.getByRole('status').filter({ hasText: 'Backup gendannet.' })).toBeVisible();
  await expect(taskTitles(page, 'Efter backup AT10')).toHaveCount(0);
  expect((await storedTasks(page)).some((t) => t.title === 'Efter backup AT10')).toBe(false);
});

test('AT-11 malformed storage shows recovery and is never overwritten; fresh start shows no error', async ({ browser }) => {
  const fresh = await browser.newPage();
  await open(fresh);
  await expect(fresh.getByText('Gemte data kunne ikke læses')).toHaveCount(0);
  await fresh.close();

  const page = await browser.newPage();
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, '{"format":"teamspace-demo", broken');
      sessionStorage.setItem('seeded', '1');
    }
  }, STORAGE_KEY);
  await page.goto('/today');
  await expect(page.getByRole('alert').filter({ hasText: 'Gemte data kunne ikke læses. De bliver ikke overskrevet.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Eksportér gemte data' })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: 'Gemte data kunne ikke læses' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('{"format":"teamspace-demo", broken');
});

test('AT-12 archive and restore a task and a project; counts update', async ({ page }) => {
  await open(page, '/today?scope=team');
  await expect(page.getByText('8 opgaver matcher')).toBeVisible();
  await taskTitles(page, 'Sammenlign to sprogmodeller').click();
  await sheet(page).getByRole('button', { name: 'Arkivér' }).click();
  await expect(page.getByText('7 opgaver matcher')).toBeVisible();
  await expect(taskTitles(page, 'Sammenlign to sprogmodeller')).toHaveCount(0);

  await open(page, '/archive');
  await page.getByRole('listitem').filter({ hasText: 'Sammenlign to sprogmodeller' }).getByRole('button', { name: 'Gendan' }).click();
  await open(page, '/today?scope=team');
  await expect(page.getByText('8 opgaver matcher')).toBeVisible();

  await open(page, `/projects/${OKAI}`);
  await page.getByRole('button', { name: 'Redigér projekt' }).click();
  await sheet(page).getByRole('button', { name: 'Arkivér' }).click();
  await open(page, '/projects');
  await expect(page.getByRole('link', { name: /OKAI/ })).toHaveCount(0);
  await open(page, `/projects/${OKAI}`);
  await expect(page.getByText('Projektet er arkiveret. Opgaver og noter er bevaret.')).toBeVisible();
  await expect(page.getByText('3 opgaver matcher')).toBeVisible();
  await page.getByRole('button', { name: 'Gendan' }).click();
  await open(page, '/projects');
  await expect(page.getByRole('main').getByRole('link', { name: /OKAI/ })).toHaveCount(1);
});

test('AT-13 thought type filter never affects the area board; navigation drops stale filters', async ({ page }) => {
  await open(page, '/thoughts');
  await page.getByLabel('Type', { exact: true }).last().selectOption({ label: 'Læring' });
  await expect(page.getByText('1 tanke', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Hovedmenu' }).getByRole('link', { name: 'Vores områder' }).click();
  await expect(page).toHaveURL(/\/areas$/);
  await expect(page.getByText('8 opgaver matcher')).toBeVisible();
  for (const area of ['Data', 'Model', 'Adoption']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${area}`) })).toHaveAttribute('aria-pressed', 'false');
  }
});

test('AT-14 theme toggle and all four destinations on desktop and mobile', async ({ page }) => {
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Lyst tema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const destinations: Array<[string, RegExp, string]> = [
    ['I dag', /\/today/, 'Hej Nicholas. Hvad er næste skridt?'],
    ['Vores områder', /\/areas/, 'Tre områder. Ét fælles arbejde.'],
    ['Projekter', /\/projects/, 'Vores rejse'],
    ['Tanker', /\/thoughts/, 'Giv tankerne plads.'],
  ];
  for (const [label, url, heading] of destinations) {
    await page.getByRole('navigation', { name: 'Hovedmenu' }).getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [label, url, heading] of destinations) {
    await page.getByRole('button', { name: 'Åbn menu' }).click();
    await page.getByRole('dialog').getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});

test('AT-15 keyboard only: create, filter, change status, open and close', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Ny opgave' }).focus();
  await page.keyboard.press('Enter');
  await expect(sheet(page).getByLabel('Navn')).toBeFocused();
  await page.keyboard.type('Tastatur AT15');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Gemt.' })).toBeVisible();

  await page.getByLabel('Søg').focus();
  await page.keyboard.type('tastatur');
  await expect(page.getByText('1 opgave matcher')).toBeVisible();

  const statusSelect = page.getByLabel('Status for Tastatur AT15');
  await statusSelect.focus();
  await page.keyboard.press('ArrowDown');
  await expect(statusSelect).toHaveValue('in_progress');

  const title = taskTitles(page, 'Tastatur AT15');
  await title.focus();
  await page.keyboard.press('Enter');
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(title).toBeFocused();
});

test('AT-15b kanban cards move with Alt+arrow keys', async ({ page }) => {
  await open(page, `/projects/${OKAI}`);
  const title = taskTitles(page, 'Planlæg feedback fra brugerne');
  await title.focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(taskTitles(page.getByRole('region', { name: 'I gang' }), 'Planlæg feedback fra brugerne')).toHaveCount(1);
  await expect(taskTitles(page, 'Planlæg feedback fra brugerne')).toBeFocused();
});

test('AT-16 HTML-like content is displayed as text and never executed', async ({ page }) => {
  await open(page);
  const payload = '<img src=x onerror="window.__xss=1">';
  const bar = page.getByRole('form', { name: 'Hurtig registrering' });
  await bar.getByLabel('Type').selectOption('task');
  await bar.getByLabel('Ny opgave').fill(payload);
  await bar.getByLabel('Ny opgave').press('Enter');
  await expect(taskTitles(page, payload)).toHaveCount(1);

  await open(page, '/thoughts');
  await page.getByLabel('Ny tanke').fill('<script>window.__xss=2</script>');
  await page.getByLabel('Ny tanke').press('Enter');
  await expect(page.getByText('<script>window.__xss=2</script>', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.locator('main img')).toHaveCount(0);
});
