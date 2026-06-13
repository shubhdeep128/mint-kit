import {describe, expect, it} from "vitest";
import {render} from "ink-testing-library";
import {createNewFlowModel} from "../src/core/flowModel.js";
import {MintInteractiveApp} from "../src/ui/MintInteractiveApp.js";

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
});
