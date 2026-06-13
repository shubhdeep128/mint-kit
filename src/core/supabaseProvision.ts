import {randomBytes} from "node:crypto";
import {basename} from "node:path";
import type {CommandRunner} from "./commandRunner.js";
import {type EnvWriteResult, upsertEnvFile} from "./envFile.js";
import {
  buildLinkInvocation,
  buildSupabaseInvocation,
  connectSupabase,
  detectSupabaseCli,
  type SupabaseCliMode,
} from "./supabaseConnect.js";

export type SupabaseProvisionStatus =
  | "needs_login"
  | "needs_org_selection"
  | "ready_to_create"
  | "blocked_until_all_configured"
  | "provisioned"
  | "partial"
  | "failed";

export type SupabaseOrganization = {
  id?: string | undefined;
  slug?: string | undefined;
  name: string;
};

export type SupabaseProject = {
  ref: string;
  name?: string | undefined;
  organizationSlug?: string | undefined;
  region?: string | undefined;
  status?: string | undefined;
};

export type SupabaseProvisionResult = {
  provider: "supabase";
  status: SupabaseProvisionStatus;
  connected: boolean;
  message: string;
  dashboardUrl: string;
  project?: SupabaseProject | undefined;
  organization?: SupabaseOrganization | undefined;
  organizations?: SupabaseOrganization[] | undefined;
  cli: {
    mode: SupabaseCliMode;
    available: boolean;
    version?: string | undefined;
  };
  commands: string[];
  env: {
    expo?: EnvWriteResult | undefined;
    server?: EnvWriteResult | undefined;
    variables: string[];
  };
  nextSteps: string[];
  warnings: string[];
  cleanup?: {
    attempted: boolean;
    commands: string[];
    success?: boolean | undefined;
    error?: string | undefined;
  } | undefined;
  error?: string | undefined;
};

export type SupabaseProvisionInput = {
  projectRoot: string;
  runner: CommandRunner;
  projectName?: string | undefined;
  orgId?: string | undefined;
  dbPassword?: string | undefined;
  region?: string | undefined;
  size?: string | undefined;
  envFile?: string | undefined;
  serverEnvFile?: string | undefined;
  dryRun?: boolean | undefined;
  link?: boolean | undefined;
  apply?: boolean | undefined;
  allProvidersConfigured?: boolean | undefined;
  cleanupOnFailure?: boolean | undefined;
  onProgress?: ((progress: SupabaseProvisionProgress) => void) | undefined;
};

export type SupabaseProvisionProgress = {
  label: string;
  detail?: string | undefined;
};

type SupabaseCliDetection = Awaited<ReturnType<typeof detectSupabaseCli>>;

type SupabaseApiKey = {
  api_key?: string | null | undefined;
  apiKey?: string | null | undefined;
  key?: string | null | undefined;
  type?: string | null | undefined;
  name?: string | null | undefined;
};

const dashboardUrl = "https://supabase.com/dashboard";
const defaultRegion = "us-east-1";
const defaultSize = "nano";

function reportProgress(input: SupabaseProvisionInput, label: string, detail?: string): void {
  input.onProgress?.({label, detail});
}

function generatedDatabasePassword(): string {
  return `${randomBytes(24).toString("base64url")}aA1!`;
}

function projectNameFromRoot(projectRoot: string): string {
  return basename(projectRoot).replace(/[^A-Za-z0-9_-]+/g, "-") || "mint-app";
}

function withJsonOutput(args: string[]): string[] {
  return [...args, "--output-format", "json"];
}

function createBase(cli: SupabaseCliDetection): Omit<SupabaseProvisionResult, "status" | "connected" | "message"> {
  return {
    provider: "supabase",
    dashboardUrl,
    cli,
    commands: [],
    env: {
      variables: [],
    },
    nextSteps: [],
    warnings: [],
  };
}

function parseJsonOutput(stdout: string): unknown | undefined {
  if (!stdout.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(stdout);
  } catch {
    const jsonLine = stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line.startsWith("{") || line.startsWith("["));

    if (!jsonLine) {
      return undefined;
    }

    try {
      return JSON.parse(jsonLine);
    } catch {
      return undefined;
    }
  }
}

