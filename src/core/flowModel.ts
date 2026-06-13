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

type NewFlowOptions = {
  connect?: boolean | undefined;
};

function createIntegratedStack(): ProviderCheck[] {
  return [
    {key: "expo", label: "Expo SDK 56", status: "ok", detail: "Pinned template target"},
    {
      key: "supabase",
      label: "Supabase",
      status: "next",
      detail: "Mint will stage project settings before apply",
    },
    {
      key: "revenuecat",
      label: "RevenueCat",
      status: "next",
      detail: "Mint will stage products and SDK keys before apply",
    },
    {
      key: "posthog",
      label: "PostHog",
      status: "next",
      detail: "Mint will stage analytics settings before apply",
    },
    {
      key: "eas",
      label: "EAS",
      status: "next",
      detail: "Mint will stage build config before apply",
    },
  ];
}

function createRepairStack(): ProviderCheck[] {
  return [
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
  ];
}

export function createNewFlowModel(appName: string, localChecks: ProviderCheck[] = [], options: NewFlowOptions = {}): MintFlowModel {
  const connect = options.connect ?? true;
  const model: MintFlowModel = {
    productName: "Mint",
    command: "new",
    appName,
    title: appName,
    subtitle: "Expo SDK 56 | Supabase | RevenueCat | PostHog | EAS",
    stack: [...localChecks, ...(connect ? createIntegratedStack() : createRepairStack())],
    steps: connect
      ? [
          {label: "Create app shell", status: "active"},
          {label: "Collect provider access", status: "next"},
          {label: "Validate every provider", status: "next"},
          {label: "Apply resources together", status: "next"},
          {label: "Rollback on failure", status: "next"},
          {label: "Run doctor", status: "next"},
          {label: "Ship build", status: "next"},
        ]
      : [
          {label: "Create app shell", status: "active"},
          {label: "Leave services repairable", status: "next"},
          {label: "Run doctor", status: "next"},
          {label: "Ship build", status: "next"},
        ],
  };

  if (!connect) {
    model.nextCommand = "mint connect";
  }

  return model;
}
