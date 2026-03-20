import path from 'node:path';
import { test, expect } from '@playwright/test';
import { runSixmoSkill } from '../src/app/sixmoSkill';

test('skill returns structured response', async () => {
  const result = await runSixmoSkill({
    url: 'https://sixmo.ru/',
    headless: true,
    outputDir: './artifacts/test-smoke',
    fields: [
      {
        key: 'Имя',
        type: 'text',
        value: 'Smoke Test',
        step: 1,
        aliases: ['Ваше имя', 'ФИО']
      },
      {
        key: 'Файл',
        type: 'file',
        value: path.resolve('./tests/fixtures/sample-upload.txt'),
        step: 2,
        aliases: ['Загрузите файл', 'Upload']
      }
    ]
  });

  expect(typeof result.ok).toBe('boolean');
  expect(result.artifacts.tracePath).toContain('trace.zip');
});
