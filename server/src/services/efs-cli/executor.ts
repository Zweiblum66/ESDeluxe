import { execFile } from 'child_process';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

interface ExecOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Executes an EFS CLI command using child_process.execFile.
 * Returns the stdout output as a string.
 *
 * @param command - The command binary to execute
 * @param args - Array of arguments to pass
 * @param options - Optional timeout, cwd, env overrides
 * @returns The stdout output from the command
 * @throws AppError on non-zero exit, timeout, or stderr-only output
 */
export function execEfsCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {},
): Promise<string> {
  const { timeout = DEFAULT_TIMEOUT_MS, cwd, env } = options;

  return new Promise((resolve, reject) => {
    logger.debug({ command, args }, `Executing EFS command: ${command} ${args.join(' ')}`);

    execFile(
      command,
      args,
      {
        timeout,
        cwd,
        env: env ?? process.env,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = stderr?.trim() || error.message;
          logger.error(
            { command, args, exitCode: error.code, stderr: message },
            `EFS command failed: ${command} ${args.join(' ')}`,
          );

          if (error.killed) {
            reject(
              new AppError(
                `EFS command timed out after ${timeout}ms: ${command}`,
                504,
                'EFS_TIMEOUT',
              ),
            );
          } else {
            reject(
              new AppError(
                `EFS command failed: ${message}`,
                500,
                'EFS_COMMAND_ERROR',
                { command, args, exitCode: error.code, stderr: message },
              ),
            );
          }
          return;
        }

        if (stderr?.trim()) {
          logger.warn({ command, stderr: stderr.trim() }, 'EFS command produced stderr output');
        }

        resolve(stdout);
      },
    );
  });
}
