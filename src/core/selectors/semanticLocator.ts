import type { Locator, Page } from 'playwright';
import type { FieldInput } from '../domain/contracts.js';

const INTERACTIVE_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
  'textarea',
  'select',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[contenteditable="true"]',
  'input[type="file"]'
].join(', ');

export type LocatorSearchOptions = {
  strictInteractive?: boolean;
  allowTextFallback?: boolean;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function scoreText(haystack: string, needles: string[]): number {
  const text = normalizeText(haystack);
  let score = 0;

  for (const needle of needles) {
    const n = normalizeText(needle);
    if (!n) continue;
    if (text === n) score += 100;
    else if (text.includes(n)) score += 25;
  }

  return score;
}

async function visible(loc: Locator): Promise<boolean> {
  try {
    return await loc.isVisible();
  } catch {
    return false;
  }
}

async function enabled(loc: Locator): Promise<boolean> {
  try {
    return await loc.isEnabled();
  } catch {
    return true;
  }
}

async function interactive(loc: Locator): Promise<boolean> {
  return (await visible(loc)) && (await enabled(loc));
}

async function candidateText(locator: Locator): Promise<string> {
  return locator.evaluate((el) => {
    const html = el as HTMLElement;
    const get = (name: string) => html.getAttribute(name) ?? '';

    const labelText = html.id
      ? Array.from(document.querySelectorAll(`label[for="${html.id}"]`))
          .map((x) => x.textContent ?? '')
          .join(' ')
      : '';

    const ownText = (html.innerText || html.textContent || '').trim();
    const parentText = (html.parentElement?.textContent || '').trim();
    const closestLabel = (html.closest('label')?.textContent || '').trim();

    return [
      get('aria-label'),
      get('placeholder'),
      get('name'),
      get('id'),
      get('title'),
      get('data-testid'),
      labelText,
      closestLabel,
      parentText,
      ownText
    ].join(' | ');
  });
}

async function findInteractiveNearText(page: Page, alias: string): Promise<Locator | null> {
  const textNode = page.getByText(alias, { exact: false }).first();
  if (!(await visible(textNode))) return null;

  const containers = [
    textNode.locator('xpath=ancestor-or-self::*[self::label or self::div or self::section or self::article or self::li][1]'),
    textNode.locator('xpath=ancestor::*[self::label or self::div or self::section or self::article or self::li][2]'),
    textNode.locator('xpath=ancestor::*[self::form or self::fieldset][1]')
  ];

  for (const container of containers) {
    const nested = container.locator(INTERACTIVE_SELECTOR).first();
    if (await interactive(nested)) {
      return nested;
    }
  }

  return null;
}

export async function findBestLocator(
  page: Page,
  field: FieldInput,
  options: LocatorSearchOptions = {}
): Promise<Locator | null> {
  const strictInteractive = options.strictInteractive ?? false;
  const allowTextFallback = options.allowTextFallback ?? !strictInteractive;
  const aliases = [field.key, ...((field.aliases ?? []) as string[])];

  const rawSelectors = Array.isArray((field as any).selectors) ? (field as any).selectors : [];

  for (const selector of rawSelectors) {
    const candidate = page.locator(selector).first();
    if (strictInteractive ? await interactive(candidate) : await visible(candidate)) {
      return candidate;
    }
  }

  const strongLocators: Locator[] = [
    ...aliases.map((alias) => page.getByLabel(alias, { exact: false }).first()),
    ...aliases.map((alias) => page.getByPlaceholder(alias).first()),
    ...aliases.map((alias) => page.getByRole('textbox', { name: alias, exact: false }).first()),
    ...aliases.map((alias) => page.getByRole('combobox', { name: alias, exact: false }).first()),
    ...aliases.map((alias) => page.getByRole('checkbox', { name: alias, exact: false }).first()),
    ...aliases.map((alias) => page.getByRole('radio', { name: alias, exact: false }).first())
  ];

  if ((field as any).type === 'file') {
    strongLocators.push(page.locator('input[type="file"]').first());
  }

  for (const locator of strongLocators) {
    if (strictInteractive ? await interactive(locator) : await visible(locator)) {
      return locator;
    }
  }

  for (const alias of aliases) {
    const nearby = await findInteractiveNearText(page, alias);
    if (nearby) {
      return nearby;
    }
  }

  const candidates = page.locator(INTERACTIVE_SELECTOR);
  const count = await candidates.count();
  let best: { locator: Locator; score: number } | null = null;

  for (let i = 0; i < count; i += 1) {
    const locator = candidates.nth(i);
    if (!(strictInteractive ? await interactive(locator) : await visible(locator))) {
      continue;
    }

    const text = await candidateText(locator).catch(() => '');
    const score = scoreText(text, aliases);

    if (!best || score > best.score) {
      best = { locator, score };
    }
  }

  if (best && best.score > 0) {
    return best.locator;
  }

  if (allowTextFallback) {
    for (const alias of aliases) {
      const textNode = page.getByText(alias, { exact: false }).first();
      if (await visible(textNode)) {
        return textNode;
      }
    }
  }

  return null;
}