import { describe, expect, it } from "vitest";
import { selectionToPixels } from "./crop";

describe("selectionToPixels", () => {
  it("maps CSS coordinates to a 150% scaled screenshot", () => {
    expect(selectionToPixels(
      { left: 100, top: 50, width: 300, height: 80 },
      1000,
      600,
      1500,
      900,
    )).toEqual({ x: 150, y: 75, width: 450, height: 120 });
  });

  it("uses independent axes and clips the result", () => {
    expect(selectionToPixels(
      { left: 900, top: 550, width: 200, height: 100 },
      1000,
      600,
      2000,
      1200,
    )).toEqual({ x: 1800, y: 1100, width: 200, height: 100 });
  });
});
