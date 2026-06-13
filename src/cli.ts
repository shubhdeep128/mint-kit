import {Command} from "commander";
import {connectCommand} from "./commands/connect.js";
import {doctorCommand} from "./commands/doctor.js";
import {newCommand} from "./commands/new.js";

export async function runMintCli(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("mint")
    .description("Create and connect store-ready Expo app shells.")
    .version("0.0.0");

  program.addCommand(newCommand());
  program.addCommand(connectCommand());
  program.addCommand(doctorCommand());

  await program.parseAsync(argv);
}
