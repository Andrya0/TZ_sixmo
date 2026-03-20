import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from 'playwright';

async function ensureFileExists(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  await fs.access(absolutePath);
  return absolutePath;
}

async function isVisible(locator: Locator): Promise<boolean> {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function trySetOnInput(locator: Locator, absolutePath: string): Promise<boolean> {
  try {
    await locator.setInputFiles(absolutePath, { timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

async function tryAllFileInputs(page: Page, absolutePath: string): Promise<boolean> {
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count().catch(() => 0);

  for (let i = 0; i < count; i += 1) {
    const input = inputs.nth(i);
    if (await trySetOnInput(input, absolutePath)) return true;
  }

  return false;
}

async function tryByLabelFor(page: Page, absolutePath: string, aliases: string[]): Promise<boolean> {
  for (const alias of aliases) {
    const label = page.getByText(alias, { exact: false }).first();
    if (!(await isVisible(label))) continue;

    try {
      const targetId = await label.evaluate((el) => el.getAttribute('for'));
      if (!targetId) continue;

      const input = page.locator(`#${targetId}`);
      if (await trySetOnInput(input, absolutePath)) return true;
    } catch {
      // noop
    }
  }

  return false;
}

async function tryScopedInput(page: Page, absolutePath: string, aliases: string[]): Promise<boolean> {
  for (const alias of aliases) {
    const anchor = page.getByText(alias, { exact: false }).first();
    if (!(await isVisible(anchor))) continue;

    const containers = [
      anchor.locator('xpath=ancestor-or-self::*[self::label or self::div or self::section or self::article][1]'),
      anchor.locator('xpath=ancestor::*[self::label or self::div or self::section or self::article][2]')
    ];

    for (const container of containers) {
      const input = container.locator('input[type="file"]').first();
      const count = await input.count().catch(() => 0);
      if (!count) continue;

      if (await trySetOnInput(input, absolutePath)) return true;
    }
  }

  return false;
}

async function tryClickTrigger(page: Page, absolutePath: string, aliases: string[]): Promise<boolean> {
  const triggerNames = [
    ...aliases,
    'Загрузить файл',
    'Прикрепить файл',
    'Выберите файл',
    'Выбрать файл',
    'Загрузить',
    'Upload',
    'Attach',
    'Browse'
  ];

  for (const name of triggerNames) {
    const triggers = [
      page.getByRole('button', { name, exact: false }).first(),
      page.getByRole('link', { name, exact: false }).first(),
      page.getByText(name, { exact: false }).first()
    ];

    for (const trigger of triggers) {
      if (!(await isVisible(trigger))) continue;

      try {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 1800 }).catch(() => null);

        await trigger.scrollIntoViewIfNeeded().catch(() => undefined);
        await trigger.click({ timeout: 1500 }).catch(() => undefined);

        const chooser = await chooserPromise;
        if (chooser) {
          await chooser.setFiles(absolutePath);
          return true;
        }

        if (await tryAllFileInputs(page, absolutePath)) return true;
      } catch {
        // noop
      }
    }
  }

  return false;
}

export async function uploadFile(page: Page, filePath: string, aliases: string[]): Promise<void> {
  const absolutePath = await ensureFileExists(filePath);

  if (await tryAllFileInputs(page, absolutePath)) return;
  if (await tryByLabelFor(page, absolutePath, aliases)) return;
  if (await tryScopedInput(page, absolutePath, aliases)) return;
  if (await tryClickTrigger(page, absolutePath, aliases)) return;

  throw new Error('Не удалось найти рабочий механизм загрузки файла на текущем шаге');
}