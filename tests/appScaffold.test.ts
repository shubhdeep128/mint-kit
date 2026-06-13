import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {createBundleIdentifier, scaffoldMintApp} from "../src/core/appScaffold.js";

describe("app scaffold", () => {
  it("creates an Expo app shell with onboarding, agent rules, and quality scripts", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mint-scaffold-"));

    try {
      const result = await scaffoldMintApp({
        appRoot: projectRoot,
        appName: "Dream Coach",
      });

      const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
        dependencies: Record<string, string>;
      };
      const appJson = JSON.parse(await readFile(join(projectRoot, "app.json"), "utf8")) as {
        expo: {ios: {bundleIdentifier: string}; android: {package: string}};
      };
      const agents = await readFile(join(projectRoot, "AGENTS.md"), "utf8");
      const onboardingMachine = await readFile(join(projectRoot, "src/onboarding/onboardingMachine.ts"), "utf8");

      expect(result.files).toContain("src/app/_layout.tsx");
      expect(result.files).toContain("src/onboarding/onboardingMachine.ts");
      expect(packageJson.scripts).toMatchObject({
        typecheck: "tsc --noEmit && tsc -p server/tsconfig.json --noEmit",
        lint: "eslint .",
        test: "vitest run",
        format: "prettier --write .",
      });
      expect(packageJson.scripts).toMatchObject({
        "server:dev": "tsx server/src/index.ts",
        "server:typecheck": "tsc -p server/tsconfig.json --noEmit",
      });
      expect(packageJson.dependencies).toHaveProperty("expo", "~56.0.0");
      expect(packageJson.dependencies).toHaveProperty("hono");
      expect(appJson.expo.ios.bundleIdentifier).toBe(createBundleIdentifier("Dream Coach"));
      expect(appJson.expo.android.package).toBe(createBundleIdentifier("Dream Coach"));
      expect(agents).toContain("Treat onboarding as a state machine");
      expect(agents).toContain("Backend server: `server/src`");
      expect(onboardingMachine).toContain('"paywall"');
      await expect(readFile(join(projectRoot, "server/src/index.ts"), "utf8")).resolves.toContain("mint-server");
    } finally {
      await rm(projectRoot, {recursive: true, force: true});
    }
  });
});
