import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {markProvider, readConnectState} from "../src/state/connectState.js";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), "mint-test-"));
});

afterEach(async () => {
  await rm(projectRoot, {recursive: true, force: true});
});

describe("connect state", () => {
  it("returns an empty state when no file exists", async () => {
    await expect(readConnectState(projectRoot)).resolves.toEqual({version: 1, providers: []});
  });

  it("persists provider status without secrets", async () => {
    await markProvider(projectRoot, "supabase", "skipped");
    const state = await readConnectState(projectRoot);

    expect(state.providers).toHaveLength(1);
    expect(state.providers.at(0)).toMatchObject({key: "supabase", status: "skipped"});
    expect(JSON.stringify(state)).not.toContain("TOKEN");
  });
});
