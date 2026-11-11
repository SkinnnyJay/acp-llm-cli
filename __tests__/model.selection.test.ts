import { describe, expect, it } from "vitest";
import { hasTextOutput, selectModelIds } from "../scripts/model.constants";

describe("selectModelIds", () => {
  it("drops router variants from both inputs", () => {
    expect(selectModelIds(["a", "a:free"], ["b", "b:batch"], { prune: false })).toEqual(["a", "b"]);
  });

  it("returns the union, sorted and de-duplicated, when not pruning", () => {
    expect(selectModelIds(["c", "a"], ["b", "a"], { prune: false })).toEqual(["a", "b", "c"]);
  });

  it("returns only the fetched ids when pruning", () => {
    expect(selectModelIds(["old", "a"], ["b", "a", "b", "x:y"], { prune: true })).toEqual([
      "a",
      "b",
    ]);
  });

  it("keeps the existing ids when nothing was fetched and not pruning", () => {
    expect(selectModelIds(["a", "a:free", "b"], [], { prune: false })).toEqual(["a", "b"]);
  });
});

describe("hasTextOutput", () => {
  it("keeps text output, drops image output, drops a missing field", () => {
    expect(hasTextOutput({ architecture: { output_modalities: ["text"] } })).toBe(true);
    expect(hasTextOutput({ architecture: { output_modalities: ["image", "text"] } })).toBe(false);
    expect(hasTextOutput({ architecture: {} })).toBe(false);
    expect(hasTextOutput({})).toBe(false);
  });
});
