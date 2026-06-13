import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, readdirSync, rmSync} from "node:fs";
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

execFileSync("pnpm", ["dlx", tarballPath, "new", "package-smoke", "--dry-run", "--json"], {
  cwd: root,
  env: {...process.env, MINT_TEST_MODE: "1", CI: "1"},
  stdio: "inherit",
});

execFileSync("npx", ["--yes", "--package", tarballPath, "mint", "new", "package-smoke", "--dry-run", "--plain"], {
  cwd: root,
  env: {...process.env, MINT_TEST_MODE: "1", CI: "1"},
  stdio: "inherit",
});
