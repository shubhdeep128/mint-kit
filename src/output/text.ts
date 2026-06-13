import pc from "picocolors";
import type {CheckStatus, MintFlowModel} from "../core/flowModel.js";

function statusLabel(status: CheckStatus): string {
  switch (status) {
    case "ok":
      return pc.green("[ok]");
    case "active":
      return pc.cyan("[active]");
    case "next":
      return pc.gray("[next]");
    case "missing":
      return pc.yellow("[missing]");
    case "skipped":
      return pc.gray("[skipped]");
    case "failed":
      return pc.red("[failed]");
  }
}

export function renderText(model: MintFlowModel): string {
  const lines = [
    "Mint",
    model.title,
    "",
    model.subtitle,
    "",
    "Stack",
    ...model.stack.map(check => `${statusLabel(check.status)} ${check.label} - ${check.detail}`),
    "",
    "Setup",
    ...model.steps.map(step => `${statusLabel(step.status)} ${step.label}`),
  ];

  if (model.nextCommand) {
    lines.push("", `Next: ${model.nextCommand}`);
  }

  return `${lines.join("\n")}\n`;
}
