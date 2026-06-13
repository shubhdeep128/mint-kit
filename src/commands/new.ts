import {createElement} from "react";
import {Command} from "commander";
import {mintCommand} from "../core/commandDisplay.js";
import {execaCommandRunner} from "../core/commandRunner.js";
import {readEnvFileValues} from "../core/envFile.js";
import {createNewFlowModel, type ProviderKey} from "../core/flowModel.js";
import {chooseOutputMode} from "../core/mode.js";
import {runLocalPreflight} from "../core/preflight.js";
import {getCredentialProviderSpec, inspectCredentialProvider} from "../core/providerCredentials.js";
import {provisionSupabaseProject} from "../core/supabaseProvision.js";
import {inspectSupabaseConnection} from "../core/supabaseConnect.js";
import {renderJson} from "../output/json.js";
import {renderText} from "../output/text.js";
import {markProvider, readConnectState} from "../state/connectState.js";
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

async function applySetup(appName: string, options: NewOptions) {
  const projectRoot = process.cwd();
  const state = await readConnectState(projectRoot);
  const envValues = await readEnvFileValues(projectRoot, ".env.local");
  const supabaseAlreadyApplied =
    state.providers.some(provider => provider.key === "supabase" && provider.status === "connected") &&
    Boolean(envValues.EXPO_PUBLIC_SUPABASE_URL);

  if (supabaseAlreadyApplied) {
    return {
      ok: true,
      message: "Mint setup is already applied for this workspace.",
      details: ["Supabase env is present and connect-state marks Supabase connected."],
      nextSteps: ["Run mint doctor"],
    };
  }

  const result = await provisionSupabaseProject({
    projectRoot,
    runner: execaCommandRunner,
    projectName: appName,
    serverEnvFile: "server/.env",
    apply: true,
    allProvidersConfigured: true,
    dryRun: options.dryRun,
  });

  if (result.connected) {
    await markProvider(projectRoot, "supabase", "connected", {
      projectRef: result.project?.ref,
      envFile: result.env.expo?.path,
      serverEnvFile: result.env.server?.path,
    });
  }

  const ok = result.connected || result.status === "ready_to_create";

  return {
    ok,
    message: result.message,
    details: [
      result.project ? `Supabase project: ${result.project.name ?? appName} (${result.project.ref})` : undefined,
      result.organization ? `Supabase organization: ${result.organization.name}` : undefined,
      result.env.expo ? `Expo env: ${result.env.expo.path}` : undefined,
      result.env.server ? `Server env: ${result.env.server.path}` : undefined,
      ...result.warnings,
      result.error ? `Error: ${result.error}` : undefined,
    ].filter((detail): detail is string => Boolean(detail)),
    nextSteps: result.connected ? ["Run mint doctor"] : result.nextSteps,
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
        await renderInteractive(
          createElement(MintInteractiveApp, {
            model,
            validateProvider: validateSetupProvider,
            applySetup: () => applySetup(appName, options),
          }),
        );
        return;
      }

      process.stdout.write(renderText(model));
    });
}
