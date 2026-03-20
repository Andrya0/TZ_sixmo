import type { Locator, Page } from 'playwright';
import type { FieldInput, SkillInput } from '../domain/contracts.js';
import { uploadFile } from '../selectors/fileUpload.js';
import { saveScreenshot } from '../resilience/artifacts.js';

type Logger = {
  debug: (msg: string, data?: any) => void;
  info: (msg: string, data?: any) => void;
  warn: (msg: string, data?: any) => void;
  error: (msg: string, data?: any) => void;
};

type ScreenState = 'landing' | 'generating' | 'form' | 'complete' | 'unknown';

type AnswerBank = {
  text: string[];
  textarea: string[];
  select: string[];
  file: string[];
};

type VisibleControl = {
  kind: 'text' | 'textarea' | 'select' | 'file';
  locator: Locator;
  key: string;
  label: string;
  placeholder: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function stableKey(parts: Array<string | undefined | null>): string {
  return parts.map((p) => normalizeText(String(p ?? ''))).join('|');
}

function isNetworkErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return [
    'err_proxy_connection_failed',
    'err_name_not_resolved',
    'err_connection_refused',
    'err_connection_reset',
    'err_connection_closed',
    'err_tunnel_connection_failed',
    'err_internet_disconnected',
    'timeout',
    'enotfound'
  ].some((part) => normalized.includes(part));
}

function makeAnswerBank(fields: FieldInput[]): AnswerBank {
  const bank: AnswerBank = {
    text: [],
    textarea: [],
    select: [],
    file: []
  };

  for (const field of fields) {
    const type = String((field as any).type ?? 'text');
    const raw = (field as any).value;
    const values = Array.isArray(raw) ? raw.map((v) => String(v)) : [String(raw ?? '')];

    if (type === 'textarea') bank.textarea.push(...values);
    else if (type === 'select') bank.select.push(...values);
    else if (type === 'file') bank.file.push(...values);
    else bank.text.push(...values);
  }

  return bank;
}

function pullValue(list: string[], fallback: string): string {
  if (list.length > 0) return list.shift() as string;
  return fallback;
}

function looksLikeUsefulPlaceholder(value: string): boolean {
  const text = normalizeText(value);
  if (!text) return false;

  const bad = [
    'введите',
    'напишите',
    'текст',
    'ответ',
    'значение',
    'комментарий',
    'сообщение'
  ];

  return !bad.some((x) => text.includes(x));
}

function resolveTextAnswer(label: string, placeholder: string, bank: AnswerBank): string {
  const l = normalizeText(label);
  const p = normalizeText(placeholder);

  if (looksLikeUsefulPlaceholder(placeholder)) {
    return placeholder.trim();
  }

  if (l.includes('сова') || l.includes('букля')) return 'Букля';
  if (l.includes('факультет') || l.includes('гриффиндор')) return 'Гриффиндор';
  if (l.includes('платформ')) return 'Платформа 9 3/4';
  if (l.includes('поезд') && l.includes('хогвартс')) return 'Платформа 9 3/4';
  if (l.includes('школ') && l.includes('гарри')) return 'Хогвартс';

  if (looksLikeUsefulPlaceholder(p)) {
    return placeholder.trim();
  }

  return pullValue(bank.text, 'Тестовое значение');
}

function scoreOption(label: string, optionText: string): number {
  const l = normalizeText(label);
  const o = normalizeText(optionText);

  if (!o || o.includes('выберите')) return -100;

  let score = 0;

  if (l.includes('школ') && l.includes('гарри')) {
    if (o.includes('хогвартс')) score += 100;
  }

  if (l.includes('квиддич')) {
    if (o.includes('метл')) score += 100;
    if (o.includes('снитч')) score += 70;
    if (o.includes('бладжер')) score += 60;
    if (o.includes('квоффл')) score += 60;
  }

  if (l.includes('платформ')) {
    if (o.includes('9') || o.includes('3/4')) score += 100;
  }

  return score;
}

