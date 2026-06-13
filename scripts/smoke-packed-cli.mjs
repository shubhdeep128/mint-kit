import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const artifactsDir = join(root, "artifacts");

if (existsSync(artifactsDir)) {
  rmSync(artifactsDir, {recursive: true, force: true});
}

mkdirSync(artifactsDir, {recursive: true});

execFileSync("pnpm", ["pack", "--pack-destination", artifactsDir], {
  cwd: root,
  stdio: "inherit",
});

const tarball = readdirSync(artifactsDir).find(file => file.endsWith(".tgz"));

if (!tarball) {
  throw new Error("pnpm pack did not produce a .tgz file");
}

const tarballPath = join(artifactsDir, tarball);

function assertIntegratedNewOutput(output, label) {
  if (!output.includes("Mint will create a project") || !output.includes("Provision Supabase")) {
    throw new Error(`${label} did not run the integrated Mint new flow:\n${output}`);
  }

  if (output.includes('"status": "missing"') || output.includes("Next: mint connect")) {
    throw new Error(`${label} ran the repair-only Mint new flow:\n${output}`);
  }
}

const pnpmTemp = mkdtempSync(join(tmpdir(), "mint-pnpm-dlx-"));
const pnpmOutput = execFileSync("pnpm", ["dlx", "--package", tarballPath, "mint", "new", "package-smoke", "--dry-run", "--json"], {
  cwd: root,
  env: {
    ...process.env,
    MINT_TEST_MODE: "1",
    CI: "1",
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    NPM_CONFIG_STORE_DIR: join(pnpmTemp, "store"),
    PNPM_HOME: join(pnpmTemp, "home"),
    XDG_CACHE_HOME: join(pnpmTemp, "cache"),
  },
  encoding: "utf8",
});
process.stdout.write(pnpmOutput);
assertIntegratedNewOutput(pnpmOutput, "pnpm dlx");

const npxOutput = execFileSync("npx", ["--yes", "--package", tarballPath, "mint", "new", "package-smoke", "--dry-run", "--plain"], {
  cwd: root,
  env: {...process.env, MINT_TEST_MODE: "1", CI: "1"},
  encoding: "utf8",
});
process.stdout.write(npxOutput);
assertIntegratedNewOutput(npxOutput, "npx");
