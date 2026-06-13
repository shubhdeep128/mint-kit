import {describe, expect, it} from "vitest";
import type {CommandRunner} from "../src/core/commandRunner.js";
import {connectSupabase, detectSupabaseCli} from "../src/core/supabaseConnect.js";

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
