import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, isAbsolute, join} from "node:path";

export type EnvWriteResult = {
  path: string;
  variables: string[];
};

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

export function resolveProjectPath(projectRoot: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(projectRoot, filePath);
}

export async function upsertEnvFile(
  projectRoot: string,
  filePath: string,
  values: Record<string, string | undefined>,
): Promise<EnvWriteResult> {
  const absolutePath = resolveProjectPath(projectRoot, filePath);
  const nextValues = Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]));
  let lines: string[] = [];

  try {
    lines = (await readFile(absolutePath, "utf8")).split(/\r?\n/);
  } catch {
    lines = [];
  }

  const remaining = new Map(nextValues);
  const nextLines = lines.map(line => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    const key = match?.[1];

    if (!key || !remaining.has(key)) {
      return line;
    }

    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${quoteEnvValue(value ?? "")}`;
  });

  if (nextLines.length > 0 && nextLines.at(-1) !== "") {
    nextLines.push("");
  }

  for (const [key, value] of remaining) {
    nextLines.push(`${key}=${quoteEnvValue(value)}`);
  }

  await mkdir(dirname(absolutePath), {recursive: true});
  await writeFile(absolutePath, `${nextLines.join("\n").replace(/\n*$/, "")}\n`);

  return {
    path: absolutePath,
    variables: nextValues.map(([key]) => key),
  };
}