async function chooseSelectValue(locator: Locator, label: string, bank: AnswerBank): Promise<string> {
  const options = await locator.evaluate((el) => {
    return Array.from((el as HTMLSelectElement).options).map((o) => ({
      value: o.value,
      text: (o.textContent ?? '').trim()
    }));
  });

  const preferredFromBank = bank.select.length > 0 ? bank.select[0] : '';
  const preferredNorm = normalizeText(preferredFromBank);

  if (preferredNorm) {
    const exact = options.find((o) => normalizeText(o.text) === preferredNorm || normalizeText(o.value) === preferredNorm);
    if (exact) {
      await locator.selectOption(exact.value);
      return exact.text;
    }
  }

  const scored = options
    .map((o) => ({ ...o, score: scoreOption(label, o.text) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0 && scored[0].score > 0) {
    await locator.selectOption(scored[0].value);
    return scored[0].text;
  }

  const firstValid = options.find((o) => {
    const txt = normalizeText(o.text);
    return txt && !txt.includes('выберите');
  });

  if (firstValid) {
    await locator.selectOption(firstValid.value);
    return firstValid.text;
  }

  throw new Error('No valid select option found');
}

async function safeGoto(page: Page, input: SkillInput, logger: Logger): Promise<void> {
  try {
    await page.goto(input.url, {
      waitUntil: 'domcontentloaded',
      timeout: input.timeoutMs
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error('Initial navigation failed', {
      url: input.url,
      message
    });

    if (isNetworkErrorMessage(message)) {
      throw new Error(
        `Playwright не смог открыть ${input.url}. Похоже на проблему сети/прокси/VPN/фильтрации. Исходная ошибка: ${message}`
      );
    }

    throw error;
  }
}

async function waitForTransition(page: Page, input: SkillInput): Promise<void> {
  await Promise.race([
    page.waitForLoadState('domcontentloaded', { timeout: input.transitionTimeoutMs }).catch(() => undefined),
    page.waitForTimeout(900)
  ]);

  await page.waitForTimeout(input.initialSettlingMs);
}

async function countUsableControls(page: Page): Promise<number> {
  return page.evaluate(() => {
    const selector = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      'textarea',
      'select',
      'input[type="file"]'
    ].join(', ');

    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

    const isVisible = (el: HTMLElement) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    return elements.filter((el) => !el.hasAttribute('disabled') && isVisible(el)).length;
  });
}

async function getBodyText(page: Page): Promise<string> {
  try {
    const txt = await page.locator('body').innerText();
    return normalizeText(txt);
  } catch {
    return '';
  }
}

async function detectScreenState(page: Page): Promise<ScreenState> {
  const usableControls = await countUsableControls(page);
  if (usableControls > 0) return 'form';

  const bodyText = await getBodyText(page);

  if (
    bodyText.includes('спасибо') ||
    bodyText.includes('результат') ||
    bodyText.includes('завершено') ||
    bodyText.includes('успешно')
  ) {
    return 'complete';
  }

  const generatingButton = page.getByRole('button', { name: /создаю сценарий/i }).first();
  if (await generatingButton.isVisible().catch(() => false)) return 'generating';

  const startButton = page.getByRole('button', { name: /начать задание|начать|start/i }).first();
  if (await startButton.isVisible().catch(() => false)) return 'landing';

  return 'unknown';
}

async function getStartButton(page: Page): Promise<Locator | null> {
  const candidates = [
    page.getByRole('button', { name: /начать задание/i }).first(),
    page.getByRole('button', { name: /начать/i }).first(),
    page.getByText(/начать задание/i).first(),
    page.getByText(/начать/i).first()
  ];

  for (const locator of candidates) {
    if (await locator.isVisible().catch(() => false)) return locator;
  }

  return null;
}

async function humanMouseClick(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Start button has no bounding box');

  const x = box.x + box.width / 2 + (Math.random() * 6 - 3);
  const y = box.y + box.height / 2 + (Math.random() * 6 - 3);

  await page.mouse.move(x - 20, y - 10, { steps: 8 });
  await page.waitForTimeout(80);
  await page.mouse.move(x, y, { steps: 6 });
  await page.waitForTimeout(50);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
}

async function tryStartStrategies(page: Page, logger: Logger): Promise<boolean> {
  const button = await getStartButton(page);
  if (!button) return false;

  const strategies: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'human-mouse-click',
      run: async () => {
        await button.scrollIntoViewIfNeeded().catch(() => undefined);
        await humanMouseClick(page, button);
      }
    },
    {
      name: 'normal-click',
      run: async () => {
        await button.scrollIntoViewIfNeeded().catch(() => undefined);
        await button.click({ timeout: 2000 });
      }
    },
    {
      name: 'force-click',
      run: async () => {
        await button.scrollIntoViewIfNeeded().catch(() => undefined);
        await button.click({ force: true, timeout: 2000 });
      }
    }
  ];

  for (const strategy of strategies) {
    try {
      logger.info('Trying start strategy', { strategy: strategy.name });
      await strategy.run();
      return true;
    } catch (error) {
      logger.warn('Start strategy failed', {
        strategy: strategy.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return false;
}

async function waitForPostStartState(page: Page, input: SkillInput, logger: Logger): Promise<ScreenState> {
  const deadline = Date.now() + Math.max(input.transitionTimeoutMs, 12000);
  let previousState: ScreenState | null = null;

  while (Date.now() < deadline) {
    const state = await detectScreenState(page);

    if (state !== previousState) {
      logger.info('Screen state observed', { state });
      previousState = state;
    }

    if (state === 'generating' || state === 'form' || state === 'complete') {
      return state;
    }

    await delay(350);
  }

  return (await detectScreenState(page)) ?? 'unknown';
}

async function ensureStarted(page: Page, input: SkillInput, logger: Logger): Promise<void> {
  const initialState = await detectScreenState(page);
  logger.info('Initial screen state', { state: initialState });

  if (initialState === 'form' || initialState === 'complete') return;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    logger.info('Start attempt', { attempt });

    const clicked = await tryStartStrategies(page, logger);
    if (!clicked) continue;

    await waitForTransition(page, input);
    const state = await waitForPostStartState(page, input, logger);

    if (state === 'generating' || state === 'form' || state === 'complete') {
      logger.info('Start transition confirmed', { state, attempt });
      return;
    }

    logger.warn('Start interaction produced no state transition', { attempt, state });
    await page.waitForTimeout(700);
  }

  throw new Error('После нажатия "Начать задание" приложение осталось на стартовом экране.');
}

async function waitForScenarioReady(page: Page, input: SkillInput, logger: Logger): Promise<void> {
  logger.info('Waiting for scenario generation to finish...');

  const deadline = Date.now() + Math.max(input.timeoutMs, 15000);

  while (Date.now() < deadline) {
    const state = await detectScreenState(page);

    if (state === 'form' || state === 'complete') {
      logger.info('Scenario ready', { state });
      return;
    }

    await delay(500);
  }

  const finalState = await detectScreenState(page);
  logger.warn('Scenario did not become ready in time', { finalState });

  if (finalState === 'landing') {
    throw new Error('Сценарий не стартовал: интерфейс остался на landing state.');
  }
}

async function clickNavigation(page: Page, labels: string[], logger?: Logger): Promise<boolean> {
  for (const label of labels) {
    const groups = [
      page.getByRole('button', { name: label, exact: false }),
      page.getByText(label, { exact: false })
    ];

    for (const group of groups) {
      const count = await group.count().catch(() => 0);

      for (let i = 0; i < count; i += 1) {
        const locator = group.nth(i);
        if (!(await locator.isVisible().catch(() => false))) continue;

        try {
          await locator.scrollIntoViewIfNeeded().catch(() => undefined);
          await locator.click({ timeout: 1500 });
          logger?.info('Navigation click', { label });
          return true;
        } catch {
          // continue
        }
      }
    }
  }

  return false;
}

async function extractVisibleControls(page: Page): Promise<VisibleControl[]> {
  const controls: VisibleControl[] = [];

  const texts = page.locator('input[type="text"], input[type="email"], input[type="tel"], input[type="date"], input[type="number"]');
  const textCount = await texts.count().catch(() => 0);

  for (let i = 0; i < textCount; i += 1) {
    const locator = texts.nth(i);
    if (!(await locator.isVisible().catch(() => false))) continue;

    const meta = await locator.evaluate((el) => {
      const html = el as HTMLElement;
      const labelFromFor = html.id
        ? Array.from(document.querySelectorAll(`label[for="${html.id}"]`))
            .map((x) => x.textContent ?? '')
            .join(' ')
        : '';

      return {
        id: html.id || '',
        name: html.getAttribute('name') || '',
        placeholder: html.getAttribute('placeholder') || '',
        label: labelFromFor || ''
      };
    }).catch(() => ({ id: '', name: '', placeholder: '', label: '' }));

    controls.push({
      kind: 'text',
      locator,
      key: stableKey(['text', meta.label, meta.placeholder, meta.id, meta.name]),
      label: meta.label,
      placeholder: meta.placeholder
    });
  }

  const textareas = page.locator('textarea');
  const taCount = await textareas.count().catch(() => 0);

  for (let i = 0; i < taCount; i += 1) {
    const locator = textareas.nth(i);
    if (!(await locator.isVisible().catch(() => false))) continue;

    const meta = await locator.evaluate((el) => {
      const html = el as HTMLElement;
      const labelFromFor = html.id
        ? Array.from(document.querySelectorAll(`label[for="${html.id}"]`))
            .map((x) => x.textContent ?? '')
            .join(' ')
        : '';

      return {
        id: html.id || '',
        name: html.getAttribute('name') || '',
        placeholder: html.getAttribute('placeholder') || '',
        label: labelFromFor || ''
      };
    }).catch(() => ({ id: '', name: '', placeholder: '', label: '' }));

    controls.push({
      kind: 'textarea',
      locator,
      key: stableKey(['textarea', meta.label, meta.placeholder, meta.id, meta.name]),
      label: meta.label,
      placeholder: meta.placeholder
    });
  }

  const selects = page.locator('select');
  const selectCount = await selects.count().catch(() => 0);

  for (let i = 0; i < selectCount; i += 1) {
    const locator = selects.nth(i);
    if (!(await locator.isVisible().catch(() => false))) continue;

    const meta = await locator.evaluate((el) => {
      const html = el as HTMLElement;
      const labelFromFor = html.id
        ? Array.from(document.querySelectorAll(`label[for="${html.id}"]`))
            .map((x) => x.textContent ?? '')
            .join(' ')
        : '';

      return {
        id: html.id || '',
        name: html.getAttribute('name') || '',
        label: labelFromFor || ''
      };
    }).catch(() => ({ id: '', name: '', label: '' }));

    controls.push({
      kind: 'select',
      locator,
      key: stableKey(['select', meta.label, meta.id, meta.name]),
      label: meta.label,
      placeholder: ''
    });
  }

  const files = page.locator('input[type="file"]');
  const fileCount = await files.count().catch(() => 0);

  for (let i = 0; i < fileCount; i += 1) {
    const locator = files.nth(i);

    const meta = await locator.evaluate((el) => {
      const html = el as HTMLElement;
      const labelFromFor = html.id
        ? Array.from(document.querySelectorAll(`label[for="${html.id}"]`))
            .map((x) => x.textContent ?? '')
            .join(' ')
        : '';

      return {
        id: html.id || '',
        name: html.getAttribute('name') || '',
        label: labelFromFor || ''
      };
    }).catch(() => ({ id: '', name: '', label: '' }));

    controls.push({
      kind: 'file',
      locator,
      key: stableKey(['file', meta.label, meta.id, meta.name, String(i)]),
      label: meta.label,
      placeholder: ''
    });
  }

  return controls;
}

async function controlHasValue(control: VisibleControl): Promise<boolean> {
  try {
    if (control.kind === 'select') {
      const value = await control.locator.inputValue();
      return !!normalizeText(value);
    }

    if (control.kind === 'text' || control.kind === 'textarea') {
      const value = await control.locator.inputValue();
      return !!normalizeText(value);
    }

    if (control.kind === 'file') {
      const value = await control.locator.inputValue().catch(() => '');
      return !!normalizeText(value);
    }

    return false;
  } catch {
    return false;
  }
}

async function fillVisibleControl(
  page: Page,
  control: VisibleControl,
  bank: AnswerBank,
  logger: Logger,
  usedControlKeys: Set<string>
): Promise<boolean> {
  if (usedControlKeys.has(control.key)) return false;

  if (control.kind === 'text') {
    if (await controlHasValue(control)) {
      usedControlKeys.add(control.key);
      return true;
    }

    const value = resolveTextAnswer(control.label, control.placeholder, bank);
    await control.locator.click().catch(() => undefined);
    await control.locator.fill(value);
    logger.info('Visible text control filled', { key: control.key, value, label: control.label, placeholder: control.placeholder });
    usedControlKeys.add(control.key);
    return true;
  }

  if (control.kind === 'textarea') {
    if (await controlHasValue(control)) {
      usedControlKeys.add(control.key);
      return true;
    }

    const value = pullValue(bank.textarea, 'Автоматическое прохождение тестовой формы');
    await control.locator.click().catch(() => undefined);
    await control.locator.fill(value);
    logger.info('Visible textarea filled', { key: control.key, value });
    usedControlKeys.add(control.key);
    return true;
  }

  if (control.kind === 'select') {
    if (await controlHasValue(control)) {
      usedControlKeys.add(control.key);
      return true;
    }

    const chosen = await chooseSelectValue(control.locator, control.label, bank);
    logger.info('Visible select filled', { key: control.key, chosen, label: control.label });
    usedControlKeys.add(control.key);
    return true;
  }

  if (control.kind === 'file') {
    if (await controlHasValue(control)) {
      usedControlKeys.add(control.key);
      return true;
    }

    if (bank.file.length === 0) return false;

    const filePath = bank.file[0];
    await uploadFile(page, filePath, ['Файл', 'Загрузите файл', 'Прикрепить файл', 'Выберите файл', 'Upload']);
    logger.info('Visible file control filled', { key: control.key, filePath });
    usedControlKeys.add(control.key);
    return true;
  }

  return false;
}

export async function runForm(page: Page, input: SkillInput, logger: Logger) {
  const filledFields: string[] = [];
  const bank = makeAnswerBank(input.fields);
  const usedControlKeys = new Set<string>();
  let step = 0;

  logger.info('Opening URL', { url: input.url });

  await safeGoto(page, input, logger);
  await waitForTransition(page, input);
  await ensureStarted(page, input, logger);
  await waitForScenarioReady(page, input, logger);

  while (step < input.maxSteps) {
    step += 1;

    const state = await detectScreenState(page);
    if (state === 'complete') break;
    if (state !== 'form') {
      logger.warn('Unexpected screen state before filling', { state });
      await waitForScenarioReady(page, input, logger);
    }

    const controls = await extractVisibleControls(page);
    logger.info('Step controls', {
      step,
      controls: controls.map((c) => ({ key: c.key, kind: c.kind, label: c.label, placeholder: c.placeholder }))
    });

    let progress = 0;

    for (const control of controls) {
      const ok = await fillVisibleControl(page, control, bank, logger, usedControlKeys).catch((error) => {
        logger.warn('Control fill failed', {
          key: control.key,
          kind: control.kind,
          error: error instanceof Error ? error.message : String(error)
        });
        return false;
      });

      if (ok) {
        filledFields.push(control.key);
        progress += 1;
      }

      await page.waitForTimeout(120);
    }

    await saveScreenshot(page, input.outputDir, `step-${step}.png`).catch(() => undefined);

    const afterState = await detectScreenState(page);
    if (afterState === 'complete') break;

    if (progress === 0) {
  const remaining = controls.filter(c => !usedControlKeys.has(c.key));

  if (remaining.length === 0) {
    logger.info('All controls already filled; treating as completed');
    break;
  }

  logger.warn('No progress on step; stopping', {
    step,
    remaining: remaining.map(r => r.key)
  });

  break;
}

    const clickedNext = await clickNavigation(page, input.navigationTexts.next, logger);
    if (clickedNext) {
      await waitForTransition(page, input);
      await waitForScenarioReady(page, input, logger);
      continue;
    }

    const clickedSubmit = await clickNavigation(page, input.navigationTexts.submit, logger);
    if (clickedSubmit) {
      await waitForTransition(page, input);

      const stateAfterSubmit = await detectScreenState(page);
      if (stateAfterSubmit === 'complete') break;

      await waitForScenarioReady(page, input, logger);
      const postSubmitState = await detectScreenState(page);

      if (postSubmitState === 'complete') break;
      if (postSubmitState === 'form') {
  const controlsAfter = await extractVisibleControls(page);

  const allFilled = controlsAfter.every(c =>
    usedControlKeys.has(c.key)
  );

  if (allFilled) {
    logger.info('Form likely completed (no new controls after submit)');
    break;
  }

  logger.info('Submit click kept us in form state; continuing');
  continue;
}
    }

    logger.warn('No navigation button matched after successful progress', { step });
    break;
  }

  return {
    ok: filledFields.length > 0,
    finalUrl: page.url(),
    stepsCompleted: step,
    filledFields
  };
}