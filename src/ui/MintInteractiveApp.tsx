import {useMemo, useState} from "react";
import {StatusMessage} from "@inkjs/ui";
import {Box, Text, useApp, useInput} from "ink";
import {mintCommand} from "../core/commandDisplay.js";
import type {MintFlowModel, ProviderKey} from "../core/flowModel.js";
import {Frame} from "./components/Frame.js";
import {theme} from "./theme.js";

type ValidationResult = {
  ok: boolean;
  message: string;
};

type Props = {
  model: MintFlowModel;
  validateProvider?: (provider: ProviderKey) => Promise<ValidationResult>;
};

type ProviderStatus = "waiting" | "checking" | "ready" | "needs_action";

type SetupProvider = {
  key: ProviderKey;
  label: string;
  need: string;
  commandArgs: string;
  validate: string;
};

const setupProviders: SetupProvider[] = [
  {
    key: "supabase",
    label: "Supabase",
    need: "A logged-in Supabase account. Mint will create the project later, after every provider validates.",
    commandArgs: "connect supabase --login",
    validate: "After login succeeds, come back here and press Enter.",
  },
  {
    key: "revenuecat",
    label: "RevenueCat",
    need: "RevenueCat API access and app SDK keys.",
    commandArgs: "connect revenuecat",
    validate: "After the connector succeeds, come back here and press Enter.",
  },
  {
    key: "posthog",
    label: "PostHog",
    need: "PostHog project access and client token.",
    commandArgs: "connect posthog",
    validate: "After the connector succeeds, come back here and press Enter.",
  },
  {
    key: "eas",
    label: "Expo/EAS",
    need: "Expo account access for builds, credentials, and store submission.",
    commandArgs: "connect expo",
    validate: "After Expo login succeeds, come back here and press Enter.",
  },
];

function statusColor(status: ProviderStatus) {
  switch (status) {
    case "ready":
      return theme.good;
    case "checking":
      return theme.active;
    case "needs_action":
      return theme.warn;
    case "waiting":
      return theme.muted;
  }
}

function statusLabel(status: ProviderStatus): string {
  switch (status) {
    case "ready":
      return "ready";
    case "checking":
      return "checking";
    case "needs_action":
      return "needs action";
    case "waiting":
      return "waiting";
  }
}

function defaultStatusMap(): Record<ProviderKey, ProviderStatus> {
  return {
    supabase: "waiting",
    revenuecat: "waiting",
    posthog: "waiting",
    expo: "waiting",
    eas: "waiting",
  };
}

function nextUnfinishedIndex(statuses: Record<ProviderKey, ProviderStatus>, fromIndex: number): number {
  for (let index = fromIndex + 1; index < setupProviders.length; index += 1) {
    const status = statuses[setupProviders[index]!.key];

    if (status !== "ready") {
      return index;
    }
  }

  return fromIndex;
}

function providerProgress(statuses: Record<ProviderKey, ProviderStatus>): string {
  const done = setupProviders.filter(provider => statuses[provider.key] === "ready").length;
  return `${done}/${setupProviders.length}`;
}

export function MintInteractiveApp({model, validateProvider}: Props) {
  const {exit} = useApp();
  const [activeIndex, setActiveIndex] = useState(0);
  const [statuses, setStatuses] = useState<Record<ProviderKey, ProviderStatus>>(() => defaultStatusMap());
  const [message, setMessage] = useState("Run the command for this step, then press Enter to validate.");
  const activeProvider = setupProviders[activeIndex]!;
  const allDone = useMemo(
    () => setupProviders.every(provider => statuses[provider.key] === "ready"),
    [statuses],
  );

  async function validateActiveProvider() {
    if (statuses[activeProvider.key] === "checking") {
      return;
    }

    setStatuses(current => ({...current, [activeProvider.key]: "checking"}));

    const result = validateProvider
      ? await validateProvider(activeProvider.key)
      : {
          ok: false,
          message: `Run ${mintCommand(activeProvider.commandArgs)}, then press Enter here to validate again.`,
        };

    setStatuses(current => {
      const next = {...current, [activeProvider.key]: result.ok ? ("ready" as const) : ("needs_action" as const)};
      if (result.ok) {
        setActiveIndex(index => nextUnfinishedIndex(next, index));
      }

      return next;
    });
    setMessage(result.message);
  }

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (input === "b") {
      setActiveIndex(index => Math.max(0, index - 1));
      setMessage("Moved back. Run the command for this step, then press Enter to validate.");
      return;
    }

    if (key.return) {
      void validateActiveProvider();
    }
  });

  return (
    <Frame title={model.title} subtitle={model.subtitle}>
      <Box flexDirection="column" gap={1}>
        <StatusMessage variant={allDone ? "success" : "info"}>
          {allDone
            ? "All provider access is ready. Mint can apply resources together next."
            : "Setup is waiting for you. No provider resources have been created."}
        </StatusMessage>

        <Box flexDirection="column">
          <Text bold>
            Step {activeIndex + 1} of {setupProviders.length}: {activeProvider.label}
          </Text>
          <Text>
            Need: <Text color={theme.muted}>{activeProvider.need}</Text>
          </Text>
          <Text>Run this command:</Text>
          <Box paddingLeft={2}>
            <Text color={theme.accent}>{mintCommand(activeProvider.commandArgs)}</Text>
          </Box>
          <Text color={theme.muted}>{activeProvider.validate}</Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Validate</Text>
          <Text>{message}</Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Providers ({providerProgress(statuses)} ready)</Text>
          {setupProviders.map(provider => {
            const status = statuses[provider.key];
            const selected = provider.key === activeProvider.key;

            return (
              <Box key={provider.key} gap={1}>
                <Text color={selected ? theme.accent : theme.muted}>{selected ? ">" : " "}</Text>
                <Text>{provider.label}</Text>
                <Text color={statusColor(status)}>{statusLabel(status)}</Text>
              </Box>
            );
          })}
        </Box>

        <Text color={theme.muted}>Keys: Enter validate, b back, q quit</Text>
      </Box>
    </Frame>
  );
}
