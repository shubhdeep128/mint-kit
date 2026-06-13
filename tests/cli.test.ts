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
    expect(output).toContain("Validate every provider");
    expect(output).toContain("Apply resources together");
    expect(output).not.toContain("Next: mint connect");

    write.mockRestore();
  });

  it("supports creating without the integrated connect flow", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli(["node", "mint", "new", "dream-coach", "--dry-run", "--plain", "--no-connect"]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(output).toContain("Leave services repairable");
    expect(output).toContain("Next: mint connect");

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

  it("shows supabase diagnostics without starting project linking", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli(["node", "mint", "connect", "supabase", "--json"]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    const payload = JSON.parse(output);
    expect(payload).toMatchObject({
      command: "connect",
      service: "supabase",
      result: {
        provider: "supabase",
        cli: {
          selectedCommand: expect.any(String),
        },
        account: {
          status: expect.any(String),
        },
      },
    });
    expect(output).toContain("mint connect supabase --create");

    write.mockRestore();
  });

  it("does not start interactive supabase login in json mode", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli(["node", "mint", "connect", "supabase", "--login", "--json"]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      command: "connect",
      service: "supabase",
      result: {
        status: "ready_to_login",
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

  it("blocks supabase creation until every provider is configured", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runMintCli([
      "node",
      "mint",
      "connect",
      "supabase",
      "--create",
      "--project-name",
      "dream-coach",
      "--org-id",
      "cool-green-pqdr0qc",
      "--db-password",
      "super-secret-password",
      "--json",
    ]);

    const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(JSON.parse(output)).toMatchObject({
      command: "connect",
      service: "supabase",
      result: {
        status: "blocked_until_all_configured",
        connected: false,
      },
    });
    expect(output).toContain("supabase projects create dream-coach");
    expect(output).toContain("--db-password ********");
    expect(output).not.toContain("super-secret-password");
    expect(output).toContain("No Supabase project was created");

    write.mockRestore();
  });
});
