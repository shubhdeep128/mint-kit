import {createElement} from "react";
import {Command} from "commander";
import {mintCommand} from "../core/commandDisplay.js";
import {execaCommandRunner, execaInteractiveCommandRunner} from "../core/commandRunner.js";
import {
  connectCredentialProvider,
  getCredentialProviderSpec,
  inspectCredentialProvider,
  type CredentialConnectResult,
  type CredentialInspection,
  type CredentialProviderSpec,
} from "../core/providerCredentials.js";
import {providerCatalog} from "../core/providerCatalog.js";
import {provisionSupabaseProject, type SupabaseProvisionResult} from "../core/supabaseProvision.js";
import {
  buildSupabaseInvocation,
  connectSupabase,
  detectSupabaseCli,
  inspectSupabaseConnection,
  type SupabaseConnectResult,
  type SupabaseDiagnosticsResult,
} from "../core/supabaseConnect.js";
import {connectStatePath, markProvider, readConnectState} from "../state/connectState.js";
import {CredentialConnectApp} from "../ui/CredentialConnectApp.js";
import {renderInteractive} from "../ui/renderInteractive.js";

type ConnectOptions = {
  json?: boolean;
  token?: string;
  apiKey?: string;
  personalApiKey?: string;
  expoToken?: string;
  projectRef?: string;
  dbPassword?: string;
  login?: boolean;
  browser?: boolean;
  create?: boolean;
  projectName?: string;
  orgId?: string;
  region?: string;
  size?: string;
  envFile?: string;
  serverEnvFile?: string;
  dryRun?: boolean;
  link?: boolean;
};

