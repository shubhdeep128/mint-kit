import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {createBundleIdentifier} from "../src/core/appScaffold.js";
import {provisionPostHog, provisionRevenueCat, validatePostHogAccess, validateRevenueCatAccess} from "../src/core/providerProvision.js";

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
      await writeFile(join(root, ".env.local"), "REVENUECAT_API_KEY=sk_test\n");

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
});
