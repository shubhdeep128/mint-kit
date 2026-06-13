import {createElement} from "react";
import {access, rm} from "node:fs/promises";
import {resolve} from "node:path";
import {Command} from "commander";
import {mintCommand} from "../core/commandDisplay.js";
import {execaCommandRunner} from "../core/commandRunner.js";
import {readEnvFileValues} from "../core/envFile.js";
import {createNewFlowModel, type ProviderKey} from "../core/flowModel.js";
import {scaffoldMintApp} from "../core/appScaffold.js";
import {chooseOutputMode} from "../core/mode.js";
import {runLocalPreflight} from "../core/preflight.js";
import {
  provisionEas,
  provisionPostHog,
  provisionRevenueCat,
  validateEasAccess,
  validatePostHogAccess,
  validateRevenueCatAccess,
  type ProviderProvisionResult,
  type ProviderRollbackTask,
} from "../core/providerProvision.js";
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

type ApplyProgress = {
  label: string;
  detail?: string | undefined;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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

  if (provider === "revenuecat") {
    const result = await validateRevenueCatAccess({credentialsRoot: projectRoot});
    return {
      ok: result.ok,
      message: result.message,
    };
  }

  if (provider === "posthog") {
    const result = await validatePostHogAccess({credentialsRoot: projectRoot});
    return {
      ok: result.ok,
      message: result.message,
    };
  }

  if (provider === "expo" || provider === "eas") {
    const result = await validateEasAccess({credentialsRoot: projectRoot, runner: execaCommandRunner});
    return {
      ok: result.ok,
      message: result.message,
    };
  }

  return {
    ok: false,
    message: "This provider is not configured yet.",
  };
}

