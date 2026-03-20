import { z } from 'zod';

export const fieldTypeSchema = z.enum([
  'text',
  'textarea',
  'email',
  'tel',
  'number',
  'select',
  'radio',
  'checkbox',
  'file',
  'date'
]);

export const fieldInputSchema = z.object({
  key: z.string(),
  type: fieldTypeSchema.default('text'),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  step: z.number().int().positive().optional(),
  required: z.boolean().default(true),
  aliases: z.array(z.string()).default([]),
  selectors: z.array(z.string()).default([]),
  description: z.string().optional()
});

export const skillInputSchema = z.object({
  url: z.string().url().default('https://sixmo.ru/'),
  headless: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(90000),
  transitionTimeoutMs: z.number().int().positive().default(5000),
  initialSettlingMs: z.number().int().min(0).default(1200),
  maxSteps: z.number().int().positive().default(12),
  slowMoMs: z.number().int().min(0).default(0),
  locale: z.string().default('ru-RU'),
  takeScreenshots: z.boolean().default(true),
  outputDir: z.string().default('./artifacts'),
  submit: z.boolean().default(true),
  debug: z.boolean().default(true),
  dumpConsole: z.boolean().default(true),
  dumpNetworkFailures: z.boolean().default(true),
  dumpOnError: z.boolean().default(true),
  fields: z.array(fieldInputSchema).min(1),
  successTexts: z.array(z.string()).default([
    'спасибо',
    'успешно',
    'результат',
    'готово',
    'thank you',
    'success'
  ]),
  navigationTexts: z.object({
    next: z.array(z.string()).default(['далее', 'продолжить', 'next', 'continue']),
    back: z.array(z.string()).default(['назад', 'back']),
    submit: z.array(z.string()).default(['отправить', 'завершить', 'submit', 'finish', 'получить результат'])
  }).default({})
});

export type SkillInput = z.infer<typeof skillInputSchema>;
export type FieldInput = z.infer<typeof fieldInputSchema>;

export type RunArtifact = {
  screenshots: string[];
  tracePath?: string;
  htmlDumpPath?: string;
  metadataPath?: string;
  errorScreenshotPath?: string;
  errorHtmlPath?: string;
};

export type SkillResult = {
  ok: boolean;
  finalUrl: string;
  stepsCompleted: number;
  filledFields: string[];
  resultText?: string;
  artifacts: RunArtifact;
  warnings: string[];
};
