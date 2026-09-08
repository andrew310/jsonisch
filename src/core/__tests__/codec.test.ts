import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../vitest/mock"),
);
vi.mock("../framework", () => frameworkMocks);

import { decodeRecord } from "../codec/decode-record";
import { encodeDirty, envelopeContracts } from "../codec/encode-dirty";
import { envelopesWire } from "../../plugins/envelopes/wire";
import { derivationWire } from "../../plugins/derivation/wire";
import { loanStageSchema } from "../vitest/fixtures";
import { createTestStore, objectSchema } from "../vitest/utils";
import { getDirtyInput } from "../../methods/get-dirty-input";
import { pickDirty } from "../../methods/pick-dirty";
import { setInput } from "../../methods/set-input";

beforeEach(resetIdCounter);

/**
 * The standard trio's wire list — the same descriptors the server
 * assembles for save routing (D7: `encodeDirty` is isomorphic and holds no
 * form store).
 */
const wire = [envelopesWire, derivationWire];
const envelopes = envelopeContracts([envelopesWire]);

/**
 * A column-backed estimate field: the whole envelope lands in the data bag
 * and its value half mirrors into the real column.
 */
const columnEstimateSchema = objectSchema({
  appraisedValue: {
    type: "number",
    "x-column": true,
    "x-ui": { control: "estimate" },
    "x-formula": "purchasePrice * 1.1",
  },
});

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

  test("should not read undeclared record keys, including stray meta-shaped keys", () => {
    // The meta half rides INSIDE the field's own entry (LOS-573) — a stray
    // `<key>Source`-shaped bag key is just an undeclared key now
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

  test("should read a bag envelope field WHOLE, both halves on one key", () => {
    const envelope = {
      kind: "estimate",
      value: 1_210_000,
      mode: "estimate",
      manualValue: "1210000",
    };
    expect(
      decodeRecord(
        loanStageSchema,
        { data: { purchasePrice: 2, appraisedValue: envelope } },
        { envelopes },
      ),
    ).toStrictEqual({ purchasePrice: 2, appraisedValue: envelope });
  });

  test("should prefer the data-bag envelope over the mirrored column for an x-column envelope field", () => {
    const envelope = { kind: "estimate", value: 750, mode: "estimate"  };
    expect(
      decodeRecord(
        columnEstimateSchema,
        { appraisedValue: 500, data: { appraisedValue: envelope } },
        { envelopes },
      ),
    ).toStrictEqual({ appraisedValue: envelope });
  });

  test("should fall back to the bare column when an x-column envelope field has no bag entry", () => {
    // A field whose meta was never persisted: the column scalar is all
    // there is, and it decodes defensively as a bare value
    expect(
      decodeRecord(
        columnEstimateSchema,
        { appraisedValue: 500, data: {} },
        { envelopes },
      ),
    ).toStrictEqual({ appraisedValue: 500 });
  });

  test("should read an x-column envelope field from the column without wire contracts", () => {
    // Without the contracts there is no envelope vocabulary — plain
    // `x-column` geometry decides, as for every scalar
    expect(
      decodeRecord(columnEstimateSchema, {
        appraisedValue: 500,
        data: { appraisedValue: { kind: "estimate", value: 750, mode: "estimate"  } },
      }),
    ).toStrictEqual({ appraisedValue: 500 });
  });
});

