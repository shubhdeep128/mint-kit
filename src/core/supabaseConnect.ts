import type {CommandRunner} from "./commandRunner.js";

export type SupabaseCliMode = "direct" | "npx";

export type SupabaseConnectStatus = "needs_project_ref" | "ready_to_link" | "linked" | "failed";
export type SupabaseAccountStatus = "authenticated" | "not_authenticated" | "unknown" | "not_checked";
export type SupabaseDiagnosticsStatus = "ready" | "needs_login" | "missing_cli" | "unknown";

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

export type SupabaseOrganizationSummary = {
  id?: string | undefined;
  slug?: string | undefined;
  name: string;
};

export type SupabaseDiagnosticsResult = {
  provider: "supabase";
  status: SupabaseDiagnosticsStatus;
  message: string;
  dashboardUrl: string;
  cli: {
    mode: SupabaseCliMode;
    available: boolean;
    direct: {
      installed: boolean;
      version?: string | undefined;
    };
    npx: {
      available: boolean;
      version?: string | undefined;
    };
    selectedCommand: string;
  };
  account: {
    status: SupabaseAccountStatus;
    detail?: string | undefined;
    organizations?: SupabaseOrganizationSummary[] | undefined;
  };
  commands: {
    status?: string | undefined;
    login: string;
    create: string;
    linkExisting: string;
  };
  nextSteps: string[];
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
  const npx = await runner.run("npx", ["--version"]);
  const npxVersion = npx.stdout.trim() || undefined;

  if (direct.exitCode === 0) {
    return {
      mode: "direct" as const,
      available: true,
      version: direct.stdout.trim() || undefined,
      direct: {
        installed: true,
        version: direct.stdout.trim() || undefined,
      },
      npx: {
        available: npx.exitCode === 0,
        version: npxVersion,
      },
    };
  }

  return {
    mode: "npx" as const,
    available: npx.exitCode === 0,
    version: undefined,
    direct: {
      installed: false,
      version: undefined,
    },
    npx: {
      available: npx.exitCode === 0,
      version: npxVersion,
    },
  };
}

function parseJsonOutput(stdout: string): unknown | undefined {
  if (!stdout.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

function extractSupabaseError(stdout: string, stderr: string): string | undefined {
  const parsed = parseJsonOutput(stdout) ?? parseJsonOutput(stderr);

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const error = record.error;

    if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
      return (error as Record<string, string>).message;
    }

    if (typeof record.message === "string") {
      return record.message;
    }
  }

  return stderr.trim() || stdout.trim() || undefined;
}

function normalizeOrganization(value: unknown): SupabaseOrganizationSummary | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const item = value as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name : undefined;
  const id = typeof item.id === "string" ? item.id : undefined;
  const slug = typeof item.slug === "string" ? item.slug : typeof item.organization_slug === "string" ? item.organization_slug : undefined;

  if (!name && !id && !slug) {
    return undefined;
  }

  return {
    name: name ?? slug ?? id ?? "Supabase organization",
    id,
    slug,
  };
}

function normalizeOrganizations(value: unknown): SupabaseOrganizationSummary[] {
  const source =
    Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as {organizations?: unknown[]}).organizations)
      ? (value as {organizations: unknown[]}).organizations
      : [];

  return source.map(normalizeOrganization).filter((item): item is SupabaseOrganizationSummary => Boolean(item));
}

function isAuthMissing(message: string | undefined): boolean {
  return Boolean(message && /access token|auth|required|login|unauthorized|SUPABASE_ACCESS_TOKEN/i.test(message));
}

export async function inspectSupabaseConnection(runner: CommandRunner): Promise<SupabaseDiagnosticsResult> {
  const cli = await detectSupabaseCli(runner);
  const loginCommand = buildSupabaseInvocation(cli.mode, ["login"]).display;
  const base = {
    provider: "supabase" as const,
    dashboardUrl,
    cli: {
      mode: cli.mode,
      available: cli.available,
      direct: cli.direct,
      npx: cli.npx,
      selectedCommand: cli.mode === "direct" ? "supabase" : "npx --yes supabase",
    },
    commands: {
      login: loginCommand,
      create: "mint connect supabase --create",
      linkExisting: "mint connect supabase --project-ref <project-ref>",
    },
  };

  if (!cli.available) {
    return {
      ...base,
      status: "missing_cli",
      message: "Mint could not find the Supabase CLI or an npx fallback.",
      account: {
        status: "not_checked",
      },
      nextSteps: ["Install Node/npm or Supabase CLI", "Run mint connect supabase again"],
    };
  }

  const statusInvocation = buildSupabaseInvocation(cli.mode, ["orgs", "list", "--output-format", "json"]);
  const status = await runner.run(statusInvocation.command, statusInvocation.args);
  const detail = extractSupabaseError(status.stdout, status.stderr);

  if (status.exitCode === 0) {
    const organizations = normalizeOrganizations(parseJsonOutput(status.stdout));

    return {
      ...base,
      status: "ready",
      message: "Supabase CLI is available and your account login is active.",
      account: {
        status: "authenticated",
        organizations,
      },
      commands: {
        ...base.commands,
        status: statusInvocation.display,
      },
      nextSteps: ["Create and configure a project with mint connect supabase --create"],
    };
  }

  if (isAuthMissing(detail)) {
    return {
      ...base,
      status: "needs_login",
      message: "Supabase CLI is available, but Mint does not see an active Supabase login.",
      account: {
        status: "not_authenticated",
        detail,
      },
      commands: {
        ...base.commands,
        status: statusInvocation.display,
      },
      nextSteps: ["Run mint connect supabase --login", "Then run mint connect supabase --create"],
    };
  }

  return {
    ...base,
    status: "unknown",
    message: "Mint could not determine your Supabase account login state.",
    account: {
      status: "unknown",
      detail,
    },
    commands: {
      ...base.commands,
      status: statusInvocation.display,
    },
    nextSteps: ["Run mint connect supabase --login", "Retry mint connect supabase"],
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
