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

  it("runs new in plain text dry-run mode", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli(["node", "mint", "new", "dream-coach", "--dry-run", "--plain"]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(output).toContain("Mint");
    expect(output).toContain("dream-coach");

    write.mockRestore();
  });

  it("runs doctor in json mode", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli(["node", "mint", "doctor", "--json"]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      command: "doctor",
      title: "Doctor",
    });

    write.mockRestore();
  });

  it("runs connect in json mode", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli(["node", "mint", "connect", "--json"]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      command: "connect",
      service: "all",
    });

    write.mockRestore();
  });

  it("explains that supabase is not connected without a project ref", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli(["node", "mint", "connect", "supabase", "--json"]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      command: "connect",
      service: "supabase",
      result: {
        status: "needs_project_ref",
        connected: false,
      },
    });

    write.mockRestore();
  });

  it("shows the supabase link command in dry-run mode", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli(["node", "mint", "connect", "supabase", "--project-ref", "abc123", "--dry-run", "--json"]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      command: "connect",
      service: "supabase",
      result: {
        status: "ready_to_link",
        connected: false,
        projectRef: "abc123",
      },
    });
    expect(output).toContain("supabase link --project-ref abc123");

    write.mockRestore();
  });
});
