import {describe, expect, it, vi} from "vitest";
import {runMintCli} from "../src/cli.js";

describe("mint cli", () => {
  it("runs new in json dry-run mode", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli(["node", "mint", "new", "dream-coach", "--json", "--dry-run"]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      command: "new",
      appName: "dream-coach",
    });

    write.mockRestore();
  });
});
