import { createBrowserSession } from '../core/browser/session.js';
import type { SkillInput, SkillResult } from '../core/domain/contracts.js';
import { runForm } from '../core/workflow/formRunner.js';

type Logger = {
  debug: (msg: string, data?: any) => void;
  info: (msg: string, data?: any) => void;
  warn: (msg: string, data?: any) => void;
  error: (msg: string, data?: any) => void;
};

export async function runSixmoSkill(input: SkillInput, logger: Logger): Promise<SkillResult> {
  const session = await createBrowserSession(input, logger);

  try {
    const result = await runForm(session.page, input, logger);

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
    logger.info('Closing browser');
    await session.close();
  }
}