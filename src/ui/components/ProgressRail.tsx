import {Box, Text} from "ink";
import type {SetupStep} from "../../core/flowModel.js";
import {StatusBadge} from "./StatusBadge.js";

type Props = {
  steps: SetupStep[];
};

export function ProgressRail({steps}: Props) {
  return (
    <Box flexDirection="column">
      <Text bold>Setup</Text>
      {steps.map(step => (
        <Box key={step.label} gap={1}>
          <StatusBadge status={step.status} />
          <Text>{step.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
