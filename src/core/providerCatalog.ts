import type {ProviderKey} from "./flowModel.js";

export type ProviderDefinition = {
  key: ProviderKey;
  label: string;
  connectCommand: string;
  dashboardUrl: string;
  secretNames: string[];
};

export const providerCatalog: ProviderDefinition[] = [
  {
    key: "supabase",
    label: "Supabase",
    connectCommand: "mint connect supabase",
    dashboardUrl: "https://supabase.com/dashboard",
    secretNames: ["SUPABASE_ACCESS_TOKEN"],
  },
  {
    key: "revenuecat",
    label: "RevenueCat",
    connectCommand: "mint connect revenuecat",
    dashboardUrl: "https://app.revenuecat.com",
    secretNames: ["REVENUECAT_API_KEY"],
  },
  {
    key: "posthog",
    label: "PostHog",
    connectCommand: "mint connect posthog",
    dashboardUrl: "https://app.posthog.com",
    secretNames: ["POSTHOG_PERSONAL_API_KEY"],
  },
  {
    key: "expo",
    label: "Expo",
    connectCommand: "mint connect expo",
    dashboardUrl: "https://expo.dev",
    secretNames: ["EXPO_TOKEN"],
  },
  {
    key: "eas",
    label: "EAS",
    connectCommand: "mint connect expo",
    dashboardUrl: "https://expo.dev/accounts",
    secretNames: ["EXPO_TOKEN"],
  },
];
