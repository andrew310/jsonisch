import { describe, expect, test } from "vitest";
import { alignRows } from "../field/align-rows";

describe("alignRows", () => {
  test("places a new server row where the server put it and keeps local ids", () => {
    expect(
      alignRows(
        ["r1", "r2"],
        [
          { label: "baz" },
          { id: "r1", label: "foo-foo" },
          { id: "r2", label: "bar" },
        ],
      ),
    ).toStrictEqual([
      { fromLocalIndex: null },
      { fromLocalIndex: 0 },
      { fromLocalIndex: 1 },
    ]);
  });

  test("keeps same-order ids on their local indices", () => {
    expect(
      alignRows(
        ["r1", "r2"],
        [
          { id: "r1", label: "foo-foo" },
          { id: "r2", label: "bar" },
        ],
      ),
    ).toStrictEqual([{ fromLocalIndex: 0 }, { fromLocalIndex: 1 }]);
  });

  test("uses a local index at most once", () => {
    expect(
      alignRows(["r1"], [{ id: "r1" }, { id: "r1" }]),
    ).toStrictEqual([{ fromLocalIndex: 0 }, { fromLocalIndex: null }]);
  });

  test("does not match empty or missing ids", () => {
    expect(
      alignRows(["", undefined], [{ id: "" }, { label: "baz" }, { id: "r1" }]),
    ).toStrictEqual([
      { fromLocalIndex: null },
      { fromLocalIndex: null },
      { fromLocalIndex: null },
    ]);
  });
});
