import { createBrowserSession } from '../core/browser/session.js';
import type { SkillInput, SkillResult } from '../core/domain/contracts.js';
import { createLogger, type Logger } from '../core/observability/logger.js';
import { runForm } from '../core/workflow/formRunner.js';

export async function runSixmoSkill(input: SkillInput, logger?: Logger): Promise<SkillResult> {
  const resolvedLogger = logger ?? createLogger(Boolean(input.debug));
  const session = await createBrowserSession(input, resolvedLogger);

  try {
    const result = await runForm(session.page, input, resolvedLogger);

    return {
      ok: result.ok,
      finalUrl: result.finalUrl,
      stepsCompleted: result.stepsCompleted,
      filledFields: result.filledFields,
      artifacts: {
        screenshots: [],
        tracePath: `${input.outputDir}/trace.zip`
      },
      warnings: []
    };
  } finally {
    resolvedLogger.info('Closing browser');
    await session.close();
  }
}