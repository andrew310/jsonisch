import { describe, expect, test } from "vitest";
import { interpolate } from "../interpolate";

describe("interpolate (eslint {{ }} messages)", () => {
  test("replaces named placeholders from data", () => {
    expect(
      interpolate("Expected {{expected}} and saw {{actual}}", {
        expected: "===",
        actual: "==",
      }),
    ).toBe("Expected === and saw ==");
  });

  test("leaves an unsupplied placeholder literally in place", () => {
    expect(interpolate("hello {{name}}", {})).toBe("hello {{name}}");
    expect(interpolate("hello {{name}}")).toBe("hello {{name}}");
  });

  test("coerces numeric data to string", () => {
    expect(interpolate("max {{n}}", { n: 12 })).toBe("max 12");
  });

  test("trims whitespace inside the braces", () => {
    expect(interpolate("{{ name }}", { name: "Ada" })).toBe("Ada");
  });
});