async function applySetup(appName: string, options: NewOptions, onProgress: (progress: ApplyProgress) => void) {
  const credentialsRoot = process.cwd();
  const appRoot = resolve(credentialsRoot, appName);
  const appRootExisted = await pathExists(appRoot);

  if (options.dryRun) {
    return {
      ok: true,
      message: "Dry run only. Mint did not create provider resources or write app files.",
      details: [`App directory: ${appRoot}`],
      nextSteps: [`Run ${mintCommand(`new ${appName}`)} without --dry-run`],
    };
  }

  onProgress({label: "Scaffolding local app", detail: appRoot});
  const scaffold = await scaffoldMintApp({
    appRoot,
    appName,
    onProgress: progress =>
      onProgress({
        label: `App: ${progress.label}`,
        detail: progress.detail,
      }),
  });

  const providerResults: ProviderProvisionResult[] = [];
  const rollbackTasks: ProviderRollbackTask[] = [];

  async function cleanupGeneratedApp() {
    if (appRootExisted) {
      return [];
    }

    onProgress({label: "Cleaning local app shell", detail: appRoot});
    await rm(appRoot, {recursive: true, force: true});
    return ["Removed generated app directory after failed apply."];
  }

  async function rollbackAppliedProviders(reason: string) {
    const rollbackDetails: string[] = [];

    if (rollbackTasks.length === 0) {
      return rollbackDetails;
    }

    onProgress({label: "Rolling back provider resources", detail: reason});

    for (const task of [...rollbackTasks].reverse()) {
      onProgress({label: `Rollback: ${task.label}`, detail: task.provider});
      const result = await task.run();
      rollbackDetails.push(
        `${result.provider} rollback ${result.success ? "succeeded" : "failed"}`,
        ...result.details,
      );
    }

    return rollbackDetails;
  }

  async function runProvider(label: string, run: () => Promise<ProviderProvisionResult>) {
    onProgress({label, detail: appRoot});
    const result = await run();
    providerResults.push(result);

    if (!result.connected) {
      return result;
    }

    if (result.rollback) {
      rollbackTasks.push(result.rollback);
    }

    return undefined;
  }

  const revenueCatFailure = await runProvider("Applying RevenueCat", () =>
    provisionRevenueCat({
      appRoot,
      credentialsRoot,
      appName,
      onProgress: progress =>
        onProgress({
          label: progress.label,
          detail: progress.detail,
        }),
    }),
  );
  if (revenueCatFailure) {
    const rollbackDetails = await rollbackAppliedProviders(revenueCatFailure.message);
    const localCleanupDetails = await cleanupGeneratedApp();
    return {
      ok: false,
      message: revenueCatFailure.message,
      details: [...revenueCatFailure.details, ...rollbackDetails, ...localCleanupDetails],
      nextSteps: revenueCatFailure.nextSteps,
    };
  }

  const postHogFailure = await runProvider("Applying PostHog", () =>
    provisionPostHog({
      appRoot,
      credentialsRoot,
      appName,
      onProgress: progress =>
        onProgress({
          label: progress.label,
          detail: progress.detail,
        }),
    }),
  );
  if (postHogFailure) {
    const rollbackDetails = await rollbackAppliedProviders(postHogFailure.message);
    const localCleanupDetails = await cleanupGeneratedApp();
    return {
      ok: false,
      message: postHogFailure.message,
      details: [...postHogFailure.details, ...rollbackDetails, ...localCleanupDetails],
      nextSteps: postHogFailure.nextSteps,
    };
  }

  const easFailure = await runProvider("Applying Expo/EAS", () =>
    provisionEas({
      appRoot,
      credentialsRoot,
      appName,
      runner: execaCommandRunner,
      onProgress: progress =>
        onProgress({
          label: progress.label,
          detail: progress.detail,
        }),
    }),
  );
  if (easFailure) {
    const rollbackDetails = await rollbackAppliedProviders(easFailure.message);
    const localCleanupDetails = await cleanupGeneratedApp();
    return {
      ok: false,
      message: easFailure.message,
      details: [...easFailure.details, ...rollbackDetails, ...localCleanupDetails],
      nextSteps: easFailure.nextSteps,
    };
  }

  onProgress({label: "Checking existing app Supabase state", detail: `${appName}/.mint/connect-state.json`});
  const state = await readConnectState(appRoot);
  const envValues = await readEnvFileValues(appRoot, ".env.local");
  const supabaseAlreadyApplied =
    state.providers.some(provider => provider.key === "supabase" && provider.status === "connected") &&
    Boolean(envValues.EXPO_PUBLIC_SUPABASE_URL);

  if (supabaseAlreadyApplied) {
    onProgress({label: "Supabase already applied", detail: envValues.EXPO_PUBLIC_SUPABASE_URL});
    return {
      ok: true,
      message: "Mint app setup complete.",
      details: [
        `App directory: ${appRoot}`,
        "Supabase env is present and connect-state marks Supabase connected.",
        ...providerResults.flatMap(provider => provider.details),
      ],
      nextSteps: [`cd ${appName}`, "pnpm install", "pnpm typecheck", "pnpm lint", "pnpm test", "pnpm start"],
    };
  }

  onProgress({label: "Applying Supabase", detail: "Creating project, linking locally, and writing env files."});
  const result = await provisionSupabaseProject({
    projectRoot: appRoot,
    runner: execaCommandRunner,
    projectName: appName,
    serverEnvFile: "server/.env",
    apply: true,
    allProvidersConfigured: true,
    dryRun: options.dryRun,
    onProgress: progress =>
      onProgress({
        label: `Supabase: ${progress.label}`,
        detail: progress.detail,
      }),
  });

  if (result.connected) {
    onProgress({label: "Recording Supabase state", detail: result.project?.ref});
    await markProvider(appRoot, "supabase", "connected", {
      projectRef: result.project?.ref,
      envFile: result.env.expo?.path,
      serverEnvFile: result.env.server?.path,
    });
  }

  const ok = result.connected;
  const rollbackDetails = ok ? [] : await rollbackAppliedProviders(result.message);
  const localCleanupDetails = ok ? [] : await cleanupGeneratedApp();

  return {
    ok,
    message: result.message,
    details: [
      `App directory: ${appRoot}`,
      `Scaffold files: ${scaffold.files.length}`,
      ...providerResults.flatMap(provider => provider.details),
      result.project ? `Supabase project: ${result.project.name ?? appName} (${result.project.ref})` : undefined,
      result.organization ? `Supabase organization: ${result.organization.name}` : undefined,
      result.env.expo ? `Expo env: ${result.env.expo.path}` : undefined,
      result.env.server ? `Server env: ${result.env.server.path}` : undefined,
      ...result.warnings,
      ...rollbackDetails,
      ...localCleanupDetails,
      result.error ? `Error: ${result.error}` : undefined,
    ].filter((detail): detail is string => Boolean(detail)),
    nextSteps: result.connected
      ? [`cd ${appName}`, "pnpm install", "pnpm typecheck", "pnpm lint", "pnpm test", "pnpm start"]
      : result.nextSteps,
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
            applySetup: onProgress => applySetup(appName, options, onProgress),
          }),
        );
        return;
      }

      process.stdout.write(renderText(model));
    });
}
