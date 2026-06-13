import {access, readFile} from "node:fs/promises";
import {join} from "node:path";
import {Command} from "commander";
import {execaCommandRunner} from "../core/commandRunner.js";
import {readEnvFileValues} from "../core/envFile.js";
import type {CheckStatus, MintFlowModel, ProviderCheck, ProviderKey} from "../core/flowModel.js";
import {runLocalPreflight} from "../core/preflight.js";
import {renderJson} from "../output/json.js";
import {renderText} from "../output/text.js";
import {readConnectState} from "../state/connectState.js";

type DoctorOptions = {
  json?: boolean;
};

type ScriptInspection = {
  hasPackageJson: boolean;
  scripts: Record<string, string>;
};

async function fileExists(projectRoot: string, filePath: string): Promise<boolean> {
  try {
    await access(join(projectRoot, filePath));
    return true;
  } catch {
    return false;
  }
}

async function inspectScripts(projectRoot: string): Promise<ScriptInspection> {
  try {
    const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {scripts?: unknown};
    const scripts = packageJson.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};

    return {
      hasPackageJson: true,
      scripts: Object.fromEntries(
        Object.entries(scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
    };
  } catch {
    return {
      hasPackageJson: false,
      scripts: {},
    };
  }
}

async function inspectGeneratedAppShell(projectRoot: string): Promise<{status: CheckStatus; detail: string}> {
  const requiredFiles = [
    "app.json",
    "CLAUDE.md",
    "AGENTS.md",
    "src/app/_layout.tsx",
    "src/onboarding/onboardingMachine.ts",
    "src/providers/supabase.ts",
    "src/providers/revenuecat.ts",
    "src/providers/posthog.ts",
    "server/src/index.ts",
    "server/tsconfig.json",
  ];
  const missing = (
    await Promise.all(
      requiredFiles.map(async filePath => ({
        filePath,
        exists: await fileExists(projectRoot, filePath),
      })),
    )
  )
    .filter(result => !result.exists)
    .map(result => result.filePath);

  if (missing.length === 0) {
    return {
      status: "ok",
      detail: "Expo Router app shell and agent rules are present",
    };
  }

  return {
    status: "missing",
    detail: `Missing ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}`,
  };
}

function providerConnected(state: Awaited<ReturnType<typeof readConnectState>>, keys: ProviderKey[]): boolean {
  return keys.some(key => state.providers.some(provider => provider.key === key && provider.status === "connected"));
}

function providerCheck(
  key: ProviderKey,
  label: string,
  connected: boolean,
  detail: string,
  missingDetail: string,
): ProviderCheck {
  return {
    key,
    label,
    status: connected ? "ok" : "missing",
    detail: connected ? detail : missingDetail,
    repairCommand: connected ? undefined : "mint new <app-name>",
  };
}

async function readEasProjectId(projectRoot: string): Promise<string | undefined> {
  try {
    const appJson = JSON.parse(await readFile(join(projectRoot, "app.json"), "utf8")) as {expo?: {extra?: {eas?: {projectId?: unknown}}}};
    return typeof appJson.expo?.extra?.eas?.projectId === "string" ? appJson.expo.extra.eas.projectId : undefined;
  } catch {
    return undefined;
  }
}

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Audit local Mint app readiness.")
    .option("--json", "Render machine-readable output.")
    .action(async (options: DoctorOptions) => {
      const projectRoot = process.cwd();
      const localChecks = await runLocalPreflight(execaCommandRunner);
      const state = await readConnectState(projectRoot);
      const env = await readEnvFileValues(projectRoot, ".env.local");
      const scripts = await inspectScripts(projectRoot);
      const appShell = await inspectGeneratedAppShell(projectRoot);
      const easProjectId = await readEasProjectId(projectRoot);

      const hasQualityScripts = ["typecheck", "lint", "test", "server:dev", "server:typecheck"].every(
        script => scripts.scripts[script],
      );
      const providers = [
        providerCheck(
          "supabase",
          "Supabase",
          providerConnected(state, ["supabase"]) && Boolean(env.EXPO_PUBLIC_SUPABASE_URL),
          "Project state and Expo public env are present",
          "Run mint new <app-name> to create or repair the app setup",
        ),
        providerCheck(
          "revenuecat",
          "RevenueCat",
          providerConnected(state, ["revenuecat"]) &&
            Boolean(env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY),
          "SDK keys are present in app env",
          "Run mint new <app-name> to create RevenueCat resources",
        ),
        providerCheck(
          "posthog",
          "PostHog",
          providerConnected(state, ["posthog"]) && Boolean(env.EXPO_PUBLIC_POSTHOG_KEY),
          "Project token is present in app env",
          "Run mint new <app-name> to create a PostHog project",
        ),
        providerCheck(
          "eas",
          "Expo/EAS",
          providerConnected(state, ["expo", "eas"]) && Boolean(easProjectId),
          easProjectId ? `EAS project ${easProjectId}` : "EAS project is linked",
          "Run mint new <app-name> to create/link the EAS project",
        ),
      ];

      const localOk = localChecks.every(check => check.status === "ok");
      const providersOk = providers.every(check => check.status === "ok");
      const nextCommand =
        appShell.status === "ok" && providersOk && hasQualityScripts
          ? "pnpm install && pnpm typecheck && pnpm lint && pnpm test"
          : "mint new <app-name>";

      const model: MintFlowModel = {
        productName: "Mint",
        command: "doctor",
        title: "Doctor",
        subtitle: "Current directory app readiness | One-command setup repair",
        stack: [
          ...localChecks,
          ...providers,
          {
            key: "expo",
            label: "Quality scripts",
            status: hasQualityScripts ? "ok" : scripts.hasPackageJson ? "missing" : "next",
            detail: hasQualityScripts
              ? "typecheck, lint, test, and server scripts are present"
              : "Generated app package scripts not found",
          },
        ],
        steps: [
          {label: "Local tools", status: localOk ? "ok" : "missing"},
          {label: "Generated app shell", status: appShell.status},
          {label: "Provider resources", status: providersOk ? "ok" : "missing"},
          {label: "Formatting, linting, and tests", status: hasQualityScripts ? "ok" : "missing"},
        ],
        nextCommand,
      };

      process.stdout.write(options.json ? renderJson(model) : renderText(model));
    });
}
