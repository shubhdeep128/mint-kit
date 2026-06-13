export function mintCommand(args: string): string {
  return process.env.npm_lifecycle_event === "dev" ? `pnpm dev ${args}` : `mint ${args}`;
}
