import {Text} from "ink";
import type {CheckStatus} from "../../core/flowModel.js";
import {theme} from "../theme.js";

type Props = {
  status: CheckStatus;
};

export function StatusBadge({status}: Props) {
  switch (status) {
    case "ok":
      return <Text color={theme.good}>[ok]</Text>;
    case "active":
      return <Text color={theme.active}>[active]</Text>;
    case "next":
      return <Text color={theme.muted}>[next]</Text>;
    case "missing":
      return <Text color={theme.warn}>[missing]</Text>;
    case "skipped":
      return <Text color={theme.muted}>[skipped]</Text>;
    case "failed":
      return <Text color={theme.bad}>[failed]</Text>;
  }
}
