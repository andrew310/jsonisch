import { describe, expect, test } from "vitest";
import { readRelationConfig } from "../relation-config";

describe("readRelationConfig", () => {
  test("classifies a schema:// ref with role", () => {
    const config = readRelationConfig({
      type: "array",
      $ref: "schema://party",
      "x-relation-role": "borrower",
    } as never);
    expect(config?.target).toBe("party");
    expect(config?.role).toBe("borrower");
  });

  test("honors x-relation-multiple on the vendor x-relation-target form", () => {
    const config = readRelationConfig({
      type: "object",
      "x-relation-target": "entity",
      "x-relation-multiple": true,
    } as never);
    expect(config?.target).toBe("entity");
    expect(config?.many).toBe(true);
  });

  test("non-relation node classifies undefined", () => {
    expect(readRelationConfig({ type: "string" } as never)).toBeUndefined();
  });
});
