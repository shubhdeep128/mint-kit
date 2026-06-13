import {mkdtemp, readFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {describe, expect, it} from "vitest";
import type {CommandRunner} from "../src/core/commandRunner.js";
import {connectSupabase, detectSupabaseCli, inspectSupabaseConnection} from "../src/core/supabaseConnect.js";
import {provisionSupabaseProject} from "../src/core/supabaseProvision.js";

function runner(responses: Record<string, {exitCode: number; stdout?: string; stderr?: string}>): CommandRunner {
  return {
    async run(command, args) {
      const key = `${command} ${args.join(" ")}`;
      const response = responses[key] ?? {exitCode: 1, stderr: `missing mock for ${key}`};

      return {
        exitCode: response.exitCode,
        stdout: response.stdout ?? "",
        stderr: response.stderr ?? "",
      };
    },
  };
}

function recordingRunner(responses: Record<string, {exitCode: number; stdout?: string; stderr?: string}>) {
  const calls: string[] = [];
  const commandRunner: CommandRunner = {
    async run(command, args) {
      const key = `${command} ${args.join(" ")}`;
      calls.push(key);
      const response = responses[key] ?? {exitCode: 1, stderr: `missing mock for ${key}`};

      return {
        exitCode: response.exitCode,
        stdout: response.stdout ?? "",
        stderr: response.stderr ?? "",
      };
    },
  };

  return {runner: commandRunner, calls};
}

describe("detectSupabaseCli", () => {
  it("uses direct supabase when available", async () => {
    const result = await detectSupabaseCli(
      runner({
        "supabase --version": {exitCode: 0, stdout: "2.106.0"},
      }),
    );

    expect(result).toMatchObject({mode: "direct", available: true, version: "2.106.0"});
  });

  it("falls back to npx when direct supabase is missing", async () => {
    const result = await detectSupabaseCli(
      runner({
        "supabase --version": {exitCode: 1},
        "npx --version": {exitCode: 0, stdout: "11.6.2"},
      }),
    );

    expect(result).toMatchObject({mode: "npx", available: true});
  });
});

describe("connectSupabase", () => {
  it("does not claim a connection without a project ref", async () => {
    const result = await connectSupabase({
      runner: runner({
        "supabase --version": {exitCode: 1},
        "npx --version": {exitCode: 0},
      }),
    });

    expect(result).toMatchObject({
      status: "needs_project_ref",
      connected: false,
    });
    expect(result.nextSteps.join("\n")).toContain("mint connect supabase --project-ref <project-ref>");
  });

  it("links with npx fallback when a project ref is provided", async () => {
    const result = await connectSupabase({
      projectRef: "abc123",
      runner: runner({
        "supabase --version": {exitCode: 1},
        "npx --version": {exitCode: 0},
        "npx --yes supabase link --project-ref abc123": {exitCode: 0, stdout: "Linked project"},
      }),
    });

    expect(result).toMatchObject({
      status: "linked",
      connected: true,
      cli: {
        display: "npx --yes supabase link --project-ref abc123",
      },
    });
  });

  it("does not mark connected when link fails", async () => {
    const result = await connectSupabase({
      projectRef: "abc123",
      runner: runner({
        "supabase --version": {exitCode: 0, stdout: "2.106.0"},
        "supabase link --project-ref abc123": {exitCode: 1, stderr: "not logged in"},
      }),
    });

    expect(result).toMatchObject({
      status: "failed",
      connected: false,
      error: "not logged in",
    });
  });
});

describe("inspectSupabaseConnection", () => {
  it("reports direct CLI missing, npx fallback available, and login missing", async () => {
    const result = await inspectSupabaseConnection(
      runner({
        "supabase --version": {exitCode: 1},
        "npx --version": {exitCode: 0, stdout: "11.6.2"},
        "npx --yes supabase orgs list --output-format json": {
          exitCode: 1,
          stdout: JSON.stringify({
            error: {
              message: "Access token not provided. Supply an access token by running `supabase login`.",
            },
          }),
        },
      }),
    );

    expect(result).toMatchObject({
      status: "needs_login",
      cli: {
        direct: {installed: false},
        npx: {available: true, version: "11.6.2"},
        selectedCommand: "npx --yes supabase",
      },
      account: {
        status: "not_authenticated",
      },
    });
  });

  it("reports authenticated accounts and organization count", async () => {
    const result = await inspectSupabaseConnection(
      runner({
        "supabase --version": {exitCode: 0, stdout: "2.106.0"},
        "npx --version": {exitCode: 0, stdout: "11.6.2"},
        "supabase orgs list --output-format json": {
          exitCode: 0,
          stdout: JSON.stringify([{id: "org-one", slug: "org-one", name: "One"}]),
        },
      }),
    );

    expect(result).toMatchObject({
      status: "ready",
      cli: {
        direct: {installed: true, version: "2.106.0"},
      },
      account: {
        status: "authenticated",
        organizations: [{name: "One", slug: "org-one"}],
      },
    });
  });
});

describe("provisionSupabaseProject", () => {
  it("does not create provider resources before the all-provider apply phase", async () => {
    const {runner: commandRunner, calls} = recordingRunner({
      "supabase --version": {exitCode: 0, stdout: "2.106.0"},
    });
    const result = await provisionSupabaseProject({
      projectRoot: "/tmp/dream-coach",
      projectName: "dream-coach",
      orgId: "cool-green-pqdr0qc",
      dbPassword: "super-secret-password",
      runner: commandRunner,
    });

    expect(result).toMatchObject({
      status: "blocked_until_all_configured",
      connected: false,
    });
    expect(result.warnings.join("\n")).toContain("No Supabase project was created");
    expect(calls.join("\n")).not.toContain("projects create");
  });

  it("shows a redacted create plan in dry-run mode", async () => {
    const result = await provisionSupabaseProject({
      projectRoot: "/tmp/dream-coach",
      projectName: "dream-coach",
      orgId: "cool-green-pqdr0qc",
      dbPassword: "super-secret-password",
      runner: runner({
        "supabase --version": {exitCode: 0, stdout: "2.106.0"},
      }),
      dryRun: true,
    });

    expect(result).toMatchObject({
      status: "ready_to_create",
      connected: false,
    });
    expect(result.commands.join("\n")).toContain("supabase projects create dream-coach");
    expect(result.commands.join("\n")).toContain("--db-password ********");
    expect(result.commands.join("\n")).not.toContain("super-secret-password");
  });

  it("requires explicit org selection when the account has multiple orgs", async () => {
    const result = await provisionSupabaseProject({
      projectRoot: "/tmp/dream-coach",
      projectName: "dream-coach",
      apply: true,
      allProvidersConfigured: true,
      runner: runner({
        "supabase --version": {exitCode: 0, stdout: "2.106.0"},
        "supabase orgs list --output-format json": {
          exitCode: 0,
          stdout: JSON.stringify([
            {id: "org-one", slug: "org-one", name: "One"},
            {id: "org-two", slug: "org-two", name: "Two"},
          ]),
        },
      }),
    });

    expect(result).toMatchObject({
      status: "needs_org_selection",
      connected: false,
      organizations: [
        {name: "One", slug: "org-one"},
        {name: "Two", slug: "org-two"},
      ],
    });
  });

  it("creates, links, fetches keys, and writes env files", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mint-supabase-"));
    const projectRef = "abcdefghijklmnopqrst";
    const result = await provisionSupabaseProject({
      projectRoot,
      projectName: "dream-coach",
      orgId: "cool-green-pqdr0qc",
      dbPassword: "test-password",
      serverEnvFile: "server/.env",
      apply: true,
      allProvidersConfigured: true,
      runner: runner({
        "supabase --version": {exitCode: 0, stdout: "2.106.0"},
        "supabase projects create dream-coach --org-id cool-green-pqdr0qc --db-password test-password --region us-east-1 --size nano --yes --output-format json": {
          exitCode: 0,
          stdout: JSON.stringify({
            ref: projectRef,
            name: "dream-coach",
            organization_slug: "cool-green-pqdr0qc",
            region: "us-east-1",
            status: "COMING_UP",
          }),
        },
        "supabase link --project-ref abcdefghijklmnopqrst --password test-password": {exitCode: 0, stdout: "Linked project"},
        "supabase projects api-keys --project-ref abcdefghijklmnopqrst --output-format json": {
          exitCode: 0,
          stdout: JSON.stringify([
            {type: "publishable", name: "publishable_key", api_key: "sb_publishable_123"},
            {type: "secret", name: "server_secret", api_key: "sb_secret_456"},
          ]),
        },
      }),
    });

    expect(result).toMatchObject({
      status: "provisioned",
      connected: true,
      project: {ref: projectRef},
    });

    const expoEnv = await readFile(join(projectRoot, ".env.local"), "utf8");
    expect(expoEnv).toContain("EXPO_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co");
    expect(expoEnv).toContain("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_123");
    expect(expoEnv).toContain("EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_123");

    const serverEnv = await readFile(join(projectRoot, "server/.env"), "utf8");
    expect(serverEnv).toContain("SUPABASE_SECRET_KEY=sb_secret_456");
    expect(JSON.stringify(result)).not.toContain("test-password");
    expect(JSON.stringify(result)).not.toContain("sb_secret_456");
  });

  it("rolls back a created project when later configuration fails", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mint-supabase-rollback-"));
    const projectRef = "abcdefghijklmnopqrst";
    const result = await provisionSupabaseProject({
      projectRoot,
      projectName: "dream-coach",
      orgId: "cool-green-pqdr0qc",
      dbPassword: "test-password",
      apply: true,
      allProvidersConfigured: true,
      runner: runner({
        "supabase --version": {exitCode: 0, stdout: "2.106.0"},
        "supabase projects create dream-coach --org-id cool-green-pqdr0qc --db-password test-password --region us-east-1 --size nano --yes --output-format json": {
          exitCode: 0,
          stdout: JSON.stringify({
            ref: projectRef,
            name: "dream-coach",
            organization_slug: "cool-green-pqdr0qc",
            region: "us-east-1",
            status: "COMING_UP",
          }),
        },
        "supabase link --project-ref abcdefghijklmnopqrst --password test-password": {exitCode: 0, stdout: "Linked project"},
        "supabase projects api-keys --project-ref abcdefghijklmnopqrst --output-format json": {
          exitCode: 1,
          stderr: "keys not ready",
        },
        "supabase projects delete abcdefghijklmnopqrst --yes --output-format json": {exitCode: 0, stdout: "{}"},
      }),
    });

    expect(result).toMatchObject({
      status: "failed",
      connected: false,
      cleanup: {
        attempted: true,
        success: true,
      },
    });
    expect(result.commands.join("\n")).toContain("supabase projects delete abcdefghijklmnopqrst --yes --output-format json");
  });
});
