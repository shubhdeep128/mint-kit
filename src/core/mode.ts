export type OutputMode = "interactive" | "text" | "json";

export type ModeInput = {
  json?: boolean | undefined;
  interactive?: boolean | undefined;
  stdoutIsTty?: boolean | undefined;
  ci?: string | undefined;
};

export function chooseOutputMode(input: ModeInput): OutputMode {
  if (input.json) {
    return "json";
  }

  if (input.interactive === false) {
    return "text";
  }

  if (input.ci || input.stdoutIsTty === false) {
    return "text";
  }

  return "interactive";
}
