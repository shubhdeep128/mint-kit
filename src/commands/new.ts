import {createElement} from "react";
import {Command} from "commander";
import {mintCommand} from "../core/commandDisplay.js";
import {execaCommandRunner} from "../core/commandRunner.js";
import {createNewFlowModel, type ProviderKey} from "../core/flowModel.js";
import {chooseOutputMode} from "../core/mode.js";
import {runLocalPreflight} from "../core/preflight.js";
import {getCredentialProviderSpec, inspectCredentialProvider} from "../core/providerCredentials.js";
import {inspectSupabaseConnection} from "../core/supabaseConnect.js";
import {renderJson} from "../output/json.js";
import {renderText} from "../output/text.js";
import {MintInteractiveApp} from "../ui/MintInteractiveApp.js";
import {renderInteractive} from "../ui/renderInteractive.js";

type NewOptions = {
  json?: boolean;
  dryRun?: boolean;
  plain?: boolean;
  connect?: boolean;
};

async function validateSetupProvider(provider: ProviderKey) {
  const projectRoot = process.cwd();

  if (provider === "supabase") {
    const result = await inspectSupabaseConnection(execaCommandRunner);

    if (result.status === "missing_cli") {
      return {
        ok: false,
        message: `Supabase CLI is missing and npx is not available. Install Node/npm or Supabase CLI, then run ${mintCommand(
          "connect supabase --login",
        )}.`,
      };
    }

    return {
      ok: result.account.status === "authenticated",
      message:
        result.account.status === "authenticated"
          ? `Supabase validated. Found ${result.account.organizations?.length ?? 0} organization(s).`
          : `Supabase is not logged in yet. Run ${mintCommand("connect supabase --login")}, then press Enter here again.`,
    };
  }

  const credentialSpec = getCredentialProviderSpec(provider);

  if (credentialSpec) {
    const result = await inspectCredentialProvider(projectRoot, credentialSpec);

    return {
      ok: result.connected,
      message: result.connected
        ? `${credentialSpec.label} validated${result.source ? ` via ${result.source}` : ""}.`
        : `${credentialSpec.label} is missing ${result.missing.join(", ")}. Run ${mintCommand(
            credentialSpec.commandArgs,
          )}, then press Enter here again.`,
    };
  }

  return {
    ok: false,
    message: "This provider is not configured yet.",
  };
}

export function newCommand(): Command {
  return new Command("new")
    .description("Create a new Mint app shell.")
    .argument("<app-name>", "App directory and display name seed.")
    .option("--json", "Render machine-readable output.")
    .option("--dry-run", "Show the planned setup without writing files.")
    .option("--plain", "Disable Ink and render plain text.")
    .option("--no-connect", "Create only and leave service setup for mint connect.")
    .action(async (appName: string, options: NewOptions) => {
      const localChecks = options.dryRun ? [] : await runLocalPreflight(execaCommandRunner);
      const model = createNewFlowModel(appName, localChecks, {connect: options.connect});
      const mode = chooseOutputMode({
        json: options.json,
        interactive: options.plain ? false : undefined,
        stdoutIsTty: process.stdout.isTTY,
        ci: process.env.CI,
      });

      if (mode === "json") {
        process.stdout.write(renderJson(model));
        return;
      }

      if (mode === "interactive") {
        await renderInteractive(createElement(MintInteractiveApp, {model, validateProvider: validateSetupProvider}));
        return;
      }

      process.stdout.write(renderText(model));
    });
}
