import {useState} from "react";
import {PasswordInput, StatusMessage} from "@inkjs/ui";
import {Box, Text, useApp} from "ink";
import type {CredentialConnectResult, CredentialProviderSpec} from "../core/providerCredentials.js";
import {Frame} from "./components/Frame.js";
import {theme} from "./theme.js";

type Props = {
  spec: CredentialProviderSpec;
  envFile: string;
  onSubmit: (values: Record<string, string>) => Promise<CredentialConnectResult>;
};

type SaveStatus = "input" | "saving" | "done" | "error";

export function CredentialConnectApp({spec, envFile, onSubmit}: Props) {
  const {exit} = useApp();
  const [fieldIndex, setFieldIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<SaveStatus>("input");
  const [message, setMessage] = useState(`Saved secrets go to ${envFile}.`);
  const activeField = spec.fields[fieldIndex]!;

  async function submitField(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      setStatus("error");
      setMessage(`${activeField.label} is required.`);
      return;
    }

    const nextValues = {...values, [activeField.envName]: trimmed};
    setValues(nextValues);
    setStatus("input");
    setMessage(`Saved secrets go to ${envFile}.`);

    if (fieldIndex < spec.fields.length - 1) {
      setFieldIndex(index => index + 1);
      return;
    }

    setStatus("saving");
    setMessage("Saving credentials...");

    try {
      const result = await onSubmit(nextValues);
      setStatus(result.connected ? "done" : "error");
      setMessage(result.message);

      if (result.connected) {
        setTimeout(() => exit(), 800);
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save credentials.");
    }
  }

  return (
    <Frame title={`Connect ${spec.label}`} subtitle="Paste once, validate back in setup">
      <Box flexDirection="column" gap={1}>
        <StatusMessage variant={status === "done" ? "success" : status === "error" ? "error" : "info"}>{message}</StatusMessage>

        <Box flexDirection="column">
          <Text bold>
            {activeField.label} <Text color={theme.muted}>({activeField.envName})</Text>
          </Text>
          <PasswordInput
            isDisabled={status === "saving" || status === "done"}
            placeholder={activeField.placeholder}
            onSubmit={value => {
              void submitField(value);
            }}
          />
        </Box>

        <Text color={theme.muted}>Input is masked. Mint does not write secrets to connect-state.</Text>
      </Box>
    </Frame>
  );
}
