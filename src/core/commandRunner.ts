import {execa} from "execa";

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommandRunOptions = {
  cwd?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
};

export type CommandRunner = {
  run(command: string, args: string[], options?: CommandRunOptions): Promise<CommandResult>;
};

export type InteractiveCommandRunner = {
  runInteractive(command: string, args: string[]): Promise<CommandResult>;
};

export const execaCommandRunner: CommandRunner = {
  async run(command, args, options) {
    try {
      const execaOptions = {
        reject: false,
        ...(options?.cwd ? {cwd: options.cwd} : {}),
        ...(options?.env ? {env: options.env} : {}),
      };
      const result = await execa(command, args, {
        ...execaOptions,
      });
      return {
        exitCode: result.exitCode ?? (result.failed ? 1 : 0),
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Unknown command failure",
      };
    }
  },
};

export const execaInteractiveCommandRunner: InteractiveCommandRunner = {
  async runInteractive(command, args) {
    try {
      const result = await execa(command, args, {reject: false, stdio: "inherit"});
      return {
        exitCode: result.exitCode ?? (result.failed ? 1 : 0),
        stdout: "",
        stderr: "",
      };
    } catch (error) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Unknown command failure",
      };
    }
  },
};
