import { createBrowserSession } from '../core/browser/session.js';
import { skillInputSchema, type SkillInput, type SkillResult } from '../core/domain/contracts.js';
import { createLogger, type Logger } from '../core/observability/logger.js';
import { runForm } from '../core/workflow/formRunner.js';

export async function runSixmoSkill(input: SkillInput, logger?: Logger): Promise<SkillResult> {
  const resolvedInput = skillInputSchema.parse(input);
  const resolvedLogger = logger ?? createLogger(Boolean(resolvedInput.debug));
  const session = await createBrowserSession(resolvedInput, resolvedLogger);

  try {
    const result = await runForm(session.page, resolvedInput, resolvedLogger);

    return {
      ok: result.ok,
      finalUrl: result.finalUrl,
      stepsCompleted: result.stepsCompleted,
      filledFields: result.filledFields,
      artifacts: {
        screenshots: [],
        tracePath: `${resolvedInput.outputDir}/trace.zip`
      },
      warnings: []
    };
  } finally {
    resolvedLogger.info('Closing browser');
    await session.close();
  }
}