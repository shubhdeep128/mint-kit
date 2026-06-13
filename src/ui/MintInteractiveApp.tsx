import {Box, Text, useApp, useInput} from "ink";
import type {MintFlowModel} from "../core/flowModel.js";
import {Frame} from "./components/Frame.js";
import {ProgressRail} from "./components/ProgressRail.js";
import {ProviderCard} from "./components/ProviderCard.js";

type Props = {
  model: MintFlowModel;
};

export function MintInteractiveApp({model}: Props) {
  const {exit} = useApp();

  useInput((input, key) => {
    if (input === "q" || key.escape || key.return) {
      exit();
    }
  });

  return (
    <Frame title={model.title} subtitle={model.subtitle}>
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Stack</Text>
          {model.stack.map(check => (
            <ProviderCard key={`${check.key}-${check.label}`} check={check} />
          ))}
        </Box>
        <ProgressRail steps={model.steps} />
        {model.nextCommand ? <Text color="gray">Enter to continue. Next: {model.nextCommand}</Text> : null}
      </Box>
    </Frame>
  );
}