describe("encodeDirty", () => {
  test("should partition dirty values by x-column into columns and data", () => {
    const encoded = encodeDirty(
      loanStageSchema,
      { loanAmount: 800_000, purchasePrice: 1_100_000 },
      { wire },
    );
    expect(encoded).toStrictEqual({
      columns: { loanAmount: 800_000 },
      data: { purchasePrice: 1_100_000 },
    });
  });

  test("should keep an amount-or-percent envelope WHOLE in the data bag", () => {
    const envelope = {
      kind: "amount-or-percent",
      value: 7_500,
      mode: "percent",
      basis: "loanAmount" ,
    };
    expect(
      encodeDirty(loanStageSchema, { originationFee: envelope }, { wire }),
    ).toStrictEqual({ columns: {}, data: { originationFee: envelope } });
  });

  test("should skip a formula value and strip the value half of a non-pinned estimate", () => {
    // ltv is calculated (formula) — its VALUE is server-recomputed and a
    // client echo must never persist. appraisedValue is an estimate whose
    // envelope says `calculated`: the meta half persists, the value half is
    // left to the server recompute (LOS-461)
    const encoded = encodeDirty(
      loanStageSchema,
      {
        ltv: 0.75,
        appraisedValue: {
          kind: "estimate",
          value: 1_210_000,
          mode: "formula",
          manualValue: "1210000",
        },
      },
      { wire },
    );
    expect(encoded).toStrictEqual({
      columns: {},
      data: {
        appraisedValue: {
          kind: "estimate",
          mode: "formula",
          manualValue: "1210000",
        },
      },
    });
  });

  test("should persist the value half of a manual-pinned estimate", () => {
    const envelope = {
      kind: "estimate",
      value: 1_500,
      mode: "estimate",
      manualValue: 1_500,
    };
    expect(
      encodeDirty(loanStageSchema, { appraisedValue: envelope }, { wire }),
    ).toStrictEqual({ columns: {}, data: { appraisedValue: envelope } });
  });

  test("should drop a bare estimate value carrying no envelope", () => {
    // No envelope means no pin — nothing authorizes persisting the value,
    // so the key is dropped entirely rather than clobbering the stored meta
    expect(
      encodeDirty(loanStageSchema, { appraisedValue: 1_210_000 }, { wire }),
    ).toBeUndefined();
  });

  test("should pass values through bare without wire contracts", () => {
    // The policy lives ENTIRELY in the descriptors: no contracts, no skip
    // and no envelope normalization
    expect(
      encodeDirty(loanStageSchema, {
        ltv: 0.75,
        appraisedValue: 1_210_000,
      }),
    ).toStrictEqual({
      columns: {},
      data: { ltv: 0.75, appraisedValue: 1_210_000 },
    });
  });

  test("should mirror an x-column envelope field's value half into columns", () => {
    const envelope = { kind: "estimate", value: 750, mode: "estimate", manualValue: 750  };
    expect(
      encodeDirty(columnEstimateSchema, { appraisedValue: envelope }, { wire }),
    ).toStrictEqual({
      columns: { appraisedValue: 750 },
      data: { appraisedValue: envelope },
    });
  });

  test("should keep the envelope in data but mirror nothing when the value half is stripped", () => {
    expect(
      encodeDirty(
        columnEstimateSchema,
        { appraisedValue: { kind: "estimate", value: 750, mode: "formula"  } },
        { wire },
      ),
    ).toStrictEqual({
      columns: {},
      data: { appraisedValue: { kind: "estimate", mode: "formula"  } },
    });
  });

  test("should not mirror an envelope value into a column that does not exist", () => {
    const envelope = { kind: "estimate", value: 750, mode: "estimate"  };
    expect(
      encodeDirty(
        columnEstimateSchema,
        { appraisedValue: envelope },
        { wire, knownColumns: new Set<string>() },
      ),
    ).toStrictEqual({ columns: {}, data: { appraisedValue: envelope } });
  });

  test("should drop an x-column key with no matching real column when knownColumns is given", () => {
    const encoded = encodeDirty(
      loanStageSchema,
      { loanAmount: 800_000, borrowerName: "Maria Santos" },
      { wire, knownColumns: new Set(["borrowerName"]) },
    );
    // loanAmount declares x-column but has no real column — only that key
    // is dropped; the rest of the save survives
    expect(encoded).toStrictEqual({
      columns: { borrowerName: "Maria Santos" },
      data: {},
    });
  });

  test("should drop stray meta-shaped sibling keys", () => {
    // Nothing emits `<key>Source`/`<key>Hybrid` any more — such a key is
    // undeclared and dies on the schema allow-list like any other
    const encoded = encodeDirty(
      loanStageSchema,
      {
        purchasePrice: 1,
        loanAmountSource: "manual",
        rogueFieldSource: "manual",
      },
      { wire },
    );
    expect(encoded).toStrictEqual({
      columns: {},
      data: { purchasePrice: 1 },
    });
  });

  test("should drop undeclared and prototype-pollution keys", () => {
    const encoded = encodeDirty(
      loanStageSchema,
      JSON.parse(
        '{"purchasePrice": 1, "rogue": "x", "__proto__": {"polluted": true}}',
      ),
      { wire },
    );
    expect(encoded).toStrictEqual({
      columns: {},
      data: { purchasePrice: 1 },
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("should return undefined for a nullish dirty payload", () => {
    expect(encodeDirty(loanStageSchema, undefined, { wire })).toBeUndefined();
    expect(encodeDirty(loanStageSchema, null, { wire })).toBeUndefined();
  });

  test("should return undefined when nothing survives the allow-list", () => {
    expect(encodeDirty(loanStageSchema, { rogue: "x" }, { wire })).toBeUndefined();
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
      initialInput: decodeRecord(loanStageSchema, record, { envelopes }),
    });
    const dirty = getDirtyInput(store) as
      | Record<string, unknown>
      | undefined;
    expect(dirty).toBeUndefined();
    expect(encodeDirty(loanStageSchema, dirty, { wire })).toBeUndefined();
  });

  test("should route an edited column and bag field to their partitions", () => {
    const record = {
      loanAmount: 750_000,
      borrowerName: "Maria Santos",
      data: { purchasePrice: 1_000_000 },
    };
    const store = createTestStore(loanStageSchema, {
      initialInput: decodeRecord(loanStageSchema, record, { envelopes }),
    });
    setInput(store, ["loanAmount"], 800_000);
    setInput(store, ["purchasePrice"], 1_100_000);

    const dirty = pickDirty(store, {
      loanAmount: 800_000,
      purchasePrice: 1_100_000,
      borrowerName: "Maria Santos",
    });
    expect(encodeDirty(loanStageSchema, dirty, { wire })).toStrictEqual({
      columns: { loanAmount: 800_000 },
      data: { purchasePrice: 1_100_000 },
    });
  });

  test("should round-trip an edited estimate through its envelope", () => {
    const record = {
      data: {
        purchasePrice: 1_000_000,
        appraisedValue: {
          kind: "estimate",
          value: 1_210_000,
          mode: "estimate",
          manualValue: 1_210_000,
        },
      },
    };
    const store = createTestStore(loanStageSchema, {
      initialInput: decodeRecord(loanStageSchema, record, { envelopes }),
    });
    // The value half decoded into form state; the meta half stayed with the
    // envelopes plugin
    setInput(store, ["appraisedValue"], 1_300_000);

    const dirty = getDirtyInput(store) as Record<string, unknown>;
    expect(dirty).toStrictEqual({
      appraisedValue: {
        kind: "estimate",
        value: 1_300_000,
        mode: "estimate",
        manualValue: 1_300_000,
      },
    });
    expect(encodeDirty(loanStageSchema, dirty, { wire })).toStrictEqual({
      columns: {},
      data: {
        appraisedValue: {
          kind: "estimate",
          value: 1_300_000,
          mode: "estimate",
          manualValue: 1_300_000,
        },
      },
    });
  });
});
