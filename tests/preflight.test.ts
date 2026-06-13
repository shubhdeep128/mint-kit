import {describe, expect, it} from "vitest";
import type {CommandRunner} from "../src/core/commandRunner.js";
import {detectBinary, runLocalPreflight} from "../src/core/preflight.js";

function runnerWith(found: Set<string>): CommandRunner {
  return {
    async run(command) {
      return {
        exitCode: found.has(command) ? 0 : 1,
        stdout: found.has(command) ? `${command} version` : "",
        stderr: found.has(command) ? "" : "missing",
      };
    },
  };
}

describe("preflight", () => {
  it("detects available binaries", async () => {
    await expect(detectBinary("pnpm", runnerWith(new Set(["pnpm"])))).resolves.toBe(true);
  });

  it("marks missing binaries with repair commands", async () => {
    const checks = await runLocalPreflight(runnerWith(new Set(["node", "git"])));
    const pnpm = checks.find(check => check.label === "pnpm");

    expect(pnpm).toMatchObject({
      status: "missing",
      repairCommand: "corepack enable && corepack prepare pnpm@latest --activate",
    });
  });
});
