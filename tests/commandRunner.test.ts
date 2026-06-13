import {describe, expect, it} from "vitest";
import {execaCommandRunner} from "../src/core/commandRunner.js";

describe("execaCommandRunner", () => {
  it("marks missing commands as failures", async () => {
    const result = await execaCommandRunner.run("__mint_missing_binary__", ["--version"]);

    expect(result.exitCode).not.toBe(0);
  });
});
