import {describe, expect, it, vi} from "vitest";
import {render} from "ink-testing-library";
import {createNewFlowModel} from "../src/core/flowModel.js";
import {MintInteractiveApp} from "../src/ui/MintInteractiveApp.js";

async function waitForRender() {
  await new Promise(resolve => setTimeout(resolve, 10));
}

async function waitForFrame(lastFrame: () => string | undefined, text: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (lastFrame()?.includes(text)) {
      return;
    }

    await waitForRender();
  }

  throw new Error(`Timed out waiting for frame containing: ${text}\n\nLast frame:\n${lastFrame() ?? ""}`);
}

describe("MintInteractiveApp", () => {
  it("starts by auto-checking provider connections", async () => {
    const validateProvider = vi.fn(() => new Promise<{ok: boolean; message: string}>(() => {}));
    const {lastFrame} = render(
      <MintInteractiveApp model={createNewFlowModel("dream-coach")} validateProvider={validateProvider} />,
    );

    await waitForFrame(lastFrame, "Auto-checking provider connections");
    expect(lastFrame()).toContain("Mint");
    expect(lastFrame()).toContain("dream-coach");
    expect(lastFrame()).toContain("Supabase");
    expect(lastFrame()).toContain("Mint is checking every provider automatically.");
    expect(lastFrame()).not.toContain("skip");
  });

  it("auto-validates every provider and starts apply", async () => {
    const validateProvider = vi.fn(async () => ({ok: true, message: "validated"}));
    const applySetup = vi.fn(async () => ({
      ok: true,
      message: "Supabase project created and env files configured.",
      details: ["Supabase project: dupebrew (abcdefghijklmnopqrst)"],
      nextSteps: ["Run mint doctor"],
    }));
    const {lastFrame} = render(
      <MintInteractiveApp model={createNewFlowModel("dupebrew")} validateProvider={validateProvider} applySetup={applySetup} />,
    );

    await waitForFrame(lastFrame, "Supabase project created and env files configured.");

    expect(validateProvider).toHaveBeenCalledTimes(4);
    expect(applySetup).toHaveBeenCalledTimes(1);
    expect(lastFrame()).toContain("Mint setup complete.");
    expect(lastFrame()).toContain("Done");
    expect(lastFrame()).toContain("Providers (4/4 ready)");
    expect(lastFrame()).toContain("Supabase project: dupebrew");
    expect(lastFrame()).not.toContain("Step 4 of 4");
    expect(lastFrame()).not.toContain("Run this command:");
  });

  it("stops in repair mode when a provider fails auto-validation", async () => {
    const validateProvider = vi.fn(async provider => ({
      ok: provider !== "posthog",
      message: provider === "posthog" ? "PostHog is missing POSTHOG_PERSONAL_API_KEY." : "validated",
    }));
    const applySetup = vi.fn(async () => ({ok: true, message: "applied"}));
    const {lastFrame} = render(
      <MintInteractiveApp model={createNewFlowModel("dupebrew")} validateProvider={validateProvider} applySetup={applySetup} />,
    );

    await waitForFrame(lastFrame, "Repair PostHog");

    expect(validateProvider).toHaveBeenCalledTimes(4);
    expect(applySetup).not.toHaveBeenCalled();
    expect(lastFrame()).toContain("Some provider access needs attention.");
    expect(lastFrame()).toContain("mint connect posthog");
    expect(lastFrame()).toContain("Keys: Enter recheck selected, r recheck all");
  });
});
