import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";

export type AppScaffoldResult = {
  appRoot: string;
  files: string[];
};

export type AppScaffoldProgress = {
  label: string;
  detail?: string | undefined;
};

type AppScaffoldInput = {
  appRoot: string;
  appName: string;
  onProgress?: ((progress: AppScaffoldProgress) => void) | undefined;
};

function reportProgress(input: AppScaffoldInput, label: string, detail?: string): void {
  input.onProgress?.({label, detail});
}

export function normalizeAppSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mint-app";
}

export function createBundleIdentifier(value: string): string {
  return `com.mintkit.${normalizeAppSlug(value).replace(/-/g, "")}`;
}

async function writeProjectFile(root: string, filePath: string, content: string): Promise<string> {
  const absolutePath = join(root, filePath);
  await mkdir(dirname(absolutePath), {recursive: true});
  await writeFile(absolutePath, content);
  return filePath;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function scaffoldMintApp(input: AppScaffoldInput): Promise<AppScaffoldResult> {
  const nameSlug = normalizeAppSlug(input.appName);
  const packageName = nameSlug;
  const appBundleId = createBundleIdentifier(input.appName);
  const files: string[] = [];

  reportProgress(input, "Creating app directory", input.appRoot);
  await mkdir(input.appRoot, {recursive: true});

  const packageJson = {
    name: packageName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      start: "expo start",
      android: "expo start --android",
      ios: "expo start --ios",
      web: "expo start --web",
      "server:dev": "tsx server/src/index.ts",
      "server:typecheck": "tsc -p server/tsconfig.json --noEmit",
      lint: "eslint .",
      format: "prettier --write .",
      "format:check": "prettier --check .",
      typecheck: "tsc --noEmit && tsc -p server/tsconfig.json --noEmit",
      test: "vitest run",
      doctor: "expo doctor",
    },
    dependencies: {
      "@hono/node-server": "latest",
      "@expo/vector-icons": "latest",
      "@react-native-async-storage/async-storage": "latest",
      "@react-navigation/native": "latest",
      "@supabase/supabase-js": "latest",
      expo: "~56.0.0",
      "expo-constants": "latest",
      "expo-linking": "latest",
      "expo-router": "latest",
      "expo-secure-store": "latest",
      "expo-splash-screen": "latest",
      "expo-status-bar": "latest",
      hono: "latest",
      "posthog-react-native": "latest",
      react: "latest",
      "react-dom": "latest",
      "react-native": "latest",
      "react-native-purchases": "latest",
      "react-native-safe-area-context": "latest",
      "react-native-screens": "latest",
    },
    devDependencies: {
      "@types/node": "latest",
      "@types/react": "latest",
      eslint: "^9.39.1",
      "eslint-config-expo": "latest",
      prettier: "latest",
      tsx: "latest",
      typescript: "latest",
      vitest: "latest",
    },
  };

  const projectFiles: Record<string, string> = {
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "app.json": `${JSON.stringify(
      {
        expo: {
          name: input.appName,
          slug: nameSlug,
          scheme: nameSlug,
          version: "1.0.0",
          orientation: "portrait",
          icon: "./assets/icon.png",
          userInterfaceStyle: "automatic",
          newArchEnabled: true,
          ios: {
            supportsTablet: true,
            bundleIdentifier: appBundleId,
          },
          android: {
            package: appBundleId,
            adaptiveIcon: {
              foregroundImage: "./assets/adaptive-icon.png",
              backgroundColor: "#111111",
            },
          },
          plugins: ["expo-router", "expo-secure-store"],
          experiments: {
            typedRoutes: true,
          },
        },
      },
      null,
      2,
    )}\n`,
    "eas.json": `${JSON.stringify(
      {
        cli: {
          version: ">= 20.1.0",
          appVersionSource: "remote",
        },
        build: {
          development: {
            developmentClient: true,
            distribution: "internal",
          },
          preview: {
            distribution: "internal",
          },
          production: {
            autoIncrement: true,
          },
        },
        submit: {
          production: {},
        },
      },
      null,
      2,
    )}\n`,
    "tsconfig.json": `${JSON.stringify(
      {
        extends: "expo/tsconfig.base",
        compilerOptions: {
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          paths: {
            "@/*": ["./src/*"],
          },
        },
        include: ["src/**/*.ts", "src/**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
      },
      null,
      2,
    )}\n`,
    "server/tsconfig.json": `${JSON.stringify(
      {
        extends: "../tsconfig.json",
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          types: ["node"],
          noEmit: true,
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
    "eslint.config.js": `import expo from "eslint-config-expo/flat.js";\n\nexport default [\n  ...expo,\n  {\n    ignores: ["dist/**", ".expo/**", "coverage/**"],\n  },\n];\n`,
    "prettier.config.cjs": `module.exports = {\n  printWidth: 110,\n  semi: true,\n  singleQuote: false,\n  trailingComma: "all",\n};\n`,
    "vitest.config.ts": `import {defineConfig} from "vitest/config";\n\nexport default defineConfig({\n  test: {\n    environment: "node",\n    include: ["src/**/*.test.ts", "server/**/*.test.ts"],\n  },\n});\n`,
    ".gitignore": `node_modules/\n.expo/\ndist/\ncoverage/\n.env\n.env.*\n!.env.example\n.DS_Store\n`,
    ".env.example": [
      "EXPO_PUBLIC_SUPABASE_URL=",
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=",
      "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=",
      "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=",
      "EXPO_PUBLIC_POSTHOG_KEY=",
      "EXPO_PUBLIC_POSTHOG_HOST=https://us.posthog.com",
      "SUPABASE_URL=",
      "SUPABASE_SERVICE_ROLE_KEY=",
      "",
    ].join("\n"),
    "CLAUDE.md": `# Mint App Rules\n\n- Preserve the generated Expo Router structure unless a task explicitly changes navigation.\n- Onboarding is driven by \`src/onboarding/onboardingMachine.ts\`; add steps there instead of hard-coding screen order.\n- Keep paywall routing as a state-machine step, not a one-off screen redirect.\n- Use Supabase for auth, database, and storage. Do not introduce another backend without documenting why.\n- Use RevenueCat for entitlements/paywalls and PostHog for analytics events.\n- Keep backend work inside \`server/src\` unless the task specifically asks for Supabase Edge Functions or another runtime.\n- Before finishing changes, run \`pnpm typecheck\`, \`pnpm lint\`, and \`pnpm test\` when dependencies are installed.\n- Keep public client env vars prefixed with \`EXPO_PUBLIC_\`. Never commit provider management API keys.\n`,
    "AGENTS.md": `# Agent Guide\n\nThis app is generated by Mint for non-developer vibecoding.\n\n## Defaults\n- Expo Router app directory: \`src/app\`\n- Onboarding machine: \`src/onboarding/onboardingMachine.ts\`\n- Provider clients: \`src/providers\`\n- Backend server: \`server/src\`\n- Tests: colocated \`*.test.ts\`\n\n## Product Rules\n- Treat onboarding as a state machine that can grow to multiple screens and a paywall.\n- Do not add store/payment code outside RevenueCat helpers.\n- Capture analytics through PostHog helpers so events remain consistent.\n- Use Supabase auth/session helpers for gated routes.\n- Put server-only Supabase work behind the Hono API in \`server/src\`.\n\n## Quality Gates\nRun these before handing back code:\n\n\`\`\`bash\npnpm typecheck\npnpm lint\npnpm test\n\`\`\`\n`,
    "server/.env.example": `SUPABASE_URL=\nSUPABASE_SERVICE_ROLE_KEY=\nPORT=8787\n`,
    "server/src/env.ts": `export type ServerEnv = {\n  SUPABASE_URL: string;\n  SUPABASE_SERVICE_ROLE_KEY: string;\n  PORT: string;\n};\n\nexport function readServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {\n  return {\n    SUPABASE_URL: source.SUPABASE_URL ?? "",\n    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY ?? source.SUPABASE_SECRET_KEY ?? "",\n    PORT: source.PORT ?? "8787",\n  };\n}\n`,
    "server/src/supabase.ts": `import {createClient} from "@supabase/supabase-js";\nimport {readServerEnv} from "./env.js";\n\nexport function createServerSupabaseClient() {\n  const env = readServerEnv();\n\n  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {\n    throw new Error("Missing server Supabase env vars.");\n  }\n\n  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {\n    auth: {\n      persistSession: false,\n    },\n  });\n}\n`,
    "server/src/index.ts": `import {serve} from "@hono/node-server";\nimport {Hono} from "hono";\nimport {readServerEnv} from "./env.js";\n\nconst app = new Hono();\n\napp.get("/health", c =>\n  c.json({\n    ok: true,\n    service: "mint-server",\n  }),\n);\n\nif (process.env.NODE_ENV !== "test") {\n  const env = readServerEnv();\n  serve({\n    fetch: app.fetch,\n    port: Number(env.PORT),\n  });\n}\n\nexport default app;\n`,
    "server/src/index.test.ts": `import {describe, expect, it} from "vitest";\nimport app from "./index.js";\n\ndescribe("server", () => {\n  it("responds to health checks", async () => {\n    const response = await app.request("/health");\n\n    await expect(response.json()).resolves.toMatchObject({ok: true, service: "mint-server"});\n  });\n});\n`,
    "src/app/_layout.tsx": `import {Stack} from "expo-router";\nimport {StatusBar} from "expo-status-bar";\n\nexport default function RootLayout() {\n  return (\n    <>\n      <Stack screenOptions={{headerShown: false}} />\n      <StatusBar style="auto" />\n    </>\n  );\n}\n`,
    "src/app/index.tsx": `import {Redirect} from "expo-router";\n\nexport default function IndexRoute() {\n  return <Redirect href="/onboarding" />;\n}\n`,
    "src/app/onboarding.tsx": `import {useMemo, useState} from "react";\nimport {Pressable, SafeAreaView, StyleSheet, Text, View} from "react-native";\nimport {advanceOnboarding, createOnboardingState} from "@/onboarding/onboardingMachine";\n\nexport default function OnboardingRoute() {\n  const initialState = useMemo(() => createOnboardingState(), []);\n  const [state, setState] = useState(initialState);\n\n  return (\n    <SafeAreaView style={styles.root}>\n      <View style={styles.content}>\n        <Text style={styles.eyebrow}>Mint starter</Text>\n        <Text style={styles.title}>{state.current.title}</Text>\n        <Text style={styles.body}>{state.current.body}</Text>\n        <Pressable style={styles.button} onPress={() => setState(current => advanceOnboarding(current))}>\n          <Text style={styles.buttonText}>{state.current.cta}</Text>\n        </Pressable>\n      </View>\n    </SafeAreaView>\n  );\n}\n\nconst styles = StyleSheet.create({\n  root: {\n    flex: 1,\n    backgroundColor: "#101112",\n  },\n  content: {\n    flex: 1,\n    justifyContent: "center",\n    gap: 18,\n    padding: 24,\n  },\n  eyebrow: {\n    color: "#71f0a8",\n    fontSize: 14,\n    fontWeight: "700",\n    textTransform: "uppercase",\n  },\n  title: {\n    color: "#ffffff",\n    fontSize: 34,\n    fontWeight: "800",\n  },\n  body: {\n    color: "#c8c8c8",\n    fontSize: 17,\n    lineHeight: 25,\n  },\n  button: {\n    alignItems: "center",\n    backgroundColor: "#71f0a8",\n    borderRadius: 8,\n    paddingVertical: 14,\n  },\n  buttonText: {\n    color: "#101112",\n    fontSize: 16,\n    fontWeight: "800",\n  },\n});\n`,
    "src/app/(app)/home.tsx": `import {SafeAreaView, StyleSheet, Text} from "react-native";\n\nexport default function HomeRoute() {\n  return (\n    <SafeAreaView style={styles.root}>\n      <Text style={styles.title}>Your Mint app is ready.</Text>\n    </SafeAreaView>\n  );\n}\n\nconst styles = StyleSheet.create({\n  root: {\n    flex: 1,\n    alignItems: "center",\n    justifyContent: "center",\n    backgroundColor: "#ffffff",\n    padding: 24,\n  },\n  title: {\n    color: "#101112",\n    fontSize: 24,\n    fontWeight: "800",\n  },\n});\n`,
    "src/onboarding/onboardingMachine.ts": `export type OnboardingStepKind = "intro" | "value" | "paywall" | "done";\n\nexport type OnboardingStep = {\n  id: string;\n  kind: OnboardingStepKind;\n  title: string;\n  body: string;\n  cta: string;\n};\n\nexport type OnboardingState = {\n  index: number;\n  current: OnboardingStep;\n  steps: OnboardingStep[];\n};\n\nexport const defaultOnboardingSteps: OnboardingStep[] = [\n  {\n    id: "intro",\n    kind: "intro",\n    title: "Start with a real app shell.",\n    body: "This flow is intentionally tiny. Add screens by appending steps to the machine, not by hard-coding route order.",\n    cta: "Continue",\n  },\n  {\n    id: "paywall",\n    kind: "paywall",\n    title: "Paywall-ready by default.",\n    body: "Attach a RevenueCat offering to this step when you are ready to monetize.",\n    cta: "Continue",\n  },\n  {\n    id: "done",\n    kind: "done",\n    title: "Build from here.",\n    body: "Supabase, RevenueCat, PostHog, and EAS are configured through Mint.",\n    cta: "Done",\n  },\n];\n\nexport function createOnboardingState(steps = defaultOnboardingSteps): OnboardingState {\n  return {\n    index: 0,\n    current: steps[0]!,\n    steps,\n  };\n}\n\nexport function advanceOnboarding(state: OnboardingState): OnboardingState {\n  const nextIndex = Math.min(state.index + 1, state.steps.length - 1);\n\n  return {\n    ...state,\n    index: nextIndex,\n    current: state.steps[nextIndex]!,\n  };\n}\n`,
    "src/onboarding/onboardingMachine.test.ts": `import {describe, expect, it} from "vitest";\nimport {advanceOnboarding, createOnboardingState} from "./onboardingMachine";\n\ndescribe("onboarding machine", () => {\n  it("advances through extensible steps", () => {\n    const initial = createOnboardingState();\n    const next = advanceOnboarding(initial);\n\n    expect(initial.current.id).toBe("intro");\n    expect(next.current.id).toBe("paywall");\n  });\n});\n`,
    "src/providers/supabase.ts": `import {createClient} from "@supabase/supabase-js";\n\nconst supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;\nconst supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;\n\nif (!supabaseUrl || !supabaseKey) {\n  throw new Error("Missing Supabase public env vars.");\n}\n\nexport const supabase = createClient(supabaseUrl, supabaseKey);\n`,
    "src/providers/posthog.ts": `import PostHog from "posthog-react-native";\n\nexport function createPostHogClient() {\n  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;\n  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com";\n\n  if (!apiKey) {\n    return undefined;\n  }\n\n  return new PostHog(apiKey, {host});\n}\n`,
    "src/providers/revenuecat.ts": `import Purchases from "react-native-purchases";\nimport {Platform} from "react-native";\n\nexport function configureRevenueCat() {\n  const apiKey = Platform.select({\n    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,\n    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,\n    default: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,\n  });\n\n  if (!apiKey) {\n    return;\n  }\n\n  Purchases.configure({apiKey});\n}\n`,
  };

  for (const [filePath, content] of Object.entries(projectFiles)) {
    if ((filePath === "package.json" || filePath === "app.json") && (await fileExists(join(input.appRoot, filePath)))) {
      reportProgress(input, "Keeping existing app file", filePath);
      continue;
    }

    reportProgress(input, "Writing app file", filePath);
    files.push(await writeProjectFile(input.appRoot, filePath, content));
  }

  reportProgress(input, "Writing placeholder assets", "assets/icon.png and assets/adaptive-icon.png");
  await mkdir(join(input.appRoot, "assets"), {recursive: true});
  const transparentPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(join(input.appRoot, "assets/icon.png"), transparentPng);
  await writeFile(join(input.appRoot, "assets/adaptive-icon.png"), transparentPng);
  files.push("assets/icon.png", "assets/adaptive-icon.png");

  return {
    appRoot: input.appRoot,
    files,
  };
}