function normalizeOrganization(value: unknown): SupabaseOrganization | undefined {
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

function normalizeOrganizations(value: unknown): SupabaseOrganization[] {
  const source =
    Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as {organizations?: unknown[]}).organizations)
      ? (value as {organizations: unknown[]}).organizations
      : [];

  return source.map(normalizeOrganization).filter((item): item is SupabaseOrganization => Boolean(item));
}

function normalizeProject(value: unknown): SupabaseProject | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const item = value as Record<string, unknown>;
  const ref = typeof item.ref === "string" ? item.ref : typeof item.id === "string" ? item.id : undefined;

  if (!ref) {
    return undefined;
  }

  return {
    ref,
    name: typeof item.name === "string" ? item.name : undefined,
    organizationSlug: typeof item.organization_slug === "string" ? item.organization_slug : undefined,
    region: typeof item.region === "string" ? item.region : undefined,
    status: typeof item.status === "string" ? item.status : undefined,
  };
}

function extractProject(stdout: string): SupabaseProject | undefined {
  const parsed = parseJsonOutput(stdout);
  const project = normalizeProject(parsed);

  if (project) {
    return project;
  }

  const nestedProject =
    parsed && typeof parsed === "object" && "project" in parsed ? normalizeProject((parsed as {project?: unknown}).project) : undefined;

  if (nestedProject) {
    return nestedProject;
  }

  const ref = /\b[a-z]{20}\b/.exec(stdout)?.[0];
  return ref ? {ref} : undefined;
}

function commandText(mode: SupabaseCliMode, args: string[], displayArgs = args): string {
  return buildSupabaseInvocation(mode, args, displayArgs).display;
}

function orgFlagValue(org: SupabaseOrganization | string): string {
  if (typeof org === "string") {
    return org;
  }

  return org.slug ?? org.id ?? org.name;
}

async function listOrganizations(runner: CommandRunner, mode: SupabaseCliMode) {
  const invocation = buildSupabaseInvocation(mode, withJsonOutput(["orgs", "list"]));
  const result = await runner.run(invocation.command, invocation.args);

  return {
    invocation,
    result,
    organizations: result.exitCode === 0 ? normalizeOrganizations(parseJsonOutput(result.stdout)) : [],
  };
}

function isLoginError(output: string): boolean {
  return /login|access token|not authenticated|unauthorized/i.test(output);
}

function extractApiKeys(stdout: string) {
  const parsed = parseJsonOutput(stdout);
  const keys = (Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as {keys?: unknown[]}).keys) ? (parsed as {keys: unknown[]}).keys : []) as SupabaseApiKey[];
  let publishableKey: string | undefined;
  let secretKey: string | undefined;
  let serviceRoleKey: string | undefined;

  for (const key of keys) {
    const value = key.api_key ?? key.apiKey ?? key.key ?? undefined;
    const type = key.type?.toLowerCase() ?? "";
    const name = key.name?.toLowerCase() ?? "";

    if (!value) {
      continue;
    }

    if (!publishableKey && (type === "publishable" || type === "legacy" || name.includes("anon") || name.includes("publishable"))) {
      publishableKey = value;
    }

    if (!secretKey && (type === "secret" || name.includes("secret"))) {
      secretKey = value;
    }

    if (!serviceRoleKey && name.includes("service_role")) {
      serviceRoleKey = value;
    }
  }

  return {
    publishableKey,
    secretKey,
    serviceRoleKey,
  };
}

function projectUrl(ref: string): string {
  return `https://${ref}.supabase.co`;
}

async function fetchApiKeys(runner: CommandRunner, mode: SupabaseCliMode, projectRef: string) {
  const invocation = buildSupabaseInvocation(mode, withJsonOutput(["projects", "api-keys", "--project-ref", projectRef]));
  const result = await runner.run(invocation.command, invocation.args);

  return {
    invocation,
    result,
    keys: result.exitCode === 0 ? extractApiKeys(result.stdout) : undefined,
  };
}

