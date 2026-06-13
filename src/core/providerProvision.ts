import {readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createBundleIdentifier} from "./appScaffold.js";
import type {CommandRunner} from "./commandRunner.js";
import {readEnvFileValues, upsertEnvFile} from "./envFile.js";
import {markProvider, readConnectState} from "../state/connectState.js";

export type ProviderProvisionProgress = {
  label: string;
  detail?: string | undefined;
};

export type ProviderAccessValidation = {
  ok: boolean;
  message: string;
  details: string[];
  nextSteps: string[];
};

export type ProviderRollbackResult = {
  provider: "revenuecat" | "posthog" | "expo";
  attempted: boolean;
  success: boolean;
  details: string[];
};

export type ProviderRollbackTask = {
  provider: "revenuecat" | "posthog" | "expo";
  label: string;
  run: () => Promise<ProviderRollbackResult>;
};

export type ProviderProvisionResult = {
  provider: "revenuecat" | "posthog" | "expo";
  connected: boolean;
  message: string;
  details: string[];
  nextSteps: string[];
  rollback?: ProviderRollbackTask | undefined;
};

type ProvisionInput = {
  appRoot: string;
  credentialsRoot: string;
  appName: string;
  onProgress?: ((progress: ProviderProvisionProgress) => void) | undefined;
};

type ValidationInput = {
  credentialsRoot: string;
  envFile?: string | undefined;
  credentialOverrides?: Record<string, string | undefined> | undefined;
  onProgress?: ((progress: ProviderProvisionProgress) => void) | undefined;
};

type RevenueCatProvisionInput = ProvisionInput & {
  fetchFn?: typeof fetch | undefined;
};

type PostHogProvisionInput = ProvisionInput & {
  fetchFn?: typeof fetch | undefined;
};

type EasProvisionInput = ProvisionInput & {
  runner: CommandRunner;
};

type EasValidationInput = ValidationInput & {
  runner: CommandRunner;
};

type RevenueCatCreatedApp = {
  appId: string;
  publicKey: string;
};

type RevenueCatCreatedResources = {
  apiKey: string;
  projectId: string;
  ios?: RevenueCatCreatedApp | undefined;
  android?: RevenueCatCreatedApp | undefined;
  fetchFn: typeof fetch;
};

type PostHogCreatedResources = {
  apiKey: string;
  host: string;
  organizationId: string;
  projectId: string;
  fetchFn: typeof fetch;
};

function reportProgress(input: {onProgress?: ((progress: ProviderProvisionProgress) => void) | undefined}, label: string, detail?: string): void {
  input.onProgress?.({label, detail});
}

function cleanHost(host: string): string {
  return host.replace(/\/$/, "");
}

async function readCredential(
  root: string,
  name: string,
  envFile = ".env.local",
  overrides?: Record<string, string | undefined> | undefined,
): Promise<string | undefined> {
  const envValues = await readEnvFileValues(root, envFile);
  return overrides?.[name] || process.env[name] || envValues[name] || undefined;
}

async function readOptionalCredential(
  root: string,
  names: string[],
  envFile = ".env.local",
  overrides?: Record<string, string | undefined> | undefined,
): Promise<string | undefined> {
  for (const name of names) {
    const value = await readCredential(root, name, envFile, overrides);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function requireString(value: unknown, fallback?: string): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function httpJson(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<{ok: boolean; status: number; data: unknown; text: string}> {
  const response = await fetchFn(url, init);
  const text = await response.text();
  let data: unknown = undefined;

  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
  };
}

function authHeaders(apiKey: string, contentType = false): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(contentType ? {"Content-Type": "application/json"} : {}),
  };
}

function revenueCatCredentialKind(apiKey: string): "secret" | "oauth" | "public" | "unknown" {
  if (apiKey.startsWith("sk_")) {
    return "secret";
  }

  if (apiKey.startsWith("atk_")) {
    return "oauth";
  }

  if (/^(appl|goog|amzn|rcb|rcb_sb|stripe)_/.test(apiKey)) {
    return "public";
  }

  return "unknown";
}

