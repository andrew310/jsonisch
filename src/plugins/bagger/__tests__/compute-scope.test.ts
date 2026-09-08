import { describe, expect, test } from "vitest";
import { computeBag } from "../compute-scope";

const SCHEMA = {
  type: "object",
  properties: {
    termMonths: { type: "number" },
    assets: {
      type: "array",
      "x-relation-target": "asset",
      items: { type: "object", properties: { id: { type: "string" } } },
    },
    lendingBranch: { $ref: "schema://entity" },
  },
} as never;

describe("computeBag", () => {
  test("bag wins over columns; scalars land flat", () => {
    const scope = computeBag(SCHEMA, {
      termMonths: 12,
      data: { termMonths: 24, custom: "x" },
    });
    expect(scope.termMonths).toBe(24);
    expect(scope.custom).toBe("x");
  });

  test("collection rows flatten and ride under the field key", () => {
    const scope = computeBag(SCHEMA, {
      assets: [{ id: "a1", purchaseAmount: 5, data: { arv: 7 } }],
    });
    expect(scope.assets).toEqual([
      expect.objectContaining({ id: "a1", purchaseAmount: 5, arv: 7 }),
    ]);
  });

  test("kind envelopes unwrap to their value half on the shelf", () => {
    const scope = computeBag(SCHEMA, {
      assets: [
        { id: "a1", data: { arv: { kind: "estimate", value: 900, mode: "estimate" } } },
      ],
    });
    expect((scope.assets as Array<Record<string, unknown>>)[0]!.arv).toBe(900);
  });

  test("whole scope aliases under `record` by default", () => {
    const scope = computeBag(SCHEMA, { termMonths: 12 });
    expect((scope.record as Record<string, unknown>).termMonths).toBe(12);
  });

  test("whole scope aliases under a configured rootRecordAlias", () => {
    const scope = computeBag(SCHEMA, { termMonths: 12 }, { rootRecordAlias: "loan" });
    expect((scope.loan as Record<string, unknown>).termMonths).toBe(12);
  });

  test("missing collection key resolves to an empty array, no throw", () => {
    expect(computeBag(SCHEMA, {}).assets).toEqual([]);
  });

  test("single-pick relation (many: false) keeps its ref object, not []", () => {
    const scope = computeBag(SCHEMA, {
      lendingBranch: { id: "e1", name: "Branch" },
    });
    expect(scope.lendingBranch).toEqual({ id: "e1", name: "Branch" });
  });
});

/**
 * Collection classification is stage-independent: a stage that configures
 * no assets relation must still put FLATTENED asset rows on the shelf, or
 * `SUM(assets[assignmentFee])` reads undefined per row.
 */
const STAGE_WITHOUT_ASSETS = {
  type: "object",
  properties: {
    termMonths: { type: "number" },
    borrowers: {
      type: "array",
      "x-relation-target": "party",
    },
  },
} as never;

describe("computeBag with a collectionsSchema", () => {
  test("a collection only the dataset schema declares still flattens", () => {
    const scope = computeBag(
      STAGE_WITHOUT_ASSETS,
      {
        assets: [
          {
            id: "a1",
            purchaseAmount: 5,
            data: { arv: { kind: "estimate", value: 900, mode: "estimate" } },
          },
        ],
      },
      { collectionsSchema: SCHEMA },
    );
    expect(scope.assets).toEqual([
      expect.objectContaining({ id: "a1", purchaseAmount: 5, arv: 900 }),
    ]);
  });

  test("union, not replace: the walked schema's own relations survive", () => {
    const scope = computeBag(
      STAGE_WITHOUT_ASSETS,
      { borrowers: [{ id: "p1", data: { creditScore: 700 } }] },
      { collectionsSchema: SCHEMA },
    );
    expect(scope.borrowers).toEqual([
      expect.objectContaining({ id: "p1", creditScore: 700 }),
    ]);
    expect(scope.assets).toEqual([]);
  });

  test("a ref OBJECT under a collection-classified key is never clobbered", () => {
    const scope = computeBag(
      STAGE_WITHOUT_ASSETS,
      { assets: { id: "a1", label: "1 Main St" } },
      { collectionsSchema: SCHEMA },
    );
    expect(scope.assets).toEqual({ id: "a1", label: "1 Main St" });
  });
});
