import type { Page } from 'playwright';
import type { FieldInput } from '../domain/contracts.js';
import { findBestLocator } from '../selectors/semanticLocator.js';

export async function detectCurrentStep(page: Page, fields: FieldInput[]): Promise<number> {
  const stepMap = new Map<number, number>();

  for (const field of fields) {
    if (!field.step) continue;

    const locator = await findBestLocator(page, field, {
      strictInteractive: true,
      allowTextFallback: false
    });

    if (locator) {
      stepMap.set(field.step, (stepMap.get(field.step) ?? 0) + 1);
    }
  }

  const sorted = [...stepMap.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) return sorted[0][0];

  return 1;
}