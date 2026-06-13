import {useEffect, useState} from "react";
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

type ApplyResult = {
  ok: boolean;
  message: string;
  details?: string[] | undefined;
  nextSteps?: string[] | undefined;
};

type Props = {
  model: MintFlowModel;
  validateProvider?: (provider: ProviderKey) => Promise<ValidationResult>;
  applySetup?: () => Promise<ApplyResult>;
};

type ProviderStatus = "waiting" | "checking" | "ready" | "needs_action";
type SetupPhase = "validating" | "repair" | "applying" | "complete" | "apply_failed";

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

function providerProgress(statuses: Record<ProviderKey, ProviderStatus>): string {
  const done = setupProviders.filter(provider => statuses[provider.key] === "ready").length;
  return `${done}/${setupProviders.length}`;
}

function firstRepairIndex(statuses: Record<ProviderKey, ProviderStatus>): number {
  return Math.max(
    0,
    setupProviders.findIndex(provider => statuses[provider.key] === "needs_action"),
  );
}

export function MintInteractiveApp({model, validateProvider, applySetup}: Props) {
  const {exit} = useApp();
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<SetupPhase>("validating");
  const [statuses, setStatuses] = useState<Record<ProviderKey, ProviderStatus>>(() => defaultStatusMap());
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("Checking provider connections...");
  const [applyResult, setApplyResult] = useState<ApplyResult | undefined>();
  const activeProvider = setupProviders[activeIndex]!;

  async function runApply() {
    setPhase("applying");
    setApplyResult(undefined);
    setMessage("Applying Mint setup...");

    const result = applySetup
      ? await applySetup()
      : {
          ok: true,
          message: "Provider access validated. Apply automation is not wired in this command yet.",
          details: ["No provider resources were created."],
          nextSteps: ["Run mint doctor"],
        };

    setApplyResult(result);
    setPhase(result.ok ? "complete" : "apply_failed");
    setMessage(result.message);
  }

  async function validateProviders(providers: SetupProvider[]) {
    setPhase("validating");
    setMessage("Checking provider connections...");
    setApplyResult(undefined);
    setStatuses(current => {
      const next = {...current};
      for (const provider of providers) {
        next[provider.key] = "checking";
      }
      return next;
    });

    const results = await Promise.all(
      providers.map(async provider => {
        const result = validateProvider
          ? await validateProvider(provider.key)
          : {
              ok: false,
              message: `Run ${mintCommand(provider.commandArgs)}, then recheck this provider.`,
            };

        return {provider, result};
      }),
    );

    const resultMessages = Object.fromEntries(results.map(({provider, result}) => [provider.key, result.message]));
    const nextStatuses = results.reduce(
      (next, {provider, result}) => ({
        ...next,
        [provider.key]: result.ok ? ("ready" as const) : ("needs_action" as const),
      }),
      {...statuses},
    );

    setMessages(current => ({...current, ...resultMessages}));
    setStatuses(nextStatuses);

    if (setupProviders.every(provider => nextStatuses[provider.key] === "ready")) {
      await runApply();
      return;
    }

    const repairIndex = firstRepairIndex(nextStatuses);
    setActiveIndex(repairIndex);
    setPhase("repair");
    setMessage(resultMessages[setupProviders[repairIndex]!.key] ?? "Some providers need attention.");
  }

  async function validateActiveProvider() {
    if (statuses[activeProvider.key] === "checking") {
      return;
    }

    await validateProviders([activeProvider]);
  }

  useEffect(() => {
    void validateProviders(setupProviders);
    // Run once on mount; retries are explicit via keyboard shortcuts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectRepairProvider(direction: 1 | -1) {
    const repairProviders = setupProviders
      .map((provider, index) => ({provider, index}))
      .filter(item => statuses[item.provider.key] === "needs_action");

    if (repairProviders.length === 0) {
      return;
    }

    const currentRepairIndex = repairProviders.findIndex(item => item.index === activeIndex);
    const safeIndex = currentRepairIndex === -1 ? 0 : currentRepairIndex;
    const nextRepair = repairProviders[(safeIndex + direction + repairProviders.length) % repairProviders.length]!;
    setActiveIndex(nextRepair.index);
    setMessage(messages[nextRepair.provider.key] ?? `Run ${mintCommand(nextRepair.provider.commandArgs)}, then recheck.`);
  }

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (phase === "complete") {
      if (key.return) {
        exit();
      }

      return;
    }

    if (phase === "applying" || phase === "validating") {
      return;
    }

    if (phase === "apply_failed") {
      if (input === "r" || key.return) {
        void runApply();
        return;
      }

      if (input === "b") {
        void validateProviders(setupProviders);
        return;
      }
    }

    if (input === "r") {
      void validateProviders(setupProviders);
      return;
    }

    if (key.upArrow || input === "b") {
      selectRepairProvider(-1);
      return;
    }

    if (key.downArrow) {
      selectRepairProvider(1);
      return;
    }

    if (phase === "repair" && key.return) {
      void validateActiveProvider();
    }
  });

  const statusVariant = phase === "complete" ? "success" : phase === "repair" || phase === "apply_failed" ? "warning" : "info";
  const statusMessage =
    phase === "validating"
      ? "Auto-checking provider connections..."
      : phase === "repair"
        ? "Some provider access needs attention."
        : phase === "applying"
          ? "All providers validated. Applying Mint setup now..."
          : phase === "apply_failed"
            ? "Apply needs attention."
            : "Mint setup complete.";

  return (
    <Frame title={model.title} subtitle={model.subtitle}>
      <Box flexDirection="column" gap={1}>
        <StatusMessage variant={statusVariant}>{statusMessage}</StatusMessage>

        {phase === "complete" ? (
          <Box flexDirection="column">
            <Text bold>Done</Text>
            <Text>{applyResult?.message ?? "Mint setup finished."}</Text>
            {(applyResult?.details ?? []).map(detail => (
              <Text key={detail} color={theme.muted}>
                {detail}
              </Text>
            ))}
            {(applyResult?.nextSteps ?? []).length > 0 ? <Text bold>Next</Text> : null}
            {(applyResult?.nextSteps ?? []).map(step => (
              <Text key={step}>- {step}</Text>
            ))}
          </Box>
        ) : phase === "applying" ? (
          <Box flexDirection="column">
            <Text bold>Apply</Text>
            <Text>{message}</Text>
            <Text color={theme.muted}>Mint is creating/configuring resources. Do not close this terminal.</Text>
          </Box>
        ) : phase === "apply_failed" ? (
          <Box flexDirection="column">
            <Text bold>Apply failed</Text>
            <Text>{applyResult?.message ?? message}</Text>
            {(applyResult?.details ?? []).map(detail => (
              <Text key={detail} color={theme.muted}>
                {detail}
              </Text>
            ))}
            {(applyResult?.nextSteps ?? []).length > 0 ? <Text bold>Next</Text> : null}
            {(applyResult?.nextSteps ?? []).map(step => (
              <Text key={step}>- {step}</Text>
            ))}
          </Box>
        ) : phase === "repair" ? (
          <>
            <Box flexDirection="column">
              <Text bold>
                Repair {activeProvider.label}
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
              <Text bold>Recheck</Text>
              <Text>{message}</Text>
            </Box>
          </>
        ) : (
          <Box flexDirection="column">
            <Text bold>Validate</Text>
            <Text>{message}</Text>
            <Text color={theme.muted}>Mint is checking every provider automatically.</Text>
          </Box>
        )}

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

        <Text color={theme.muted}>
          {phase === "complete"
            ? "Keys: Enter finish, q quit"
            : phase === "repair"
              ? "Keys: Enter recheck selected, r recheck all, up/down switch, q quit"
              : phase === "apply_failed"
                ? "Keys: Enter retry apply, r retry apply, b provider checks, q quit"
                : "Keys: q quit"}
        </Text>
      </Box>
    </Frame>
  );
}
