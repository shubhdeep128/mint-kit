import type {ProviderKey} from "./flowModel.js";
import {readEnvFileValues, type EnvWriteResult, upsertEnvFile} from "./envFile.js";
import {connectStatePath, markProvider, readConnectState, type ConnectState} from "../state/connectState.js";

export type CredentialField = {
  envName: string;
  label: string;
  placeholder: string;
};

export type CredentialProviderSpec = {
  key: ProviderKey;
  stateKey: ProviderKey;
  label: string;
  commandArgs: string;
  fields: CredentialField[];
};

export type CredentialInspection = {
  provider: ProviderKey;
  connected: boolean;
  source?: "environment" | "env-file" | undefined;
  missing: string[];
  variables: string[];
};

export type CredentialConnectResult = {
  provider: ProviderKey;
  status: "connected" | "needs_input";
  connected: boolean;
  message: string;
  env?: EnvWriteResult | undefined;
  state?: ConnectState | undefined;
  statePath?: string | undefined;
  variables: string[];
  missing: string[];
  nextSteps: string[];
};

const credentialProviderSpecs: Record<string, CredentialProviderSpec> = {
  revenuecat: {
    key: "revenuecat",
    stateKey: "revenuecat",
    label: "RevenueCat",
    commandArgs: "connect revenuecat",
    fields: [
      {
        envName: "REVENUECAT_API_KEY",
        label: "RevenueCat API key",
        placeholder: "Paste RevenueCat API key",
      },
    ],
  },
  posthog: {
    key: "posthog",
    stateKey: "posthog",
    label: "PostHog",
    commandArgs: "connect posthog",
    fields: [
      {
        envName: "POSTHOG_PERSONAL_API_KEY",
        label: "PostHog personal API key",
        placeholder: "Paste PostHog personal API key",
      },
    ],
  },
  expo: {
    key: "expo",
    stateKey: "expo",
    label: "Expo/EAS",
    commandArgs: "connect expo",
    fields: [
      {
        envName: "EXPO_TOKEN",
        label: "Expo access token",
        placeholder: "Paste Expo access token",
      },
    ],
  },
  eas: {
    key: "eas",
    stateKey: "expo",
    label: "Expo/EAS",
    commandArgs: "connect expo",
    fields: [
      {
        envName: "EXPO_TOKEN",
        label: "Expo access token",
        placeholder: "Paste Expo access token",
      },
    ],
  },
};

export function getCredentialProviderSpec(provider: ProviderKey): CredentialProviderSpec | undefined {
  return credentialProviderSpecs[provider];
}

function fieldValuesFromEnv(spec: CredentialProviderSpec, envValues: Record<string, string>): Record<string, string> {
  return Object.fromEntries(spec.fields.map(field => [field.envName, process.env[field.envName] || envValues[field.envName] || ""]));
}

function missingFields(spec: CredentialProviderSpec, values: Record<string, string>): string[] {
  return spec.fields.map(field => field.envName).filter(envName => !values[envName]);
}

export async function inspectCredentialProvider(
  projectRoot: string,
  spec: CredentialProviderSpec,
  envFile = ".env.local",
): Promise<CredentialInspection> {
  const envValues = await readEnvFileValues(projectRoot, envFile);
  const values = fieldValuesFromEnv(spec, envValues);
  const missing = missingFields(spec, values);

  if (missing.length === 0) {
    const source = spec.fields.some(field => process.env[field.envName]) ? "environment" : "env-file";

    return {
      provider: spec.key,
      connected: true,
      source,
      missing: [],
      variables: spec.fields.map(field => field.envName),
    };
  }

  const state = await readConnectState(projectRoot);
  const providerState = state.providers.find(provider => provider.key === spec.stateKey && provider.status === "connected");
  const stateEnvFile = typeof providerState?.metadata?.envFile === "string" ? providerState.metadata.envFile : undefined;

  if (stateEnvFile && stateEnvFile !== envFile) {
    const stateEnvValues = await readEnvFileValues(projectRoot, stateEnvFile);
    const stateValues = fieldValuesFromEnv(spec, stateEnvValues);

    if (missingFields(spec, stateValues).length === 0) {
      return {
        provider: spec.key,
        connected: true,
        source: spec.fields.some(field => process.env[field.envName]) ? "environment" : "env-file",
        missing: [],
        variables: spec.fields.map(field => field.envName),
      };
    }
  }

  return {
    provider: spec.key,
    connected: false,
    missing,
    variables: spec.fields.map(field => field.envName),
  };
}

export async function connectCredentialProvider(
  projectRoot: string,
  spec: CredentialProviderSpec,
  values: Record<string, string>,
  envFile = ".env.local",
): Promise<CredentialConnectResult> {
  const missing = spec.fields.map(field => field.envName).filter(envName => !values[envName]?.trim());

  if (missing.length > 0) {
    return {
      provider: spec.key,
      status: "needs_input",
      connected: false,
      message: `${spec.label} is missing ${missing.join(", ")}.`,
      variables: spec.fields.map(field => field.envName),
      missing,
      nextSteps: [`Run mint ${spec.commandArgs}`],
    };
  }

  const env = await upsertEnvFile(projectRoot, envFile, values);
  const state = await markProvider(projectRoot, spec.stateKey, "connected", {
    envFile: env.path,
    variables: env.variables,
  });

  return {
    provider: spec.key,
    status: "connected",
    connected: true,
    message: `${spec.label} credentials saved. Return to mint new and press Enter to validate.`,
    env,
    state,
    statePath: connectStatePath(projectRoot),
    variables: env.variables,
    missing: [],
    nextSteps: ["Return to the setup flow", "Press Enter to validate this provider"],
  };
}
