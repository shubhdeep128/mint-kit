export type ProviderKey = "expo" | "supabase" | "revenuecat" | "posthog" | "eas";
export type LocalCheckKey = "node" | "pnpm" | "git";
export type CheckKey = ProviderKey | LocalCheckKey;

export type CheckStatus = "ok" | "missing" | "active" | "next" | "skipped" | "failed";

export type ProviderCheck = {
  key: CheckKey;
  label: string;
  status: CheckStatus;
  detail: string;
  repairCommand?: string | undefined;
};

export type SetupStep = {
  label: string;
  status: CheckStatus;
};

export type MintFlowModel = {
  productName: "Mint";
  command: "new" | "connect" | "doctor" | "ship";
  appName?: string;
  title: string;
  subtitle: string;
  stack: ProviderCheck[];
  steps: SetupStep[];
  nextCommand?: string;
};

export function createNewFlowModel(appName: string, localChecks: ProviderCheck[] = []): MintFlowModel {
  return {
    productName: "Mint",
    command: "new",
    appName,
    title: appName,
    subtitle: "Expo SDK 56 | Supabase | RevenueCat | PostHog | EAS",
    stack: [
      ...localChecks,
      {key: "expo", label: "Expo SDK 56", status: "ok", detail: "Pinned template target"},
      {
        key: "supabase",
        label: "Supabase",
        status: "missing",
        detail: "Connection required",
        repairCommand: "mint connect supabase",
      },
      {
        key: "revenuecat",
        label: "RevenueCat",
        status: "missing",
        detail: "API key required",
        repairCommand: "mint connect revenuecat",
      },
      {
        key: "posthog",
        label: "PostHog",
        status: "missing",
        detail: "Project token required",
        repairCommand: "mint connect posthog",
      },
      {
        key: "eas",
        label: "EAS",
        status: "next",
        detail: "Configured after app creation",
        repairCommand: "mint connect expo",
      },
    ],
    steps: [
      {label: "Create app shell", status: "active"},
      {label: "Connect services", status: "next"},
      {label: "Run doctor", status: "next"},
      {label: "Ship build", status: "next"},
    ],
    nextCommand: "mint connect",
  };
}
