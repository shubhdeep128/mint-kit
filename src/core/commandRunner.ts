import {execa} from "execa";

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = {
  run(command: string, args: string[]): Promise<CommandResult>;
};

export type InteractiveCommandRunner = {
  runInteractive(command: string, args: string[]): Promise<CommandResult>;
};

export const execaCommandRunner: CommandRunner = {
  async run(command, args) {
    try {
      const result = await execa(command, args, {reject: false});
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
