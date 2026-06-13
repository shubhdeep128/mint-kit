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
    expect(lastFrame()).toContain("Validate every provider");
    expect(lastFrame()).toContain("Apply resources together");
    expect(lastFrame()).not.toContain("mint connect");
  });
});
