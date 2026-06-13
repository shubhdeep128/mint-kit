import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it, vi} from "vitest";
import {runMintCli} from "../src/cli.js";
import {scaffoldMintApp} from "../src/core/appScaffold.js";
import {upsertEnvFile} from "../src/core/envFile.js";
import {markProvider} from "../src/state/connectState.js";

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

  it("doctor recognizes a generated app as ready without pointing back to connect", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mint-doctor-"));
    const previousCwd = process.cwd();
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      await scaffoldMintApp({appRoot: projectRoot, appName: "dream-coach"});
      const appJsonPath = join(projectRoot, "app.json");
      const appJson = JSON.parse(await readFile(appJsonPath, "utf8")) as {expo: {extra?: Record<string, unknown>}};
      appJson.expo.extra = {eas: {projectId: "eas-project-id"}};
      await writeFile(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
      await upsertEnvFile(projectRoot, ".env.local", {
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable",
        EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_test",
        EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_test",
        EXPO_PUBLIC_POSTHOG_KEY: "phc_test",
      });
      await markProvider(projectRoot, "supabase", "connected");
      await markProvider(projectRoot, "revenuecat", "connected");
      await markProvider(projectRoot, "posthog", "connected");
      await markProvider(projectRoot, "expo", "connected", {projectId: "eas-project-id"});

      process.chdir(projectRoot);

      await runMintCli(["node", "mint", "doctor", "--json"]);

      const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
      const payload = JSON.parse(output);
      expect(payload.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({label: "Generated app shell", status: "ok"}),
          expect.objectContaining({label: "Provider resources", status: "ok"}),
          expect.objectContaining({label: "Formatting, linting, and tests", status: "ok"}),
        ]),
      );
      expect(payload.nextCommand).toContain("pnpm install");
      expect(output).not.toContain("mint connect");
    } finally {
      process.chdir(previousCwd);
      write.mockRestore();
      await rm(projectRoot, {recursive: true, force: true});
    }
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

  it("reports the exact RevenueCat credential needed", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mint-cli-"));
    const previousCwd = process.cwd();
    const previousKey = process.env.REVENUECAT_API_KEY;
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      delete process.env.REVENUECAT_API_KEY;

      await runMintCli(["node", "mint", "connect", "revenuecat", "--json"]);

      const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
      expect(JSON.parse(output)).toMatchObject({
        command: "connect",
        service: "revenuecat",
        result: {
          status: "needs_input",
          connected: false,
          missing: ["REVENUECAT_API_KEY"],
        },
      });
      expect(output).toContain("mint connect revenuecat");
    } finally {
      process.chdir(previousCwd);
      if (previousKey) {
        process.env.REVENUECAT_API_KEY = previousKey;
      } else {
        delete process.env.REVENUECAT_API_KEY;
      }
      write.mockRestore();
      await rm(projectRoot, {recursive: true, force: true});
    }
  });

  it("saves RevenueCat credentials without echoing the secret", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mint-cli-"));
    const previousCwd = process.cwd();
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      process.chdir(projectRoot);

      await runMintCli(["node", "mint", "connect", "revenuecat", "--api-key", "rc_secret_test", "--json"]);

      const output = write.mock.calls.map(([chunk]) => String(chunk)).join("");
      expect(JSON.parse(output)).toMatchObject({
        command: "connect",
        service: "revenuecat",
        result: {
          status: "connected",
          connected: true,
          variables: ["REVENUECAT_API_KEY"],
        },
      });
      expect(output).not.toContain("rc_secret_test");
      await expect(readFile(join(projectRoot, ".env.local"), "utf8")).resolves.toContain("REVENUECAT_API_KEY=rc_secret_test");
      await expect(readFile(join(projectRoot, ".mint/connect-state.json"), "utf8")).resolves.not.toContain("rc_secret_test");
    } finally {
      process.chdir(previousCwd);
      write.mockRestore();
      await rm(projectRoot, {recursive: true, force: true});
    }
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
