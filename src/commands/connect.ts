import {Command} from "commander";
import {execaCommandRunner} from "../core/commandRunner.js";
import {providerCatalog} from "../core/providerCatalog.js";
import {connectSupabase, type SupabaseConnectResult} from "../core/supabaseConnect.js";
import {connectStatePath, markProvider, readConnectState} from "../state/connectState.js";

type ConnectOptions = {
  json?: boolean;
  skip?: boolean;
  projectRef?: string;
  dryRun?: boolean;
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

export function connectCommand(): Command {
  return new Command("connect")
    .description("Connect or repair Mint service configuration.")
    .argument("[service]", "Service to connect.")
    .option("--json", "Render machine-readable output.")
    .option("--skip", "Mark the service as skipped for this project.")
    .option("--project-ref <ref>", "Supabase project ref to link.")
    .option("--dry-run", "Show the connection command without running it.")
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
        const result = await connectSupabase({
          projectRef: options.projectRef,
          runner: execaCommandRunner,
          dryRun: options.dryRun,
        });
        const state = result.connected ? await markProvider(projectRoot, "supabase", "connected") : await readConnectState(projectRoot);
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
