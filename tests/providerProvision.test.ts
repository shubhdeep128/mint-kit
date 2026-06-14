import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {createBundleIdentifier} from "../src/core/appScaffold.js";
import {provisionEas, provisionPostHog, provisionRevenueCat, validatePostHogAccess, validateRevenueCatAccess} from "../src/core/providerProvision.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {status});
}

describe("provider provisioning", () => {
  it("validates RevenueCat access without creating resources", async () => {
    const credentialsRoot = await mkdtemp(join(tmpdir(), "mint-credentials-"));
    const calls: string[] = [];
    const fetchFn = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return jsonResponse({items: []});
    }) as typeof fetch;

    try {
      await writeFile(join(credentialsRoot, ".env.local"), "REVENUECAT_API_KEY=sk_test\n");

      const result = await validateRevenueCatAccess({credentialsRoot, fetchFn});

      expect(result.ok).toBe(true);
      expect(calls).toEqual(["https://api.revenuecat.com/v2/projects?limit=1"]);
    } finally {
      await rm(credentialsRoot, {recursive: true, force: true});
    }
  });

  it("rejects RevenueCat public SDK keys before apply", async () => {
    const credentialsRoot = await mkdtemp(join(tmpdir(), "mint-credentials-"));
    const calls: string[] = [];
    const fetchFn = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return jsonResponse({items: []});
    }) as typeof fetch;

    try {
      await writeFile(join(credentialsRoot, ".env.local"), "REVENUECAT_API_KEY=appl_public_test\n");

      const result = await validateRevenueCatAccess({credentialsRoot, fetchFn});

      expect(result).toMatchObject({
        ok: false,
        message: "RevenueCat SDK public key cannot manage projects.",
      });
      expect(calls).toEqual([]);
    } finally {
      await rm(credentialsRoot, {recursive: true, force: true});
    }
  });

  it("surfaces RevenueCat 401 as an invalid management credential", async () => {
    const credentialsRoot = await mkdtemp(join(tmpdir(), "mint-credentials-"));
    const fetchFn = (async () =>
      jsonResponse(
        {
          message: "Invalid API key.",
          type: "authentication_error",
        },
        401,
      )) as typeof fetch;

    try {
      await writeFile(join(credentialsRoot, ".env.local"), "REVENUECAT_API_KEY=sk_invalid\n");

      const result = await validateRevenueCatAccess({credentialsRoot, fetchFn});

      expect(result.ok).toBe(false);
      expect(result.details.join("\n")).toContain("RevenueCat rejected this credential as invalid");
      expect(result.nextSteps.join("\n")).toContain("mint connect revenuecat --api-key <sk_...>");
    } finally {
      await rm(credentialsRoot, {recursive: true, force: true});
    }
  });

  it("creates RevenueCat project apps with Expo bundle identifiers and returns a rollback task", async () => {
    const root = await mkdtemp(join(tmpdir(), "mint-revenuecat-"));
    const appRoot = join(root, "app");
    const calls: Array<{url: string; method: string; body?: unknown}> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = String(url);
      const method = init?.method ?? "GET";
      calls.push({
        url: requestUrl,
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });

      if (requestUrl.endsWith("/v2/projects") && method === "POST") {
        return jsonResponse({id: "proj_123"}, 201);
      }
      if (requestUrl.endsWith("/proj_123/apps") && method === "POST") {
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as {type: string}) : {type: ""};
        return jsonResponse({id: body.type === "app_store" ? "app_ios" : "app_android"}, 201);
      }
      if (requestUrl.includes("/app_ios/public_api_keys")) {
        return jsonResponse({items: [{key: "appl_test"}]});
      }
      if (requestUrl.includes("/app_android/public_api_keys")) {
        return jsonResponse({items: [{key: "goog_test"}]});
      }
      if (method === "DELETE") {
        return jsonResponse({deleted_at: Date.now()});
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    try {
      await writeFile(join(root, ".env.local"), "REVENUECAT_API_KEY=atk_test\n");

      const result = await provisionRevenueCat({
        appRoot,
        credentialsRoot: root,
        appName: "Dream Coach",
        fetchFn,
      });
      const env = await readFile(join(appRoot, ".env.local"), "utf8");
      const appIdentifier = createBundleIdentifier("Dream Coach");

      expect(result.connected).toBe(true);
      expect(env).toContain("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_test");
      expect(env).toContain("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_test");
      expect(calls).toContainEqual(
        expect.objectContaining({
          body: {name: "Dream Coach iOS", type: "app_store", app_store: {bundle_id: appIdentifier}},
        }),
      );
      expect(calls).toContainEqual(
        expect.objectContaining({
          body: {name: "Dream Coach Android", type: "play_store", play_store: {package_name: appIdentifier}},
        }),
      );

      const rollback = await result.rollback?.run();
      expect(rollback?.success).toBe(true);
      expect(calls.filter(call => call.method === "DELETE")).toHaveLength(2);
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });

  it("uses an existing RevenueCat project for project-scoped secret keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "mint-revenuecat-"));
    const appRoot = join(root, "app");
    const calls: Array<{url: string; method: string; body?: unknown}> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = String(url);
      const method = init?.method ?? "GET";
      calls.push({
        url: requestUrl,
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });

      if (requestUrl.endsWith("/v2/projects?limit=1") && method === "GET") {
        return jsonResponse({items: [{id: "proj_existing", name: "Existing Project"}]});
      }
      if (requestUrl.endsWith("/proj_existing/apps") && method === "POST") {
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as {type: string}) : {type: ""};
        return jsonResponse({id: body.type === "app_store" ? "existing_ios" : "existing_android"}, 201);
      }
      if (requestUrl.includes("/existing_ios/public_api_keys")) {
        return jsonResponse({items: [{key: "appl_existing"}]});
      }
      if (requestUrl.includes("/existing_android/public_api_keys")) {
        return jsonResponse({items: [{key: "goog_existing"}]});
      }
      if (method === "DELETE") {
        return jsonResponse({deleted_at: Date.now()});
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    try {
      await writeFile(join(root, ".env.local"), "REVENUECAT_API_KEY=sk_test\n");

      const result = await provisionRevenueCat({
        appRoot,
        credentialsRoot: root,
        appName: "Dream Coach",
        fetchFn,
      });
      const env = await readFile(join(appRoot, ".env.local"), "utf8");

      expect(result.connected).toBe(true);
      expect(result.details.join("\n")).toContain("Project used: Existing Project (proj_existing)");
      expect(env).toContain("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_existing");
      expect(env).toContain("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_existing");
      expect(calls).not.toContainEqual(
        expect.objectContaining({
          url: "https://api.revenuecat.com/v2/projects",
          method: "POST",
        }),
      );

      const rollback = await result.rollback?.run();
      expect(rollback?.details.join("\n")).toContain("pre-existing");
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });

  it("uses PostHog organization-scoped project APIs and returns a rollback task", async () => {
    const root = await mkdtemp(join(tmpdir(), "mint-posthog-"));
    const appRoot = join(root, "app");
    const calls: Array<{url: string; method: string; body?: unknown}> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = String(url);
      const method = init?.method ?? "GET";
      calls.push({
        url: requestUrl,
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });

      if (requestUrl.endsWith("/api/organizations/@current")) {
        return jsonResponse({id: "org_123"});
      }
      if (requestUrl.endsWith("/api/organizations/org_123/projects/?limit=1")) {
        return jsonResponse({results: []});
      }
      if (requestUrl.endsWith("/api/organizations/org_123/projects/") && method === "POST") {
        return jsonResponse({id: 42, api_token: "phc_test"}, 201);
      }
      if (requestUrl.endsWith("/api/organizations/org_123/projects/42/") && method === "DELETE") {
        return new Response(null, {status: 204});
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    try {
      await writeFile(join(root, ".env.local"), "POSTHOG_PERSONAL_API_KEY=phx_test\nPOSTHOG_HOST=https://us.posthog.com\n");

      await expect(validatePostHogAccess({credentialsRoot: root, fetchFn})).resolves.toMatchObject({ok: true});
      const result = await provisionPostHog({
        appRoot,
        credentialsRoot: root,
        appName: "Dream Coach",
        fetchFn,
      });
      const env = await readFile(join(appRoot, ".env.local"), "utf8");

      expect(result.connected).toBe(true);
      expect(env).toContain("EXPO_PUBLIC_POSTHOG_KEY=phc_test");
      expect(calls).toContainEqual(
        expect.objectContaining({
          url: "https://us.posthog.com/api/organizations/org_123/projects/",
          method: "POST",
          body: {name: "Dream Coach"},
        }),
      );

      const rollback = await result.rollback?.run();
      expect(rollback?.success).toBe(true);
      expect(calls).toContainEqual(
        expect.objectContaining({
          url: "https://us.posthog.com/api/organizations/org_123/projects/42/",
          method: "DELETE",
        }),
      );
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });

  it("uses an existing PostHog project when project creation is capped", async () => {
    const root = await mkdtemp(join(tmpdir(), "mint-posthog-"));
    const appRoot = join(root, "app");
    const calls: Array<{url: string; method: string; body?: unknown}> = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = String(url);
      const method = init?.method ?? "GET";
      calls.push({
        url: requestUrl,
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });

      if (requestUrl.endsWith("/api/organizations/@current")) {
        return jsonResponse({id: "org_123"});
      }
      if (requestUrl.endsWith("/api/organizations/org_123/projects/") && method === "POST") {
        return jsonResponse({detail: "Project limit reached"}, 403);
      }
      if (requestUrl.endsWith("/api/organizations/org_123/projects/?limit=1")) {
        return jsonResponse({results: [{id: 42, name: "Default project", api_token: "phc_existing"}]});
      }
      if (method === "DELETE") {
        return jsonResponse({deleted: true});
      }

      return jsonResponse({}, 404);
    }) as typeof fetch;

    try {
      await writeFile(join(root, ".env.local"), "POSTHOG_PERSONAL_API_KEY=phx_test\nPOSTHOG_HOST=https://us.posthog.com\n");

      const result = await provisionPostHog({
        appRoot,
        credentialsRoot: root,
        appName: "Dream Coach",
        fetchFn,
      });
      const env = await readFile(join(appRoot, ".env.local"), "utf8");

      expect(result.connected).toBe(true);
      expect(result.details.join("\n")).toContain("Project used: Default project (42)");
      expect(result.rollback).toBeUndefined();
      expect(env).toContain("EXPO_PUBLIC_POSTHOG_KEY=phc_existing");
      expect(calls.filter(call => call.method === "DELETE")).toHaveLength(0);
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });

  it("temporarily removes Expo plugins while initializing EAS before dependencies are installed", async () => {
    const root = await mkdtemp(join(tmpdir(), "mint-eas-"));
    const appRoot = join(root, "app");
    const appJsonPath = join(appRoot, "app.json");

    try {
      await mkdir(appRoot, {recursive: true});
      await writeFile(join(root, ".env.local"), "EXPO_TOKEN=expo_test\n");
      await writeFile(
        appJsonPath,
        JSON.stringify(
          {
            expo: {
              name: "Dream Coach",
              slug: "dream-coach",
              plugins: ["expo-router", "expo-secure-store"],
            },
          },
          null,
          2,
        ),
      );

      const runner = {
        async run(command: string, args: string[]) {
          const appJsonDuringInit = JSON.parse(await readFile(appJsonPath, "utf8")) as {expo?: {plugins?: unknown; extra?: unknown}};

          expect(command).toBe("npx");
          expect(args).toEqual(["--yes", "eas-cli@latest", "project:init", "--non-interactive", "--force"]);
          expect(appJsonDuringInit.expo?.plugins).toBeUndefined();

          appJsonDuringInit.expo ??= {};
          appJsonDuringInit.expo.extra = {eas: {projectId: "eas_123"}};
          await writeFile(appJsonPath, `${JSON.stringify(appJsonDuringInit, null, 2)}\n`);

          return {exitCode: 0, stdout: "linked", stderr: ""};
        },
      };

      const result = await provisionEas({
        appRoot,
        credentialsRoot: root,
        appName: "Dream Coach",
        runner,
      });
      const appJsonAfterInit = JSON.parse(await readFile(appJsonPath, "utf8")) as {
        expo?: {plugins?: unknown; extra?: {eas?: {projectId?: string}}};
      };

      expect(result.connected).toBe(true);
      expect(appJsonAfterInit.expo?.plugins).toEqual(["expo-router", "expo-secure-store"]);
      expect(appJsonAfterInit.expo?.extra?.eas?.projectId).toBe("eas_123");
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });
});
