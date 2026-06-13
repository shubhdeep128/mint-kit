import type {CommandRunner} from "./commandRunner.js";

export type SupabaseCliMode = "direct" | "npx";

export type SupabaseConnectStatus = "needs_project_ref" | "ready_to_link" | "linked" | "failed";

export type SupabaseConnectResult = {
  provider: "supabase";
  status: SupabaseConnectStatus;
  connected: boolean;
  message: string;
  dashboardUrl: string;
  projectRef?: string | undefined;
  cli: {
    mode: SupabaseCliMode;
    available: boolean;
    version?: string | undefined;
    command: string;
    args: string[];
    display: string;
  };
  nextSteps: string[];
  error?: string | undefined;
};

export type SupabaseConnectInput = {
  projectRef?: string | undefined;
  dbPassword?: string | undefined;
  runner: CommandRunner;
  dryRun?: boolean | undefined;
};

const dashboardUrl = "https://supabase.com/dashboard";

export function buildSupabaseInvocation(mode: SupabaseCliMode, args: string[], displayArgs = args) {
  if (mode === "direct") {
    return {
      command: "supabase",
      args,
      display: `supabase ${displayArgs.join(" ")}`,
    };
  }

  return {
    command: "npx",
    args: ["--yes", "supabase", ...args],
    display: `npx --yes supabase ${displayArgs.join(" ")}`,
  };
}

export function buildLinkInvocation(mode: SupabaseCliMode, projectRef: string, dbPassword?: string | undefined) {
  const args = ["link", "--project-ref", projectRef];
  const displayArgs = [...args];

  if (dbPassword) {
    args.push("--password", dbPassword);
    displayArgs.push("--password", "********");
  }

  if (mode === "direct") {
    return {
      command: "supabase",
      args,
      display: `supabase ${displayArgs.join(" ")}`,
    };
  }

  return {
    command: "npx",
    args: ["--yes", "supabase", ...args],
    display: `npx --yes supabase ${displayArgs.join(" ")}`,
  };
}

export async function detectSupabaseCli(runner: CommandRunner) {
  const direct = await runner.run("supabase", ["--version"]);

  if (direct.exitCode === 0) {
    return {
      mode: "direct" as const,
      available: true,
      version: direct.stdout.trim() || undefined,
    };
  }

  const npx = await runner.run("npx", ["--version"]);

  return {
    mode: "npx" as const,
    available: npx.exitCode === 0,
    version: undefined,
  };
}

export async function connectSupabase(input: SupabaseConnectInput): Promise<SupabaseConnectResult> {
  const cli = await detectSupabaseCli(input.runner);
  const projectRef = input.projectRef?.trim();
  const invocation = projectRef
    ? buildLinkInvocation(cli.mode, projectRef, input.dbPassword)
    : buildLinkInvocation(cli.mode, "<project-ref>");

  const base = {
    provider: "supabase" as const,
    dashboardUrl,
    projectRef,
    cli: {
      ...cli,
      command: invocation.command,
      args: invocation.args,
      display: invocation.display,
    },
  };

  if (!cli.available) {
    return {
      ...base,
      status: "failed",
      connected: false,
      message: "Supabase CLI is not available directly and npx is not available as a fallback.",
      nextSteps: ["Install Node/npm or Supabase CLI", "Then run mint connect supabase --project-ref <project-ref>"],
      error: "Missing supabase CLI and npx fallback",
    };
  }

  if (!projectRef) {
    return {
      ...base,
      status: "needs_project_ref",
      connected: false,
      message: "No Supabase project was selected, so Mint has not linked or provisioned anything yet.",
      nextSteps: [
        "Run mint connect supabase --login",
        "Create and configure a project with mint connect supabase --create",
        "Or link an existing project with mint connect supabase --project-ref <project-ref>",
      ],
    };
  }

  if (input.dryRun) {
    return {
      ...base,
      status: "ready_to_link",
      connected: false,
      message: "Dry run only. Mint did not link Supabase or write connect state.",
      nextSteps: [`Would run: ${invocation.display}`],
    };
  }

  const result = await input.runner.run(invocation.command, invocation.args);

  if (result.exitCode !== 0) {
    return {
      ...base,
      status: "failed",
      connected: false,
      message: "Supabase link failed. Mint did not write connected state.",
      nextSteps: [
        "Run supabase login or npx --yes supabase login",
        `Retry: mint connect supabase --project-ref ${projectRef}`,
      ],
      error: result.stderr || result.stdout || "Supabase link failed",
    };
  }

  return {
    ...base,
    status: "linked",
    connected: true,
    message: "Supabase project linked successfully.",
    nextSteps: ["Run mint doctor", "Run mint connect revenuecat"],
  };
}