function revenueCatAuthFailureDetails(status: number, text: string): {details: string[]; nextSteps: string[]} {
  if (status === 401) {
    return {
      details: [
        "RevenueCat rejected this credential as invalid for REST API v2.",
        "Mint needs a RevenueCat API v2 secret key (`sk_...`) or OAuth token (`atk_...`), not an SDK public key.",
        text,
      ].filter(Boolean),
      nextSteps: [
        "Create a RevenueCat API v2 secret key with project configuration read/write permissions.",
        "Run mint connect revenuecat --api-key <sk_...>",
      ],
    };
  }

  if (status === 403) {
    return {
      details: [
        "RevenueCat accepted the credential, but it does not have the required project configuration permission.",
        "Project creation requires project_configuration:projects:read_write.",
        text,
      ].filter(Boolean),
      nextSteps: [
        "Create or update a RevenueCat API v2 secret key with project_configuration:projects:read_write.",
        "Run mint connect revenuecat --api-key <sk_...>",
      ],
    };
  }

  return {
    details: [`HTTP ${status}`, text].filter(Boolean),
    nextSteps: ["Use a RevenueCat API v2 secret key with project configuration permissions."],
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function listItems(value: unknown): unknown[] {
  const record = objectValue(value);
  return Array.isArray(record.items) ? record.items : Array.isArray(record.results) ? record.results : [];
}

function extractRevenueCatProjectId(value: unknown): string | undefined {
  const record = objectValue(value);
  return requireString(record.id) ?? requireString(objectValue(record.project).id);
}

function extractRevenueCatAppId(value: unknown): string | undefined {
  const record = objectValue(value);
  return requireString(record.id) ?? requireString(objectValue(record.app).id);
}

function extractRevenueCatPublicKey(value: unknown): string | undefined {
  for (const item of listItems(value)) {
    const record = objectValue(item);
    const key = requireString(record.key);

    if (key) {
      return key;
    }
  }

  const record = objectValue(value);
  return requireString(record.key);
}

function extractPostHogOrgId(value: unknown): string | undefined {
  const record = objectValue(value);
  return requireString(record.id) ?? requireString(objectValue(record.organization).id);
}

function extractPostHogProjectId(value: unknown): string | undefined {
  const record = objectValue(value);

  if (typeof record.id === "number") {
    return String(record.id);
  }

  if (typeof record.project_id === "number") {
    return String(record.project_id);
  }

  return requireString(record.id) ?? requireString(record.project_id);
}

function extractPostHogProjectToken(value: unknown): string | undefined {
  const record = objectValue(value);
  return (
    requireString(record.api_token) ??
    requireString(record.project_api_key) ??
    requireString(record.token) ??
    requireString(record.apiKey)
  );
}

async function readEasProjectId(appRoot: string): Promise<string | undefined> {
  try {
    const raw = await readFile(join(appRoot, "app.json"), "utf8");
    const parsed = JSON.parse(raw) as {expo?: {extra?: {eas?: {projectId?: unknown}}}};
    return typeof parsed.expo?.extra?.eas?.projectId === "string" ? parsed.expo.extra.eas.projectId : undefined;
  } catch {
    return undefined;
  }
}

async function removeLocalEasProjectId(appRoot: string): Promise<boolean> {
  try {
    const appJsonPath = join(appRoot, "app.json");
    const raw = await readFile(appJsonPath, "utf8");
    const parsed = JSON.parse(raw) as {expo?: {extra?: {eas?: {projectId?: unknown}}}};

    if (!parsed.expo?.extra?.eas?.projectId) {
      return true;
    }

    delete parsed.expo.extra.eas.projectId;
    if (Object.keys(parsed.expo.extra.eas).length === 0) {
      delete parsed.expo.extra.eas;
    }
    if (parsed.expo.extra && Object.keys(parsed.expo.extra).length === 0) {
      delete parsed.expo.extra;
    }

    await writeFile(appJsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

async function validateRevenueCatApiKey(
  input: ValidationInput & {fetchFn?: typeof fetch | undefined},
): Promise<ProviderAccessValidation> {
  const apiKey = await readCredential(
    input.credentialsRoot,
    "REVENUECAT_API_KEY",
    input.envFile,
    input.credentialOverrides,
  );
  const fetchFn = input.fetchFn ?? fetch;

  if (!apiKey) {
    return {
      ok: false,
      message: "RevenueCat API key is missing.",
      details: ["Mint needs REVENUECAT_API_KEY before it can create a RevenueCat project."],
      nextSteps: ["mint connect revenuecat"],
    };
  }

  const kind = revenueCatCredentialKind(apiKey);

  if (kind === "public") {
    return {
      ok: false,
      message: "RevenueCat SDK public key cannot manage projects.",
      details: [
        "The value looks like a public SDK key. Mint needs a RevenueCat API v2 secret key (`sk_...`) or OAuth token (`atk_...`).",
      ],
      nextSteps: ["Create a RevenueCat API v2 secret key", "Run mint connect revenuecat --api-key <sk_...>"],
    };
  }

  if (kind === "unknown") {
    return {
      ok: false,
      message: "RevenueCat credential format is not recognized.",
      details: [
        "RevenueCat API v2 secret keys start with `sk_`; RevenueCat OAuth access tokens start with `atk_`.",
        "Mint will not start provider apply with an unknown RevenueCat credential shape.",
      ],
      nextSteps: ["Create a RevenueCat API v2 secret key", "Run mint connect revenuecat --api-key <sk_...>"],
    };
  }

  reportProgress(input, "RevenueCat: Validating API key", "GET /v2/projects?limit=1");
  const result = await httpJson(fetchFn, "https://api.revenuecat.com/v2/projects?limit=1", {
    method: "GET",
    headers: authHeaders(apiKey),
  });

  if (!result.ok) {
    const failure = revenueCatAuthFailureDetails(result.status, result.text);
    return {
      ok: false,
      message: "RevenueCat API key did not validate.",
      details: failure.details,
      nextSteps: failure.nextSteps,
    };
  }

  return {
    ok: true,
    message: "RevenueCat API v2 credential validated.",
    details: [
      "RevenueCat project API is reachable.",
      "Mint will use project_configuration:projects:read_write during apply.",
    ],
    nextSteps: [],
  };
}

export async function validateRevenueCatAccess(
  input: ValidationInput & {fetchFn?: typeof fetch | undefined},
): Promise<ProviderAccessValidation> {
  return validateRevenueCatApiKey(input);
}

export async function validatePostHogAccess(
  input: ValidationInput & {fetchFn?: typeof fetch | undefined},
): Promise<ProviderAccessValidation> {
  const apiKey = await readCredential(
    input.credentialsRoot,
    "POSTHOG_PERSONAL_API_KEY",
    input.envFile,
    input.credentialOverrides,
  );
  const host = cleanHost(
    (await readOptionalCredential(
      input.credentialsRoot,
      ["POSTHOG_HOST", "POSTHOG_API_HOST"],
      input.envFile,
      input.credentialOverrides,
    )) ??
      "https://us.posthog.com",
  );
  const fetchFn = input.fetchFn ?? fetch;

  if (!apiKey) {
    return {
      ok: false,
      message: "PostHog personal API key is missing.",
      details: ["Mint needs POSTHOG_PERSONAL_API_KEY before it can create a PostHog project."],
      nextSteps: ["mint connect posthog"],
    };
  }

  reportProgress(input, "PostHog: Validating organization", `${host}/api/organizations/@current`);
  const org = await httpJson(fetchFn, `${host}/api/organizations/@current`, {
    method: "GET",
    headers: authHeaders(apiKey),
  });

  if (!org.ok) {
    return {
      ok: false,
      message: "PostHog API key did not validate.",
      details: [`HTTP ${org.status}`, org.text].filter(Boolean),
      nextSteps: ["Check POSTHOG_PERSONAL_API_KEY and POSTHOG_HOST."],
    };
  }

  const organizationId = extractPostHogOrgId(org.data);

  if (!organizationId) {
    return {
      ok: false,
      message: "PostHog organization lookup did not return an organization id.",
      details: [org.text],
      nextSteps: ["Check the PostHog host and API key scopes."],
    };
  }

  reportProgress(input, "PostHog: Validating project access", `${host}/api/organizations/${organizationId}/projects/`);
  const projects = await httpJson(fetchFn, `${host}/api/organizations/${organizationId}/projects/?limit=1`, {
    method: "GET",
    headers: authHeaders(apiKey),
  });

  if (!projects.ok) {
    return {
      ok: false,
      message: "PostHog project API did not validate.",
      details: [`HTTP ${projects.status}`, projects.text].filter(Boolean),
      nextSteps: ["Use a PostHog personal API key with project read/write permissions."],
    };
  }

  return {
    ok: true,
    message: "PostHog API key validated.",
    details: [`Organization: ${organizationId}`, `Host: ${host}`],
    nextSteps: [],
  };
}

export async function validateEasAccess(input: EasValidationInput): Promise<ProviderAccessValidation> {
  const expoToken = await readCredential(input.credentialsRoot, "EXPO_TOKEN", input.envFile, input.credentialOverrides);

  if (!expoToken) {
    return {
      ok: false,
      message: "Expo token is missing.",
      details: ["Mint needs EXPO_TOKEN before it can create an EAS project."],
      nextSteps: ["mint connect expo"],
    };
  }

  reportProgress(input, "EAS: Validating Expo token", "npx --yes eas-cli account:view");
  const result = await input.runner.run("npx", ["--yes", "eas-cli", "account:view"], {
    env: {
      EXPO_TOKEN: expoToken,
    },
  });

  if (result.exitCode !== 0) {
    return {
      ok: false,
      message: "Expo token did not validate with EAS CLI.",
      details: [result.stderr || result.stdout || "eas-cli account:view failed"],
      nextSteps: ["Create an Expo access token and run mint connect expo again."],
    };
  }

  return {
    ok: true,
    message: "Expo/EAS token validated.",
    details: [result.stdout.trim() ? `Account: ${result.stdout.trim()}` : "EAS CLI accepted EXPO_TOKEN."],
    nextSteps: [],
  };
}

async function deleteRevenueCatApp(
  fetchFn: typeof fetch,
  apiKey: string,
  projectId: string,
  appId: string,
): Promise<{success: boolean; detail: string}> {
  const result = await httpJson(fetchFn, `https://api.revenuecat.com/v2/projects/${projectId}/apps/${appId}`, {
    method: "DELETE",
    headers: authHeaders(apiKey),
  });

  return {
    success: result.ok,
    detail: result.ok ? `Deleted RevenueCat app ${appId}` : `Failed deleting RevenueCat app ${appId}: HTTP ${result.status} ${result.text}`,
  };
}

function createRevenueCatRollback(resources: RevenueCatCreatedResources): ProviderRollbackTask {
  return {
    provider: "revenuecat",
    label: "Delete RevenueCat apps created by Mint",
    async run() {
      const appIds = [resources.ios?.appId, resources.android?.appId].filter((appId): appId is string => Boolean(appId));

      if (appIds.length === 0) {
        return {
          provider: "revenuecat",
          attempted: false,
          success: true,
          details: ["No RevenueCat apps were created before failure."],
        };
      }

      const results = await Promise.all(
        appIds.map(appId => deleteRevenueCatApp(resources.fetchFn, resources.apiKey, resources.projectId, appId)),
      );

      return {
        provider: "revenuecat",
        attempted: true,
        success: results.every(result => result.success),
        details: [
          ...results.map(result => result.detail),
          "RevenueCat does not expose a documented project delete endpoint in API v2; delete the empty project manually if needed.",
        ],
      };
    },
  };
}

function createPostHogRollback(resources: PostHogCreatedResources): ProviderRollbackTask {
  return {
    provider: "posthog",
    label: "Delete PostHog project created by Mint",
    async run() {
      const result = await httpJson(
        resources.fetchFn,
        `${cleanHost(resources.host)}/api/organizations/${resources.organizationId}/projects/${resources.projectId}/`,
        {
          method: "DELETE",
          headers: authHeaders(resources.apiKey),
        },
      );

      return {
        provider: "posthog",
        attempted: true,
        success: result.ok,
        details: [
          result.ok
            ? `Deleted PostHog project ${resources.projectId}`
            : `Failed deleting PostHog project ${resources.projectId}: HTTP ${result.status} ${result.text}`,
        ],
      };
    },
  };
}

function createEasRollback(appRoot: string, projectId?: string | undefined): ProviderRollbackTask {
  return {
    provider: "expo",
    label: "Remove local EAS project link",
    async run() {
      const success = await removeLocalEasProjectId(appRoot);

      return {
        provider: "expo",
        attempted: true,
        success,
        details: [
          success ? "Removed local EAS project id from app.json." : "Could not remove local EAS project id from app.json.",
          projectId
            ? `EAS project ${projectId} may still exist remotely; EAS CLI does not document a project delete command.`
            : "No EAS project id was recorded.",
        ],
      };
    },
  };
}

export async function provisionRevenueCat(input: RevenueCatProvisionInput): Promise<ProviderProvisionResult> {
  const state = await readConnectState(input.appRoot);
  const env = await readEnvFileValues(input.appRoot, ".env.local");

  if (
    state.providers.some(provider => provider.key === "revenuecat" && provider.status === "connected") &&
    (env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY)
  ) {
    return {
      provider: "revenuecat",
      connected: true,
      message: "RevenueCat is already configured for this app.",
      details: ["RevenueCat public SDK keys are present in app env."],
      nextSteps: [],
    };
  }

  const apiKey = await readCredential(input.credentialsRoot, "REVENUECAT_API_KEY");
  const fetchFn = input.fetchFn ?? fetch;

  if (!apiKey) {
    return {
      provider: "revenuecat",
      connected: false,
      message: "RevenueCat API key is missing.",
      details: ["Run mint connect revenuecat from the parent workspace, then retry mint new."],
      nextSteps: ["mint connect revenuecat"],
    };
  }

  const appIdentifier = createBundleIdentifier(input.appName);
  const revenueCatApiKey = apiKey;
  let projectId: string | undefined;
  let ios: RevenueCatCreatedApp | undefined;
  let android: RevenueCatCreatedApp | undefined;

  reportProgress(input, "RevenueCat: Creating project", input.appName);
  const project = await httpJson(fetchFn, "https://api.revenuecat.com/v2/projects", {
    method: "POST",
    headers: authHeaders(revenueCatApiKey, true),
    body: JSON.stringify({name: input.appName}),
  });

  if (!project.ok) {
    const failure = revenueCatAuthFailureDetails(project.status, project.text);
    return {
      provider: "revenuecat",
      connected: false,
      message: "RevenueCat project creation failed.",
      details: failure.details,
      nextSteps: failure.nextSteps,
    };
  }

  projectId = extractRevenueCatProjectId(project.data);

  if (!projectId) {
    return {
      provider: "revenuecat",
      connected: false,
      message: "RevenueCat project was created, but Mint could not read the project id.",
      details: [project.text],
      nextSteps: ["Open RevenueCat and copy SDK keys into .env.local manually."],
    };
  }

  async function createApp(name: string, type: "app_store" | "play_store"): Promise<RevenueCatCreatedApp> {
    const platformBody =
      type === "app_store" ? {app_store: {bundle_id: appIdentifier}} : {play_store: {package_name: appIdentifier}};

    reportProgress(input, `RevenueCat: Creating ${type} app`, name);
    const app = await httpJson(fetchFn, `https://api.revenuecat.com/v2/projects/${projectId}/apps`, {
      method: "POST",
      headers: authHeaders(revenueCatApiKey, true),
      body: JSON.stringify({name, type, ...platformBody}),
    });

    if (!app.ok) {
      throw new Error(`RevenueCat ${type} app creation failed: HTTP ${app.status} ${app.text}`);
    }

    const appId = extractRevenueCatAppId(app.data);
    if (!appId) {
      throw new Error(`RevenueCat ${type} app created, but response did not include an app id.`);
    }

    reportProgress(input, `RevenueCat: Fetching ${type} SDK key`, appId);
    const keys = await httpJson(fetchFn, `https://api.revenuecat.com/v2/projects/${projectId}/apps/${appId}/public_api_keys`, {
      method: "GET",
      headers: authHeaders(revenueCatApiKey),
    });

    if (!keys.ok) {
      throw new Error(`RevenueCat ${type} public SDK key fetch failed: HTTP ${keys.status} ${keys.text}`);
    }

    const publicKey = extractRevenueCatPublicKey(keys.data);
    if (!publicKey) {
      throw new Error(`RevenueCat ${type} public SDK key response did not include a key.`);
    }

    return {appId, publicKey};
  }

  try {
    ios = await createApp(`${input.appName} iOS`, "app_store");
    android = await createApp(`${input.appName} Android`, "play_store");

    reportProgress(input, "RevenueCat: Writing SDK env", ".env.local");
    const envResult = await upsertEnvFile(input.appRoot, ".env.local", {
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: ios.publicKey,
      EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: android.publicKey,
    });
    await markProvider(input.appRoot, "revenuecat", "connected", {
      projectId,
      iosAppId: ios.appId,
      androidAppId: android.appId,
      envFile: envResult.path,
      variables: envResult.variables,
    });

    return {
      provider: "revenuecat",
      connected: true,
      message: "RevenueCat project, apps, and SDK keys configured.",
      details: [`Project: ${projectId}`, `iOS app: ${ios.appId}`, `Android app: ${android.appId}`],
      nextSteps: [],
      rollback: createRevenueCatRollback({apiKey: revenueCatApiKey, projectId, ios, android, fetchFn}),
    };
  } catch (error) {
    const rollback = createRevenueCatRollback({apiKey: revenueCatApiKey, projectId, ios, android, fetchFn});
    const cleanup = await rollback.run();

    return {
      provider: "revenuecat",
      connected: false,
      message: "RevenueCat setup failed after project creation.",
      details: [
        error instanceof Error ? error.message : "Unknown RevenueCat setup failure",
        `Project: ${projectId}`,
        ...cleanup.details,
      ].filter((detail): detail is string => Boolean(detail)),
      nextSteps: cleanup.success
        ? ["Retry mint new after fixing the RevenueCat error above."]
        : ["Open RevenueCat and delete the partial project/apps if needed, then retry."],
    };
  }
}

export async function provisionPostHog(input: PostHogProvisionInput): Promise<ProviderProvisionResult> {
  const state = await readConnectState(input.appRoot);
  const env = await readEnvFileValues(input.appRoot, ".env.local");

  if (
    state.providers.some(provider => provider.key === "posthog" && provider.status === "connected") &&
    env.EXPO_PUBLIC_POSTHOG_KEY
  ) {
    return {
      provider: "posthog",
      connected: true,
      message: "PostHog is already configured for this app.",
      details: ["PostHog public project key is present in app env."],
      nextSteps: [],
    };
  }

  const apiKey = await readCredential(input.credentialsRoot, "POSTHOG_PERSONAL_API_KEY");
  const host = cleanHost((await readOptionalCredential(input.credentialsRoot, ["POSTHOG_HOST", "POSTHOG_API_HOST"])) ?? "https://us.posthog.com");
  const fetchFn = input.fetchFn ?? fetch;

  if (!apiKey) {
    return {
      provider: "posthog",
      connected: false,
      message: "PostHog personal API key is missing.",
      details: ["Run mint connect posthog from the parent workspace, then retry mint new."],
      nextSteps: ["mint connect posthog"],
    };
  }

  reportProgress(input, "PostHog: Reading organization", `${host}/api/organizations/@current`);
  const org = await httpJson(fetchFn, `${host}/api/organizations/@current`, {
    method: "GET",
    headers: authHeaders(apiKey),
  });

  if (!org.ok) {
    return {
      provider: "posthog",
      connected: false,
      message: "PostHog organization lookup failed.",
      details: [`HTTP ${org.status}`, org.text].filter(Boolean),
      nextSteps: ["Check PostHog personal API key and host."],
    };
  }

  const organizationId = extractPostHogOrgId(org.data);

  if (!organizationId) {
    return {
      provider: "posthog",
      connected: false,
      message: "PostHog organization lookup did not return an organization id.",
      details: [org.text],
      nextSteps: ["Set POSTHOG_HOST if your workspace is not on https://us.posthog.com."],
    };
  }

  reportProgress(input, "PostHog: Creating project", input.appName);
  const project = await httpJson(fetchFn, `${host}/api/organizations/${organizationId}/projects/`, {
    method: "POST",
    headers: authHeaders(apiKey, true),
    body: JSON.stringify({name: input.appName}),
  });

  if (!project.ok) {
    return {
      provider: "posthog",
      connected: false,
      message: "PostHog project creation failed.",
      details: [`HTTP ${project.status}`, project.text].filter(Boolean),
      nextSteps: ["Check PostHog personal API key project write permissions."],
    };
  }

  const projectId = extractPostHogProjectId(project.data);
  let projectToken = extractPostHogProjectToken(project.data);

  if (projectId && !projectToken) {
    reportProgress(input, "PostHog: Fetching project token", projectId);
    const detail = await httpJson(fetchFn, `${host}/api/organizations/${organizationId}/projects/${projectId}/`, {
      method: "GET",
      headers: authHeaders(apiKey),
    });
    if (detail.ok) {
      projectToken = extractPostHogProjectToken(detail.data);
    }
  }

  if (!projectId || !projectToken) {
    const rollback = projectId ? createPostHogRollback({apiKey, host, organizationId, projectId, fetchFn}) : undefined;
    const cleanup = rollback ? await rollback.run() : undefined;

    return {
      provider: "posthog",
      connected: false,
      message: "PostHog project was created, but Mint could not read its project token.",
      details: [project.text, ...(cleanup?.details ?? [])].filter((detail): detail is string => Boolean(detail)),
      nextSteps: cleanup?.success
        ? ["Retry mint new after fixing the PostHog token response issue."]
        : ["Open PostHog project settings and copy the project API key into .env.local."],
    };
  }

  reportProgress(input, "PostHog: Writing project env", ".env.local");
  const envResult = await upsertEnvFile(input.appRoot, ".env.local", {
    EXPO_PUBLIC_POSTHOG_KEY: projectToken,
    EXPO_PUBLIC_POSTHOG_HOST: host,
  });
  await markProvider(input.appRoot, "posthog", "connected", {
    projectId,
    organizationId,
    host,
    envFile: envResult.path,
    variables: envResult.variables,
  });

  return {
    provider: "posthog",
    connected: true,
    message: "PostHog project and client env configured.",
    details: [`Project: ${projectId}`, `Host: ${host}`],
    nextSteps: [],
    rollback: createPostHogRollback({apiKey, host, organizationId, projectId, fetchFn}),
  };
}

export async function provisionEas(input: EasProvisionInput): Promise<ProviderProvisionResult> {
  const state = await readConnectState(input.appRoot);
  const existingProjectId = await readEasProjectId(input.appRoot);

  if (state.providers.some(provider => provider.key === "expo" && provider.status === "connected") && existingProjectId) {
    return {
      provider: "expo",
      connected: true,
      message: "Expo/EAS is already configured for this app.",
      details: [`EAS project: ${existingProjectId}`],
      nextSteps: [],
    };
  }

  const expoToken = await readCredential(input.credentialsRoot, "EXPO_TOKEN");

  if (!expoToken) {
    return {
      provider: "expo",
      connected: false,
      message: "Expo token is missing.",
      details: ["Run mint connect expo from the parent workspace, then retry mint new."],
      nextSteps: ["mint connect expo"],
    };
  }

  reportProgress(input, "EAS: Creating/linking Expo project", "npx --yes eas-cli project:init --non-interactive --force");
  const result = await input.runner.run(
    "npx",
    ["--yes", "eas-cli", "project:init", "--non-interactive", "--force"],
    {
      cwd: input.appRoot,
      env: {
        EXPO_TOKEN: expoToken,
      },
    },
  );

  if (result.exitCode !== 0) {
    return {
      provider: "expo",
      connected: false,
      message: "EAS project initialization failed.",
      details: [result.stderr || result.stdout || "eas-cli project:init failed"],
      nextSteps: ["Check EXPO_TOKEN permissions, then retry mint new."],
    };
  }

  const projectId = await readEasProjectId(input.appRoot);

  await markProvider(input.appRoot, "expo", "connected", {
    projectId,
    command: "npx --yes eas-cli project:init --non-interactive --force",
  });
  await markProvider(input.appRoot, "eas", "connected", {
    projectId,
  });

  return {
    provider: "expo",
    connected: true,
    message: "Expo/EAS project initialized.",
    details: [projectId ? `EAS project: ${projectId}` : "EAS CLI completed; project id was not found in app.json."],
    nextSteps: [],
    rollback: createEasRollback(input.appRoot, projectId),
  };
}
