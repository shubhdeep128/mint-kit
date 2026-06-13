import {Command} from "commander";

export function newCommand(): Command {
  return new Command("new")
    .description("Create a new Mint app shell.")
    .argument("<app-name>", "App directory and display name seed.")
    .option("--json", "Render machine-readable output.")
    .option("--dry-run", "Show the planned setup without writing files.")
    .option("--plain", "Disable Ink and render plain text.")
    .action(async (appName: string, options: {json?: boolean; dryRun?: boolean}) => {
      const payload = {
        command: "new",
        appName,
        dryRun: Boolean(options.dryRun),
        message: `Mint will create ${appName}.`,
      };

      if (options.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
      }

      process.stdout.write(`${payload.message}\n`);
    });
}
