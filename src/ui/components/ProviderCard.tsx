import {Box, Text} from "ink";
import type {ProviderCheck} from "../../core/flowModel.js";
import {StatusBadge} from "./StatusBadge.js";

type Props = {
  check: ProviderCheck;
};

export function ProviderCard({check}: Props) {
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <StatusBadge status={check.status} />
        <Text>{check.label}</Text>
        <Text color="gray">- {check.detail}</Text>
      </Box>
      {check.repairCommand ? (
        <Box paddingLeft={12}>
          <Text color="gray">Run {check.repairCommand}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
