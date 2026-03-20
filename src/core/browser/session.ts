import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { SkillInput } from '../domain/contracts.js';
import type { Logger } from '../observability/logger.js';

export type BrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
};

async function ensureOutputDir(dir: string): Promise<void> {
  await fs.mkdir(path.resolve(dir), { recursive: true });
}

async function launchBrowser(input: SkillInput, logger: Logger): Promise<Browser> {
  const channels: Array<'msedge' | 'chrome' | undefined> = ['msedge', 'chrome', undefined];
  let lastError: unknown;

  for (const channel of channels) {
    try {
      logger.info('Trying browser launch', {
        channel: channel ?? 'bundled-chromium',
        headless: input.headless,
        slowMoMs: input.slowMoMs
      });

      return await chromium.launch({
        channel,
        headless: input.headless,
        slowMo: input.slowMoMs,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-default-browser-check',
          '--disable-dev-shm-usage',
          '--disable-features=IsolateOrigins,site-per-process',
          '--start-maximized'
        ]
      });
    } catch (error) {
      lastError = error;
      logger.warn('Browser launch attempt failed', {
        channel: channel ?? 'bundled-chromium',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function applyStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['ru-RU', 'ru', 'en-US', 'en']
    });

    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });

    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32'
    });

    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8
    });

    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8
    });

    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = ((parameters: PermissionDescriptor) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({
            state: Notification.permission
          } as PermissionStatus);
        }
        return originalQuery(parameters);
      }) as typeof window.navigator.permissions.query;
    }

    if (!(window as Window & { chrome?: { runtime: Record<string, never> } }).chrome) {
      (window as Window & { chrome?: { runtime: Record<string, never> } }).chrome = {
        runtime: {}
      };
    }

    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return originalGetParameter.call(this, parameter);
    };
  });
}

export async function createBrowserSession(input: SkillInput, logger: Logger): Promise<BrowserSession> {
  logger.info('Launching browser', {
    headless: input.headless,
    slowMoMs: input.slowMoMs,
    locale: input.locale
  });

  await ensureOutputDir(input.outputDir);

  const browser = await launchBrowser(input, logger);

  const context = await browser.newContext({
    locale: input.locale,
    ignoreHTTPSErrors: true,
    viewport: null,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
  });

  await applyStealth(context);

  await context.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
  });

  let tracingStartedBySession = false;

  try {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true
    });
    tracingStartedBySession = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes('Tracing has been already started')) {
      throw error;
    }

    logger.debug('Tracing already started, skipping manual tracing');
  }

  const page = await context.newPage();

  page.on('console', (msg) => {
    logger.debug('Browser console', {
      type: msg.type(),
      text: msg.text()
    });
  });

  page.on('pageerror', (error) => {
    logger.warn('Page error', {
      message: error.message
    });
  });

  page.on('requestfailed', (request) => {
    logger.warn('Network request failed', {
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? 'unknown'
    });
  });

  return {
    browser,
    context,
    page,
    close: async () => {
      try {
        if (tracingStartedBySession) {
          try {
            await context.tracing.stop({ path: path.resolve(input.outputDir, 'trace.zip') });
          } catch (error) {
            logger.warn('Failed to stop tracing', {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      } finally {
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      }
    }
  };
}