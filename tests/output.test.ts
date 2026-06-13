import {describe, expect, it} from "vitest";
import {createNewFlowModel} from "../src/core/flowModel.js";
import {chooseOutputMode} from "../src/core/mode.js";
import {renderJson} from "../src/output/json.js";
import {renderText} from "../src/output/text.js";

describe("output modes", () => {
  it("uses json when requested", () => {
    expect(chooseOutputMode({json: true, stdoutIsTty: true})).toBe("json");
  });

  it("uses text in CI", () => {
    expect(chooseOutputMode({stdoutIsTty: true, ci: "1"})).toBe("text");
  });

  it("uses interactive for a TTY outside CI", () => {
    expect(chooseOutputMode({stdoutIsTty: true})).toBe("interactive");
  });
});

describe("renderers", () => {
  it("renders json with the app name", () => {
    const output = renderJson(createNewFlowModel("dream-coach"));
    expect(JSON.parse(output)).toMatchObject({appName: "dream-coach"});
  });

  it("renders default new flow as integrated provisioning", () => {
    const output = renderText(createNewFlowModel("dream-coach"));
    expect(output).toContain("Mint");
    expect(output).toContain("Provision Supabase");
    expect(output).toContain("Mint will create a project");
    expect(output).not.toContain("mint connect");
  });

  it("renders repair commands when connect is disabled", () => {
    const output = renderText(createNewFlowModel("dream-coach", [], {connect: false}));
    expect(output).toContain("mint connect");
  });
});
