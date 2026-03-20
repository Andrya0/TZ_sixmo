import fs from 'node:fs/promises';
import path from 'node:path';
import { runSixmoSkill } from './app/sixmoSkill.js';

type Logger = {
  debug: (msg: string, data?: any) => void;
  info: (msg: string, data?: any) => void;
  warn: (msg: string, data?: any) => void;
  error: (msg: string, data?: any) => void;
};

function createLogger(): Logger {
  const log = (level: string, msg: string, data?: any) => {
    const ts = new Date().toISOString();
    if (data !== undefined) {
      console.log(`[sixmo][${ts}][${level}] ${msg}`, JSON.stringify(data));
    } else {
      console.log(`[sixmo][${ts}][${level}] ${msg}`);
    }
  };

  return {
    debug: (msg, data) => log('DEBUG', msg, data),
    info: (msg, data) => log('INFO', msg, data),
    warn: (msg, data) => log('WARN', msg, data),
    error: (msg, data) => log('ERROR', msg, data)
  };
}

function getArg(name: string): string | null {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  const inputPath = getArg('--input');

  if (!inputPath) {
    console.error('Usage: node dist/index.js --input <path>');
    process.exit(1);
  }

  const resolved = path.resolve(inputPath);

  console.log(`[sixmo] Reading input: ${resolved}`);

  const raw = JSON.parse(await fs.readFile(resolved, 'utf-8'));

  const logger = createLogger();

  try {
    const result = await runSixmoSkill(raw, logger);

    console.log('[sixmo] Final result:');
    console.log(JSON.stringify(result, null, 2));

    process.exit(result.ok ? 0 : 2);
  } catch (error) {
    console.error('[sixmo] Fatal error:', error);
    process.exit(1);
  }
}

main();