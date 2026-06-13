import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {z} from "zod";
import type {ProviderKey} from "../core/flowModel.js";

const providerStateSchema = z.object({
  key: z.enum(["expo", "supabase", "revenuecat", "posthog", "eas"]),
  status: z.enum(["connected", "skipped", "missing"]),
  updatedAt: z.string(),
});

const connectStateSchema = z.object({
  version: z.literal(1),
  providers: z.array(providerStateSchema),
});

export type ConnectState = z.infer<typeof connectStateSchema>;

export function connectStatePath(projectRoot: string): string {
  return join(projectRoot, ".mint", "connect-state.json");
}

export function emptyConnectState(): ConnectState {
  return {
    version: 1,
    providers: [],
  };
}

export async function readConnectState(projectRoot: string): Promise<ConnectState> {
  try {
    const raw = await readFile(connectStatePath(projectRoot), "utf8");
    return connectStateSchema.parse(JSON.parse(raw));
  } catch {
    return emptyConnectState();
  }
}

export async function writeConnectState(projectRoot: string, state: ConnectState): Promise<void> {
  const filePath = connectStatePath(projectRoot);
  await mkdir(dirname(filePath), {recursive: true});
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function markProvider(
  projectRoot: string,
  key: ProviderKey,
  status: "connected" | "skipped" | "missing",
): Promise<ConnectState> {
  const state = await readConnectState(projectRoot);
  const providers = state.providers.filter(provider => provider.key !== key);
  providers.push({key, status, updatedAt: new Date().toISOString()});
  const nextState = {version: 1 as const, providers};
  await writeConnectState(projectRoot, nextState);
  return nextState;
}
