import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../vitest/mock"),
);
vi.mock("../framework", () => frameworkMocks);

import { decodeRecord } from "../codec/decode-record";
import { encodeDirty } from "../codec/encode-dirty";
import { loanStageSchema } from "../vitest/fixtures";
import { createTestStore, objectSchema } from "../vitest/utils";
import { getDirtyInput } from "../../methods/get-dirty-input";
import { pickDirty } from "../../methods/pick-dirty";
import { setInput } from "../../methods/set-input";

beforeEach(resetIdCounter);

describe("decodeRecord", () => {
  test("should read x-column fields from record columns and the rest from the data bag", () => {
    const input = decodeRecord(loanStageSchema, {
      id: "ln_1",
      loanAmount: 750_000,
      borrowerName: "Maria Santos",
      data: { purchasePrice: 1_000_000, originationFee: 7_500 },
    });
    expect(input).toStrictEqual({
      loanAmount: 750_000,
      borrowerName: "Maria Santos",
      purchasePrice: 1_000_000,
      originationFee: 7_500,
    });
  });

  test("should leave missing columns and missing bag keys absent", () => {
    const input = decodeRecord(loanStageSchema, {
      loanAmount: 750_000,
      data: {},
    });
    expect(input).toStrictEqual({ loanAmount: 750_000 });
  });

  test("should handle a record without a data bag", () => {
    const input = decodeRecord(loanStageSchema, { loanAmount: 1 });
    expect(input).toStrictEqual({ loanAmount: 1 });
  });

  test("should decode a flat-JSONB surface passed as { data: bag }", () => {
    const schema = objectSchema({
      borrowerName: { type: "string" },
      creditScore: { type: "number" },
    });
    const input = decodeRecord(schema, {
      data: { borrowerName: "Maria Santos", creditScore: 720 },
    });
    expect(input).toStrictEqual({
      borrowerName: "Maria Santos",
      creditScore: 720,
    });
  });

  test("should return undefined for a nullish record", () => {
    expect(decodeRecord(loanStageSchema, null)).toBeUndefined();
    expect(decodeRecord(loanStageSchema, undefined)).toBeUndefined();
  });

  test("should not read undeclared record keys, including companions", () => {
    const input = decodeRecord(loanStageSchema, {
      loanAmount: 1,
      rogueColumn: "x",
      data: {
        purchasePrice: 2,
        appraisedValueSource: "estimate",
        originationFeeHybrid: { mode: "percent" },
        rogueBagKey: "y",
      },
    });
    expect(input).toStrictEqual({ loanAmount: 1, purchasePrice: 2 });
  });

  test("should drop prototype-pollution keys at decode", () => {
    const record = JSON.parse(
      '{"loanAmount": 1, "data": {"__proto__": {"polluted": true}, "constructor": {"bad": 1}, "purchasePrice": 2}}',
    );
    const input = decodeRecord(loanStageSchema, record);
    expect(input).toStrictEqual({ loanAmount: 1, purchasePrice: 2 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("should not resolve declared keys from the prototype chain", () => {
    const schema = objectSchema({ toString: { type: "string" } });
    // `record.toString` exists on Object.prototype — it must not leak in
    expect(decodeRecord(schema, { data: {} })).toStrictEqual({});
  });
});

describe("encodeDirty", () => {
  test("should partition dirty values by x-column into columns and data", () => {
    const encoded = encodeDirty(loanStageSchema, {
      loanAmount: 800_000,
      purchasePrice: 1_100_000,
    });
    expect(encoded).toStrictEqual({
      columns: { loanAmount: 800_000 },
      data: { purchasePrice: 1_100_000 },
      companions: {},
    });
  });

  test("should split companions of declared non-column fields", () => {
    const encoded = encodeDirty(loanStageSchema, {
      originationFee: 7_500,
      appraisedValueSource: "manual",
      originationFeeHybrid: { mode: "percent", denominator: "loanAmount" },
    });
    expect(encoded).toStrictEqual({
      columns: {},
      data: { originationFee: 7_500 },
      companions: {
        appraisedValueSource: "manual",
        originationFeeHybrid: { mode: "percent", denominator: "loanAmount" },
      },
    });
  });

  test("should skip formula-driven values but keep their companions", () => {
    // ltv is calculated (formula) and appraisedValue is computed (estimate)
    // — their VALUES are server-recomputed and a client echo must never
    // persist; the Source companion (mode state) still flows
    const encoded = encodeDirty(loanStageSchema, {
      ltv: 0.75,
      appraisedValue: 1_210_000,
      appraisedValueSource: "manual",
    });
    expect(encoded).toStrictEqual({
      columns: {},
      data: {},
      companions: { appraisedValueSource: "manual" },
    });
  });

  test("should drop an x-column key with no matching real column when knownColumns is given", () => {
    const encoded = encodeDirty(
      loanStageSchema,
      { loanAmount: 800_000, borrowerName: "Maria Santos" },
      { knownColumns: new Set(["borrowerName"]) },
    );
    // loanAmount declares x-column but has no real column — only that key
    // is dropped; the rest of the save survives
    expect(encoded).toStrictEqual({
      columns: { borrowerName: "Maria Santos" },
      data: {},
      companions: {},
    });
  });

  test("should drop companions whose base is a column or undeclared", () => {
    const encoded = encodeDirty(loanStageSchema, {
      purchasePrice: 1,
      loanAmountSource: "manual", // base is an x-column field
      rogueFieldSource: "manual", // base is undeclared
    });
    expect(encoded).toStrictEqual({
      columns: {},
      data: { purchasePrice: 1 },
      companions: {},
    });
  });

  test("should drop undeclared and prototype-pollution keys", () => {
    const encoded = encodeDirty(
      loanStageSchema,
      JSON.parse(
        '{"purchasePrice": 1, "rogue": "x", "__proto__": {"polluted": true}}',
      ),
    );
    expect(encoded).toStrictEqual({
      columns: {},
      data: { purchasePrice: 1 },
      companions: {},
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("should return undefined for a nullish dirty payload", () => {
    expect(encodeDirty(loanStageSchema, undefined)).toBeUndefined();
    expect(encodeDirty(loanStageSchema, null)).toBeUndefined();
  });

  test("should return undefined when nothing survives the allow-list", () => {
    expect(encodeDirty(loanStageSchema, { rogue: "x" })).toBeUndefined();
  });
});

describe("round-trip", () => {
  test("should encode nothing after decode with no edits", () => {
    const record = {
      loanAmount: 750_000,
      borrowerName: "Maria Santos",
      data: { purchasePrice: 1_000_000 },
    };
    const store = createTestStore(loanStageSchema, {
      initialInput: decodeRecord(loanStageSchema, record),
    });
    const dirty = getDirtyInput(store) as
      | Record<string, unknown>
      | undefined;
    expect(dirty).toBeUndefined();
    expect(encodeDirty(loanStageSchema, dirty)).toBeUndefined();
  });

  test("should route an edited column and bag field to their partitions", () => {
    const record = {
      loanAmount: 750_000,
      borrowerName: "Maria Santos",
      data: { purchasePrice: 1_000_000 },
    };
    const store = createTestStore(loanStageSchema, {
      initialInput: decodeRecord(loanStageSchema, record),
    });
    setInput(store, ["loanAmount"], 800_000);
    setInput(store, ["purchasePrice"], 1_100_000);

    const dirty = pickDirty(store, {
      loanAmount: 800_000,
      purchasePrice: 1_100_000,
      borrowerName: "Maria Santos",
    });
    expect(encodeDirty(loanStageSchema, dirty)).toStrictEqual({
      columns: { loanAmount: 800_000 },
      data: { purchasePrice: 1_100_000 },
      companions: {},
    });
  });
});
