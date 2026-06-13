import type {ReactNode} from "react";
import {Box, Text} from "ink";
import {theme} from "../theme.js";

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function Frame({title, subtitle, children}: Props) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
      <Box flexDirection="column">
        <Text bold color={theme.accent}>
          Mint
        </Text>
        <Text bold>{title}</Text>
        <Text color={theme.muted}>{subtitle}</Text>
      </Box>
      {children}
    </Box>
  );
}
