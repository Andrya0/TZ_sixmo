import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function saveScreenshot(page: Page, dir: string, name: string): Promise<string> {
  await ensureDir(dir);
  const filePath = path.join(dir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

export async function saveHtml(page: Page, dir: string, name: string): Promise<string> {
  await ensureDir(dir);
  const filePath = path.join(dir, `${name}.html`);
  await fs.writeFile(filePath, await page.content(), 'utf8');
  return filePath;
}

export async function saveJson(dir: string, name: string, payload: unknown): Promise<string> {
  await ensureDir(dir);
  const filePath = path.join(dir, `${name}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}
