import {Command} from "commander";
import {providerCatalog} from "../core/providerCatalog.js";
import {markProvider, readConnectState} from "../state/connectState.js";

type ConnectOptions = {
  json?: boolean;
  skip?: boolean;
};

export function connectCommand(): Command {
  return new Command("connect")
    .description("Connect or repair Mint service configuration.")
    .argument("[service]", "Service to connect.")
    .option("--json", "Render machine-readable output.")
    .option("--skip", "Mark the service as skipped for this project.")
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
