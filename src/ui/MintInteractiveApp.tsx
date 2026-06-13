import {useMemo, useState} from "react";
import {ProgressBar, StatusMessage} from "@inkjs/ui";
import {Box, Text, useApp, useInput} from "ink";
import type {MintFlowModel} from "../core/flowModel.js";
import {Frame} from "./components/Frame.js";
import {ProgressRail} from "./components/ProgressRail.js";
import {ProviderCard} from "./components/ProviderCard.js";
import {theme} from "./theme.js";

type Props = {
  model: MintFlowModel;
};

type Screen = "overview" | "access" | "plan";

const actions = [
  {
    key: "start",
    label: "Start guided setup",
    detail: "Collect provider access first. Mint will not create provider resources yet.",
  },
  {
    key: "plan",
    label: "Preview apply plan",
    detail: "Show the validation gate, resource apply phase, and rollback policy.",
  },
  {
    key: "exit",
    label: "Exit",
    detail: "Return to the shell. Nothing is running in the background.",
  },
] as const;

function nextIndex(current: number, direction: 1 | -1): number {
  return (current + direction + actions.length) % actions.length;
}

function ActionMenu({selectedIndex}: {selectedIndex: number}) {
  return (
    <Box flexDirection="column">
      <Text bold>Command Center</Text>
      {actions.map((action, index) => {
        const selected = index === selectedIndex;

        return (
          <Box key={action.key} gap={1}>
            <Text color={selected ? theme.accent : theme.muted}>{selected ? ">" : " "}</Text>
            <Box flexDirection="column">
              {selected ? (
                <Text bold color={theme.accent}>
                  {action.label}
                </Text>
              ) : (
                <Text>{action.label}</Text>
              )}
              <Text color={theme.muted}>{action.detail}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function AccessScreen({model}: {model: MintFlowModel}) {
  return (
    <Box flexDirection="column" gap={1}>
      <StatusMessage variant="info">Provider access collection is selected. No resources will be created until every provider validates.</StatusMessage>
      <Box flexDirection="column">
        <Text bold>Access Queue</Text>
        {model.stack
          .filter(item => ["supabase", "revenuecat", "posthog", "eas"].includes(item.key))
          .map(item => (
            <Box key={item.key} gap={1}>
              <Text color={theme.accent}>queued</Text>
              <Text>{item.label}</Text>
              <Text color={theme.muted}>{item.detail}</Text>
            </Box>
          ))}
      </Box>
      <Text color={theme.muted}>Press b for the command center or q to quit.</Text>
    </Box>
  );
}

function PlanScreen({model}: {model: MintFlowModel}) {
  return (
    <Box flexDirection="column" gap={1}>
      <StatusMessage variant="warning">Apply is locked until Supabase, RevenueCat, PostHog, Expo, and EAS are configured.</StatusMessage>
      <Box flexDirection="column">
        <Text bold>Apply Contract</Text>
        <Text>1. Collect provider access and local app settings.</Text>
        <Text>2. Validate every provider without creating resources.</Text>
        <Text>3. Apply provider resources together.</Text>
        <Text>4. Roll back Mint-created resources if any apply step fails.</Text>
      </Box>
      <ProgressRail steps={model.steps} />
      <Text color={theme.muted}>Press b for the command center or q to quit.</Text>
    </Box>
  );
}

export function MintInteractiveApp({model}: Props) {
  const {exit} = useApp();
  const [screen, setScreen] = useState<Screen>("overview");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const progress = useMemo(() => {
    const activeIndex = model.steps.findIndex(step => step.status === "active");
    const safeIndex = activeIndex === -1 ? 0 : activeIndex + 1;
    return Math.max(8, Math.round((safeIndex / Math.max(1, model.steps.length)) * 100));
  }, [model.steps]);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (input === "b" && screen !== "overview") {
      setScreen("overview");
      return;
    }

    if (screen !== "overview") {
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex(index => nextIndex(index, -1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex(index => nextIndex(index, 1));
      return;
    }

    if (key.return) {
      const action = actions[selectedIndex];

      if (action?.key === "start") {
        setScreen("access");
        return;
      }

      if (action?.key === "plan") {
        setScreen("plan");
        return;
      }

      exit();
    }
  });

  const body =
    screen === "access" ? (
      <AccessScreen model={model} />
    ) : screen === "plan" ? (
      <PlanScreen model={model} />
    ) : (
      <Box flexDirection="column" gap={1}>
        <StatusMessage variant="info">No background job is running. Waiting for input.</StatusMessage>
        <Box flexDirection="column">
          <Text bold>Readiness</Text>
          <ProgressBar value={progress} />
        </Box>
        <Box flexDirection="column">
          <Text bold>Stack</Text>
          {model.stack.map(check => (
            <ProviderCard key={`${check.key}-${check.label}`} check={check} />
          ))}
        </Box>
        <ProgressRail steps={model.steps} />
        <ActionMenu selectedIndex={selectedIndex} />
      </Box>
    );

  return (
    <Frame title={model.title} subtitle={model.subtitle}>
      <Box flexDirection="column" gap={1}>
        {body}
        {model.nextCommand ? <Text color="gray">Repair command: {model.nextCommand}</Text> : null}
        <Text color={theme.muted}>Keys: up/down or j/k select, enter choose, b back, q quit</Text>
      </Box>
    </Frame>
  );
}
