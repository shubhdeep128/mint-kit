import type {CommandRunner} from "./commandRunner.js";
import type {LocalCheckKey, ProviderCheck} from "./flowModel.js";

type BinaryCheck = {
  binary: LocalCheckKey;
  label: string;
  repairCommand: string;
};

const binaryChecks: BinaryCheck[] = [
  {binary: "node", label: "Node.js", repairCommand: "Install Node.js 22 or newer"},
  {binary: "pnpm", label: "pnpm", repairCommand: "corepack enable && corepack prepare pnpm@latest --activate"},
  {binary: "git", label: "git", repairCommand: "Install git"},
];

export async function detectBinary(binary: string, runner: CommandRunner): Promise<boolean> {
  const result = await runner.run(binary, ["--version"]);
  return result.exitCode === 0;
}

export async function runLocalPreflight(runner: CommandRunner): Promise<ProviderCheck[]> {
  return Promise.all(
    binaryChecks.map(async check => {
      const found = await detectBinary(check.binary, runner);
      return {
        key: check.binary,
        label: check.label,
        status: found ? "ok" : "missing",
        detail: found ? "Available" : "Required before app creation",
        repairCommand: found ? undefined : check.repairCommand,
      } satisfies ProviderCheck;
    }),
  );
}
