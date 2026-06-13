import {Command} from "commander";
import {execaCommandRunner} from "../core/commandRunner.js";
import {createNewFlowModel} from "../core/flowModel.js";
import {chooseOutputMode} from "../core/mode.js";
import {runLocalPreflight} from "../core/preflight.js";
import {renderJson} from "../output/json.js";
import {renderText} from "../output/text.js";

type NewOptions = {
  json?: boolean;
  dryRun?: boolean;
  plain?: boolean;
};

export function newCommand(): Command {
  return new Command("new")
    .description("Create a new Mint app shell.")
    .argument("<app-name>", "App directory and display name seed.")
    .option("--json", "Render machine-readable output.")
    .option("--dry-run", "Show the planned setup without writing files.")
    .option("--plain", "Disable Ink and render plain text.")
    .action(async (appName: string, options: NewOptions) => {
      const localChecks = options.dryRun ? [] : await runLocalPreflight(execaCommandRunner);
      const model = createNewFlowModel(appName, localChecks);
      const mode = chooseOutputMode({
        json: options.json,
        interactive: options.plain ? false : undefined,
        stdoutIsTty: process.stdout.isTTY,
        ci: process.env.CI,
      });

      if (mode === "json") {
        process.stdout.write(renderJson(model));
        return;
      }

      process.stdout.write(renderText(model));
    });
}