async function cleanupSupabaseProject(runner: CommandRunner, mode: SupabaseCliMode, projectRef: string) {
  const invocation = buildSupabaseInvocation(mode, ["projects", "delete", projectRef, "--yes", "--output-format", "json"]);
  const result = await runner.run(invocation.command, invocation.args);

  return {
    attempted: true,
    commands: [invocation.display],
    success: result.exitCode === 0,
    error: result.exitCode === 0 ? undefined : result.stderr || result.stdout || "Supabase project cleanup failed",
  };
}

export async function provisionSupabaseProject(input: SupabaseProvisionInput): Promise<SupabaseProvisionResult> {
  reportProgress(input, "Checking Supabase CLI", "Detecting direct CLI or npx fallback.");
  const cli = await detectSupabaseCli(input.runner);
  const base = createBase(cli);
  const projectName = input.projectName?.trim() || projectNameFromRoot(input.projectRoot);
  const region = input.region?.trim() || defaultRegion;
  const size = input.size?.trim() || defaultSize;
  const shouldLink = input.link !== false;
  const shouldCleanup = input.cleanupOnFailure !== false;
  const dbPassword = input.dbPassword || generatedDatabasePassword();
  const envFile = input.envFile ?? ".env.local";

  if (!cli.available) {
    return {
      ...base,
      status: "failed",
      connected: false,
      message: "Supabase CLI is not available directly and npx is not available as a fallback.",
      nextSteps: ["Install Node/npm or Supabase CLI", "Then run mint connect supabase --create"],
      error: "Missing supabase CLI and npx fallback",
    };
  }

  reportProgress(input, "Planning Supabase project", `Project ${projectName} in ${region} (${size}).`);
  const plannedOrg = input.orgId?.trim() || "<selected-org>";
  const createArgs = [
    "projects",
    "create",
    projectName,
    "--org-id",
    plannedOrg,
    "--db-password",
    dbPassword,
    "--region",
    region,
    "--size",
    size,
    "--yes",
    "--output-format",
    "json",
  ];
  const createDisplayArgs = createArgs.map((arg, index) => (createArgs[index - 1] === "--db-password" ? "********" : arg));

  if (input.dryRun) {
    reportProgress(input, "Dry-run Supabase apply", "Rendering planned commands without creating resources.");
    const projectRef = "<created-project-ref>";
    return {
      ...base,
      status: "ready_to_create",
      connected: false,
      message: "Dry run only. Mint did not create a Supabase project or write env files.",
      commands: [
        ...(input.orgId ? [] : [commandText(cli.mode, withJsonOutput(["orgs", "list"]))]),
        commandText(cli.mode, createArgs, createDisplayArgs),
        shouldLink ? buildLinkInvocation(cli.mode, projectRef, dbPassword).display : "",
        commandText(cli.mode, withJsonOutput(["projects", "api-keys", "--project-ref", projectRef])),
      ].filter(Boolean),
      env: {
        variables: [
          "EXPO_PUBLIC_SUPABASE_URL",
          "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
          "EXPO_PUBLIC_SUPABASE_ANON_KEY",
        ],
      },
      nextSteps: ["Run without --dry-run to create and configure the project."],
      warnings: input.orgId ? [] : ["Mint will list organizations and auto-select only if exactly one organization is available."],
    };
  }

  if (!input.apply || !input.allProvidersConfigured) {
    return {
      ...base,
      status: "blocked_until_all_configured",
      connected: false,
      message:
        "Mint staged the Supabase resource plan but did not create anything because every provider must be configured before apply.",
      commands: [
        ...(input.orgId ? [] : [commandText(cli.mode, withJsonOutput(["orgs", "list"]))]),
        commandText(cli.mode, createArgs, createDisplayArgs),
        shouldLink ? buildLinkInvocation(cli.mode, "<created-project-ref>", dbPassword).display : "",
        commandText(cli.mode, withJsonOutput(["projects", "api-keys", "--project-ref", "<created-project-ref>"])),
      ].filter(Boolean),
      env: {
        variables: [
          "EXPO_PUBLIC_SUPABASE_URL",
          "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
          "EXPO_PUBLIC_SUPABASE_ANON_KEY",
        ],
      },
      nextSteps: [
        "Finish configuring RevenueCat, PostHog, Expo, and EAS",
        "Mint will apply provider resources only after every provider is ready",
      ],
      warnings: ["No Supabase project was created."],
    };
  }

  let organization: SupabaseOrganization | undefined;
  let orgId = input.orgId?.trim();
  const commands: string[] = [];
  const warnings: string[] = [];

  if (!orgId) {
    reportProgress(input, "Listing Supabase organizations", "Mint will auto-select only when exactly one org exists.");
    const orgs = await listOrganizations(input.runner, cli.mode);
    commands.push(orgs.invocation.display);

    if (orgs.result.exitCode !== 0) {
      return {
        ...base,
        status: isLoginError(`${orgs.result.stderr}\n${orgs.result.stdout}`) ? "needs_login" : "failed",
        connected: false,
        message: "Mint could not list your Supabase organizations.",
        commands,
        nextSteps: ["Run mint connect supabase --login", "Retry mint connect supabase --create"],
        error: orgs.result.stderr || orgs.result.stdout || "Failed to list Supabase organizations",
      };
    }

    if (orgs.organizations.length !== 1) {
      return {
        ...base,
        status: "needs_org_selection",
        connected: false,
        message:
          orgs.organizations.length === 0
            ? "Mint did not find any Supabase organizations on this account."
            : "Mint found multiple Supabase organizations. Pick one so project creation is explicit.",
        organizations: orgs.organizations,
        commands,
        nextSteps: ["Retry with mint connect supabase --create --org-id <organization-id-or-slug>"],
      };
    }

    organization = orgs.organizations[0]!;
    orgId = orgFlagValue(organization);
    reportProgress(input, "Selected Supabase organization", organization.name);
  }

  const resolvedCreateArgs = createArgs.map(arg => (arg === plannedOrg ? orgId ?? plannedOrg : arg));
  const resolvedDisplayArgs = resolvedCreateArgs.map((arg, index) => (resolvedCreateArgs[index - 1] === "--db-password" ? "********" : arg));
  const createInvocation = buildSupabaseInvocation(cli.mode, resolvedCreateArgs, resolvedDisplayArgs);
  commands.push(createInvocation.display);

  reportProgress(input, "Creating Supabase project", createInvocation.display);
  const createResult = await input.runner.run(createInvocation.command, createInvocation.args);

  if (createResult.exitCode !== 0) {
    return {
      ...base,
      status: isLoginError(`${createResult.stderr}\n${createResult.stdout}`) ? "needs_login" : "failed",
      connected: false,
      message: "Supabase project creation failed.",
      organization,
      commands,
      nextSteps: ["Run mint connect supabase --login", "Retry mint connect supabase --create"],
      error: createResult.stderr || createResult.stdout || "Supabase project creation failed",
    };
  }

  const project = extractProject(createResult.stdout);

  if (!project) {
    return {
      ...base,
      status: "partial",
      connected: false,
      message: "Supabase created a project, but Mint could not read the project ref from CLI output.",
      organization,
      commands,
      nextSteps: ["Run supabase projects list --output-format json", "Then retry mint connect supabase --project-ref <project-ref>"],
      warnings: ["Project creation may have succeeded in Supabase."],
    };
  }

  reportProgress(input, "Supabase project created", project.ref);
  let linked = false;

  if (shouldLink) {
    reportProgress(input, "Linking Supabase project", `Project ref ${project.ref}.`);
    const linkResult = await connectSupabase({
      projectRef: project.ref,
      dbPassword,
      runner: input.runner,
    });
    commands.push(linkResult.cli.display);
    linked = linkResult.connected;

    if (!linked) {
      warnings.push(linkResult.error ?? "Project created, but local linking failed.");
      const cleanup = shouldCleanup ? await cleanupSupabaseProject(input.runner, cli.mode, project.ref) : undefined;

      return {
        ...base,
        status: "failed",
        connected: false,
        message: cleanup?.success
          ? "Supabase project creation was rolled back because local linking failed."
          : "Supabase project was created, but local linking failed.",
        project,
        organization,
        commands: [...commands, ...(cleanup?.commands ?? [])],
        nextSteps: cleanup?.success
          ? ["Fix Supabase login or database password, then retry the Mint apply flow"]
          : [`Delete the Supabase project manually if needed: ${project.ref}`, "Then retry the Mint apply flow"],
        warnings,
        cleanup,
        error: linkResult.error ?? "Supabase link failed",
      };
    }
  }

  reportProgress(input, "Fetching Supabase API keys", `Project ref ${project.ref}.`);
  const apiKeys = await fetchApiKeys(input.runner, cli.mode, project.ref);
  commands.push(apiKeys.invocation.display);

  if (apiKeys.result.exitCode !== 0 || !apiKeys.keys?.publishableKey) {
    const cleanup = shouldCleanup ? await cleanupSupabaseProject(input.runner, cli.mode, project.ref) : undefined;

    return {
      ...base,
      status: "failed",
      connected: false,
      message: cleanup?.success
        ? "Supabase project creation was rolled back because Mint could not fetch a publishable API key."
        : "Supabase project was created, but Mint could not fetch a publishable API key.",
      project,
      organization,
      commands: [...commands, ...(cleanup?.commands ?? [])],
      nextSteps: [
        ...(cleanup?.success ? ["Retry the Mint apply flow after Supabase reports the account ready"] : [`Delete the Supabase project manually if needed: ${project.ref}`]),
      ],
      warnings,
      cleanup,
      error: apiKeys.result.stderr || apiKeys.result.stdout || "Missing publishable Supabase API key",
    };
  }

  const url = projectUrl(project.ref);
  let expoEnv: EnvWriteResult;
  let serverEnv: EnvWriteResult | undefined;

  try {
    reportProgress(input, "Writing Supabase env", envFile);
    expoEnv = await upsertEnvFile(input.projectRoot, envFile, {
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: apiKeys.keys.publishableKey,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: apiKeys.keys.publishableKey,
    });
    if (input.serverEnvFile) {
      reportProgress(input, "Writing Supabase server env", input.serverEnvFile);
      serverEnv = await upsertEnvFile(input.projectRoot, input.serverEnvFile, {
        SUPABASE_URL: url,
        SUPABASE_PROJECT_REF: project.ref,
        SUPABASE_SECRET_KEY: apiKeys.keys.secretKey,
        SUPABASE_SERVICE_ROLE_KEY: apiKeys.keys.serviceRoleKey,
      });
    }
  } catch (error) {
    const cleanup = shouldCleanup ? await cleanupSupabaseProject(input.runner, cli.mode, project.ref) : undefined;

    return {
      ...base,
      status: "failed",
      connected: false,
      message: cleanup?.success
        ? "Supabase project creation was rolled back because Mint could not write env files."
        : "Supabase project was created, but Mint could not write env files.",
      project,
      organization,
      commands: [...commands, ...(cleanup?.commands ?? [])],
      nextSteps: cleanup?.success
        ? ["Fix local file permissions, then retry the Mint apply flow"]
        : [`Delete the Supabase project manually if needed: ${project.ref}`, "Fix local file permissions, then retry"],
      warnings,
      cleanup,
      error: error instanceof Error ? error.message : "Failed to write Supabase env files",
    };
  }

  return {
    ...base,
    status: linked || !shouldLink ? "provisioned" : "partial",
    connected: linked || !shouldLink,
    message: "Supabase project created and env files configured.",
    project,
    organization,
    commands,
    env: {
      expo: expoEnv,
      server: serverEnv,
      variables: [...expoEnv.variables, ...(serverEnv?.variables ?? [])],
    },
    nextSteps: ["Run mint doctor", "Run mint connect revenuecat"],
    warnings,
  };
}
