import {Command} from "commander";
import {execaCommandRunner} from "../core/commandRunner.js";
import type {MintFlowModel} from "../core/flowModel.js";
import {runLocalPreflight} from "../core/preflight.js";
import {renderJson} from "../output/json.js";
import {renderText} from "../output/text.js";
import {readConnectState} from "../state/connectState.js";

type DoctorOptions = {
  json?: boolean;
};

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Audit local Mint app readiness.")
    .option("--json", "Render machine-readable output.")
    .action(async (options: DoctorOptions) => {
      const localChecks = await runLocalPreflight(execaCommandRunner);
      const state = await readConnectState(process.cwd());

      const model: MintFlowModel = {
        productName: "Mint",
        command: "doctor",
        title: "Doctor",
        subtitle: "Local environment | Connect state | Repair commands",
        stack: localChecks,
        steps: [
          {label: "Local tools", status: localChecks.every(check => check.status === "ok") ? "ok" : "missing"},
          {label: "Service connections", status: state.providers.length > 0 ? "active" : "missing"},
          {label: "Generated app shell", status: "next"},
        ],
        nextCommand: "mint connect",
      };

      process.stdout.write(options.json ? renderJson(model) : renderText(model));
    });
}