function renderSupabaseText(result: SupabaseConnectResult, statePath?: string): string {
  const lines = [
    "Mint connect supabase",
    "",
    result.message,
    "",
    `CLI: ${result.cli.available ? result.cli.mode : "missing"}`,
    `Connection command: ${result.cli.display}`,
  ];

  if (result.connected && statePath) {
    lines.push(`State written: ${statePath}`);
  }

  if (result.error) {
    lines.push("", `Error: ${result.error}`);
  }

  lines.push("", "Next steps:");
  for (const step of result.nextSteps) {
    lines.push(`- ${step}`);
  }

  return `${lines.join("\n")}\n`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function renderSupabaseDiagnosticsText(result: SupabaseDiagnosticsResult): string {
  const lines = [
    "Mint connect supabase",
    "",
    result.message,
    "",
    "CLI",
    `- Supabase installed: ${yesNo(result.cli.direct.installed)}${result.cli.direct.version ? ` (${result.cli.direct.version})` : ""}`,
    `- npx fallback: ${yesNo(result.cli.npx.available)}${result.cli.npx.version ? ` (${result.cli.npx.version})` : ""}`,
    `- Mint will use: ${result.cli.selectedCommand}`,
    "",
    "Account",
    `- Login: ${result.account.status.replace("_", " ")}`,
  ];

  if (result.account.detail) {
    lines.push(`- Detail: ${result.account.detail}`);
  }

  if (result.account.organizations) {
    lines.push(`- Organizations: ${result.account.organizations.length}`);
  }

  if (result.commands.status) {
    lines.push("", "Probe", `- ${result.commands.status}`);
  }

  lines.push("", "Next steps:");
  for (const step of result.nextSteps) {
    lines.push(`- ${step}`);
  }

  return `${lines.join("\n")}\n`;
}

function renderSupabaseProvisionText(result: SupabaseProvisionResult, statePath?: string): string {
  const lines = ["Mint connect supabase", "", result.message];

  if (result.project) {
    lines.push("", `Project: ${result.project.name ?? result.project.ref}`, `Ref: ${result.project.ref}`);
  }

  if (result.organization) {
    lines.push(`Organization: ${result.organization.name}`);
  }

  if (result.organizations?.length) {
    lines.push("", "Organizations:");
    for (const org of result.organizations) {
      lines.push(`- ${org.name} (${org.slug ?? org.id ?? "unknown"})`);
    }
  }

  if (result.commands.length > 0) {
    lines.push("", "Commands:");
    for (const command of result.commands) {
      lines.push(`- ${command}`);
    }
  }

  if (result.env.expo) {
    lines.push("", `Expo env: ${result.env.expo.path}`);
  }

  if (result.env.server) {
    lines.push(`Server env: ${result.env.server.path}`);
  }

  if (result.connected && statePath) {
    lines.push(`State written: ${statePath}`);
  }

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (result.cleanup) {
    lines.push("", "Cleanup:");
    lines.push(`- Attempted: ${yesNo(result.cleanup.attempted)}`);
    if (result.cleanup.commands.length > 0) {
      for (const command of result.cleanup.commands) {
        lines.push(`- ${command}`);
      }
    }
    if (typeof result.cleanup.success === "boolean") {
      lines.push(`- Success: ${yesNo(result.cleanup.success)}`);
    }
    if (result.cleanup.error) {
      lines.push(`- Error: ${result.cleanup.error}`);
    }
  }

  if (result.error) {
    lines.push("", `Error: ${result.error}`);
  }

  lines.push("", "Next steps:");
  for (const step of result.nextSteps) {
    lines.push(`- ${step}`);
  }

  return `${lines.join("\n")}\n`;
}

function credentialValuesFromOptions(
  spec: CredentialProviderSpec,
  options: ConnectOptions,
): Record<string, string> {
  const optionValues: Record<string, string | undefined> = {
    REVENUECAT_API_KEY: options.apiKey ?? options.token,
    POSTHOG_PERSONAL_API_KEY: options.personalApiKey ?? options.token,
    EXPO_TOKEN: options.expoToken ?? options.token,
  };

  return Object.fromEntries(
    spec.fields.map(field => [field.envName, optionValues[field.envName] ?? process.env[field.envName] ?? ""]),
  );
}

function hasAllCredentialValues(spec: CredentialProviderSpec, values: Record<string, string>): boolean {
  return spec.fields.every(field => Boolean(values[field.envName]?.trim()));
}

function resultFromCredentialInspection(
  spec: CredentialProviderSpec,
  inspection: CredentialInspection,
  envFile: string,
): CredentialConnectResult {
  if (inspection.connected) {
    return {
      provider: spec.key,
      status: "connected",
      connected: true,
      message: `${spec.label} is already configured${inspection.source ? ` via ${inspection.source}` : ""}.`,
      variables: inspection.variables,
      missing: [],
      nextSteps: ["Return to the setup flow", "Press Enter to validate this provider"],
    };
  }

  return {
    provider: spec.key,
    status: "needs_input",
    connected: false,
    message: `${spec.label} needs ${inspection.missing.join(", ")}.`,
    variables: inspection.variables,
    missing: inspection.missing,
    nextSteps: [
      `Run ${mintCommand(spec.commandArgs)} and paste the value when prompted`,
      `Or set ${inspection.missing.join(", ")} in ${envFile}`,
      "Return to the setup flow and press Enter",
    ],
  };
}

function renderCredentialConnectText(result: CredentialConnectResult, spec: CredentialProviderSpec, envFile: string): string {
  const lines = [`Mint connect ${spec.label}`, "", result.message];

  if (result.env) {
    lines.push("", `Env file: ${result.env.path}`);
  } else {
    lines.push("", `Env file: ${envFile}`);
  }

  if (result.statePath) {
    lines.push(`State written: ${result.statePath}`);
  }

  lines.push("", "Variables:");
  for (const variable of result.variables) {
    lines.push(`- ${variable}`);
  }

  lines.push("", "Next steps:");
  for (const step of result.nextSteps) {
    lines.push(`- ${step}`);
  }

  return `${lines.join("\n")}\n`;
}

async function runSupabaseLogin(options: ConnectOptions) {
  const cli = await detectSupabaseCli(execaCommandRunner);
  const args = ["login", ...(options.browser === false ? ["--no-browser"] : [])];
  const invocation = buildSupabaseInvocation(cli.mode, args);

  if (!cli.available) {
    return {
      provider: "supabase" as const,
      status: "failed" as const,
      connected: false,
      message: "Supabase CLI is not available directly and npx is not available as a fallback.",
      cli,
      command: invocation.display,
      nextSteps: ["Install Node/npm or Supabase CLI", "Then run mint connect supabase --login"],
      error: "Missing supabase CLI and npx fallback",
    };
  }

  if (options.dryRun || options.json) {
    return {
      provider: "supabase" as const,
      status: "ready_to_login" as const,
      connected: false,
      message: options.json
        ? "JSON mode does not start interactive Supabase login. Run without --json to connect the account."
        : "Dry run only. Mint did not start Supabase login.",
      cli,
      command: invocation.display,
      nextSteps: [`Would run: ${invocation.display}`],
    };
  }

  process.stdout.write(
    [
      "Mint connect supabase",
      "",
      `Supabase installed: ${yesNo(cli.direct.installed)}${cli.direct.version ? ` (${cli.direct.version})` : ""}`,
      `npx fallback: ${yesNo(cli.npx.available)}${cli.npx.version ? ` (${cli.npx.version})` : ""}`,
      `Running: ${invocation.display}`,
      "",
      "Supabase may open a browser or ask for an access token. Mint will show the login prompt below.",
      "",
    ].join("\n"),
  );

  const result = await execaInteractiveCommandRunner.runInteractive(invocation.command, invocation.args);
  const diagnostics = result.exitCode === 0 ? await inspectSupabaseConnection(execaCommandRunner) : undefined;

  return {
    provider: "supabase" as const,
    status:
      diagnostics?.account.status === "authenticated"
        ? ("logged_in" as const)
        : result.exitCode === 0
          ? ("unknown" as const)
          : ("failed" as const),
    connected: diagnostics?.account.status === "authenticated",
    message:
      diagnostics?.account.status === "authenticated"
        ? "Supabase account login completed."
        : result.exitCode === 0
          ? "Supabase login command finished, but Mint could not confirm an active account session."
          : "Supabase login failed.",
    cli,
    command: invocation.display,
    diagnostics,
    nextSteps:
      diagnostics?.account.status === "authenticated"
        ? ["Stage Supabase with mint connect supabase --create"]
        : result.exitCode === 0
          ? ["Run mint connect supabase to inspect login state", "Retry mint connect supabase --login if needed"]
          : ["Retry mint connect supabase --login"],
    error: result.exitCode === 0 ? undefined : result.stderr || result.stdout || "Supabase login failed",
  };
}

export function connectCommand(): Command {
  return new Command("connect")
    .description("Connect or repair Mint service configuration.")
    .argument("[service]", "Service to connect.")
    .option("--json", "Render machine-readable output.")
    .option("--token <token>", "Provider token for RevenueCat, PostHog, or Expo.")
    .option("--api-key <key>", "RevenueCat API key.")
    .option("--personal-api-key <key>", "PostHog personal API key.")
    .option("--expo-token <token>", "Expo access token.")
    .option("--project-ref <ref>", "Supabase project ref to link.")
    .option("--db-password <password>", "Supabase database password for linking or project creation.")
    .option("--login", "Connect the Supabase CLI to your account.")
    .option("--no-browser", "Do not open a browser for Supabase login.")
    .option("--create", "Stage Supabase project creation for the all-provider apply phase.")
    .option("--project-name <name>", "Name for a new Supabase project.")
    .option("--org-id <id>", "Supabase organization id or slug to create the project in.")
    .option("--region <region>", "Supabase region for new projects.", "us-east-1")
    .option("--size <size>", "Supabase instance size for new projects.", "nano")
    .option("--env-file <path>", "Expo env file to update.", ".env.local")
    .option("--server-env-file <path>", "Server env file to update with server-only Supabase values.")
    .option("--dry-run", "Show the connection command without running it.")
    .option("--no-link", "Create/configure without running supabase link.")
    .action(async (service: string | undefined, options: ConnectOptions) => {
      const projectRoot = process.cwd();
      const provider = providerCatalog.find(item => item.key === service);

      if (service && !provider) {
        throw new Error(`Unknown service "${service}". Use one of: ${providerCatalog.map(item => item.key).join(", ")}`);
      }

      if (provider?.key === "supabase") {
        if (!options.login && !options.create && !options.projectRef) {
          const result = await inspectSupabaseConnection(execaCommandRunner);
          const payload = {
            command: "connect",
            service: "supabase",
            result,
            state: await readConnectState(projectRoot),
          };

          if (options.json) {
            process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
            return;
          }

          process.stdout.write(renderSupabaseDiagnosticsText(result));
          return;
        }

        if (options.login) {
          const result = await runSupabaseLogin(options);
          const payload = {
            command: "connect",
            service: "supabase",
            result,
            state: await readConnectState(projectRoot),
          };

          if (options.json) {
            process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
            return;
          }

          process.stdout.write(
            [
              "Mint connect supabase",
              "",
              result.message,
              "",
              `Command: ${result.command}`,
              result.error ? `Error: ${result.error}` : "",
              "",
              "Next steps:",
              ...result.nextSteps.map(step => `- ${step}`),
            ]
              .filter(line => line !== "")
              .join("\n") + "\n",
          );
          return;
        }

        if (options.create) {
          const result = await provisionSupabaseProject({
            projectRoot,
            runner: execaCommandRunner,
            projectName: options.projectName,
            orgId: options.orgId,
            dbPassword: options.dbPassword,
            region: options.region,
            size: options.size,
            envFile: options.envFile,
            serverEnvFile: options.serverEnvFile,
            dryRun: options.dryRun,
            link: options.link,
          });
          const state = result.connected
            ? await markProvider(projectRoot, "supabase", "connected", {
                projectRef: result.project?.ref,
                envFile: result.env.expo?.path,
                serverEnvFile: result.env.server?.path,
              })
            : await readConnectState(projectRoot);
          const payload = {
            command: "connect",
            service: "supabase",
            result,
            state,
          };

          if (options.json) {
            process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
            return;
          }

          process.stdout.write(renderSupabaseProvisionText(result, result.connected ? connectStatePath(projectRoot) : undefined));
          return;
        }

        const result = await connectSupabase({
          projectRef: options.projectRef,
          dbPassword: options.dbPassword,
          runner: execaCommandRunner,
          dryRun: options.dryRun,
        });
        const state = result.connected
          ? await markProvider(projectRoot, "supabase", "connected", {projectRef: result.projectRef})
          : await readConnectState(projectRoot);
        const payload = {
          command: "connect",
          service: "supabase",
          result,
          state,
        };

        if (options.json) {
          process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
          return;
        }

        process.stdout.write(renderSupabaseText(result, result.connected ? connectStatePath(projectRoot) : undefined));
        return;
      }

      const credentialSpec = provider ? getCredentialProviderSpec(provider.key) : undefined;

      if (credentialSpec) {
        const envFile = options.envFile ?? ".env.local";
        const suppliedValues = credentialValuesFromOptions(credentialSpec, options);

        if (hasAllCredentialValues(credentialSpec, suppliedValues)) {
          const result = await connectCredentialProvider(projectRoot, credentialSpec, suppliedValues, envFile);
          const payload = {
            command: "connect",
            service: credentialSpec.key,
            result,
            state: result.state ?? (await readConnectState(projectRoot)),
          };

          if (options.json) {
            process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
            return;
          }

          process.stdout.write(renderCredentialConnectText(result, credentialSpec, envFile));
          return;
        }

        const inspection = await inspectCredentialProvider(projectRoot, credentialSpec, envFile);
        const inspectedResult = resultFromCredentialInspection(credentialSpec, inspection, envFile);

        if (inspection.connected || options.json || !process.stdout.isTTY) {
          const payload = {
            command: "connect",
            service: credentialSpec.key,
            result: inspectedResult,
            state: await readConnectState(projectRoot),
          };

          if (options.json) {
            process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
            return;
          }

          process.stdout.write(renderCredentialConnectText(inspectedResult, credentialSpec, envFile));
          return;
        }

        await renderInteractive(
          createElement(CredentialConnectApp, {
            spec: credentialSpec,
            envFile,
            onSubmit: values => connectCredentialProvider(projectRoot, credentialSpec, values, envFile),
          }),
        );
        return;
      }

      const state = await readConnectState(projectRoot);
      const payload = {
        command: "connect",
        service: provider?.key ?? "all",
        providers: provider ? [provider] : providerCatalog,
        state,
      };

      if (options.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
      }

      process.stdout.write("Mint connect\n\n");
      for (const item of payload.providers) {
        process.stdout.write(`${item.label}: ${item.connectCommand}\n`);
        process.stdout.write(`Dashboard: ${item.dashboardUrl}\n\n`);
      }
    });
}
