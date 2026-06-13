import {describe, expect, it, vi} from "vitest";
import {render} from "ink-testing-library";
import {createNewFlowModel} from "../src/core/flowModel.js";
import {MintInteractiveApp} from "../src/ui/MintInteractiveApp.js";

async function waitForRender() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe("MintInteractiveApp", () => {
  it("renders the integrated new flow", () => {
    const {lastFrame} = render(<MintInteractiveApp model={createNewFlowModel("dream-coach")} />);

    expect(lastFrame()).toContain("Mint");
    expect(lastFrame()).toContain("dream-coach");
    expect(lastFrame()).toContain("Supabase");
    expect(lastFrame()).toContain("Step 1 of 4: Supabase");
    expect(lastFrame()).toContain("mint connect supabase --login");
    expect(lastFrame()).toContain("press Enter");
    expect(lastFrame()).toContain("No provider resources have been created");
    expect(lastFrame()).toContain("Keys");
    expect(lastFrame()).not.toContain("skip");
  });

  it("finishes instead of staying on the final provider after all providers validate", async () => {
    const validateProvider = vi.fn(async () => ({ok: true, message: "validated"}));
    const {lastFrame, stdin} = render(
      <MintInteractiveApp model={createNewFlowModel("dupebrew")} validateProvider={validateProvider} />,
    );

    for (let index = 0; index < 4; index += 1) {
      stdin.write("\r");
      await waitForRender();
    }

    expect(validateProvider).toHaveBeenCalledTimes(4);
    expect(lastFrame()).toContain("Provider setup complete.");
    expect(lastFrame()).toContain("Ready for apply");
    expect(lastFrame()).toContain("Providers (4/4 ready)");
    expect(lastFrame()).toContain("Keys: Enter finish, q quit");
    expect(lastFrame()).not.toContain("Step 4 of 4");
    expect(lastFrame()).not.toContain("Run this command:");
  });
});
