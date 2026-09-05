import { describe, expect, it } from "vitest";
import { isTargetLookupInput } from "./lookup";

describe("isTargetLookupInput", () => {
  it.each(["skincare", "skincare.", "a piece of cake", "a piece of cake.", "give it a shot", "on the fence"])("treats %s as an explicit lookup", (text) => {
    expect(isTargetLookupInput(text)).toBe(true);
  });

  it.each(["I am on the fence", "This is easier said than done.", "I thought it would be easy, but it wasn't."])("keeps %s in sentence discovery", (text) => {
    expect(isTargetLookupInput(text)).toBe(false);
  });
});
