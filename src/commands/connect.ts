import {Command} from "commander";
import {execaCommandRunner} from "../core/commandRunner.js";
import {providerCatalog} from "../core/providerCatalog.js";
import {provisionSupabaseProject, type SupabaseProvisionResult} from "../core/supabaseProvision.js";
import {
  buildSupabaseInvocation,
  connectSupabase,
  detectSupabaseCli,
  type SupabaseConnectResult,
} from "../core/supabaseConnect.js";
import {connectStatePath, markProvider, readConnectState} from "../state/connectState.js";

type ConnectOptions = {
  json?: boolean;
  skip?: boolean;
  projectRef?: string;
  dbPassword?: string;
  login?: boolean;
  noBrowser?: boolean;
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

  if (result.error) {
    lines.push("", `Error: ${result.error}`);
  }

  lines.push("", "Next steps:");
  for (const step of result.nextSteps) {
    lines.push(`- ${step}`);
  }

  return `${lines.join("\n")}\n`;
}

async function runSupabaseLogin(options: ConnectOptions) {
  const cli = await detectSupabaseCli(execaCommandRunner);
  const args = ["login", ...(options.noBrowser ? ["--no-browser"] : [])];
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

  if (options.dryRun) {
    return {
      provider: "supabase" as const,
      status: "ready_to_login" as const,
      connected: false,
      message: "Dry run only. Mint did not start Supabase login.",
      cli,
      command: invocation.display,
      nextSteps: [`Would run: ${invocation.display}`],
    };
  }

  const result = await execaCommandRunner.run(invocation.command, invocation.args);

  return {
    provider: "supabase" as const,
    status: result.exitCode === 0 ? ("logged_in" as const) : ("failed" as const),
    connected: result.exitCode === 0,
    message: result.exitCode === 0 ? "Supabase account login completed." : "Supabase login failed.",
    cli,
    command: invocation.display,
    nextSteps: result.exitCode === 0 ? ["Run mint connect supabase --create"] : ["Retry mint connect supabase --login"],
    error: result.exitCode === 0 ? undefined : result.stderr || result.stdout || "Supabase login failed",
  };
}

export function connectCommand(): Command {
  return new Command("connect")
    .description("Connect or repair Mint service configuration.")
    .argument("[service]", "Service to connect.")
    .option("--json", "Render machine-readable output.")
    .option("--skip", "Mark the service as skipped for this project.")
    .option("--project-ref <ref>", "Supabase project ref to link.")
    .option("--db-password <password>", "Supabase database password for linking or project creation.")
    .option("--login", "Connect the Supabase CLI to your account.")
    .option("--no-browser", "Do not open a browser for Supabase login.")
    .option("--create", "Create a new Supabase project and configure env files.")
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

      if (provider && options.skip) {
        const state = await markProvider(projectRoot, provider.key, "skipped");
        process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
        return;
      }

      if (provider?.key === "supabase") {
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
