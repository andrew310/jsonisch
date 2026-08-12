import { describe, expect, test } from "vitest";

import { applyBaseline } from "../../methods/apply-baseline";
import { insert, move, remove, swap } from "../../methods/array-ops";
import { getDirtyInput } from "../../methods/get-dirty-input";
import { getInput } from "../../methods/get-input";
import { pickDirty } from "../../methods/pick-dirty";
import { reset } from "../../methods/reset";
import { setEntryMode, setPercentBasis } from "../../methods/set-entry";
import { setInput } from "../../methods/set-input";
import { setMode } from "../../methods/set-mode";
import { envelopesKey } from "../../plugins/envelopes/key";
import type {
  EnvelopeSlot,
  HybridSlot,
  SourceSlot,
} from "../../plugins/envelopes/types";
import { envelopesWire } from "../../plugins/envelopes/wire";
import { derivationKey } from "../../plugins/derivation/key";
import { derivationWire } from "../../plugins/derivation/wire";
import { decodeRecord } from "../codec/decode-record";
import { encodeDirty, envelopeContracts } from "../codec/encode-dirty";
import { createTestStore, getValueStore, objectSchema } from "../vitest/utils";
import type {
  CalcEngine,
  DerivedState,
  InternalFormStore,
  JsonSchema,
  Path,
} from "../types";

/**
 * Minimal stub engine: `x-formula` strings key into scope-reading eval
 * functions (same pattern as the derivation suite; this suite tests the
 * meta channel's wiring around derivation, not derivation itself).
 */
function makeEngine(
  exprs: Record<
    string,
    { deps: string[]; fn: (scope: Record<string, unknown>) => unknown }
  >,
): CalcEngine {
  return {
    parse: (formula) =>
      Object.prototype.hasOwnProperty.call(exprs, formula)
        ? { ok: true, node: exprs[formula] }
        : { ok: false, error: `Unparseable formula: ${formula}` },
    evaluate: (node, scope) =>
      (node as { fn: (scope: Record<string, unknown>) => unknown }).fn(scope),
    extractDependencies: (node) => (node as { deps: string[] }).deps,
  };
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);

function estimateField(formula: string): JsonSchema {
  return { type: "number", "x-field-type": "computed", "x-formula": formula };
}

function hybridField(extra?: JsonSchema): JsonSchema {
  return { type: "string", "x-field-type": "hybrid", ...extra };
}

const doubleA = () => ({
  double: { deps: ["a"], fn: (s: Record<string, unknown>) => num(s.a) * 2 },
});

/**
 * The envelope slot of the field at `path` — the meta half lives in
 * plugin state, keyed by field-store identity (LOS-603).
 */
function slotAt(
  form: InternalFormStore,
  path: Path,
): EnvelopeSlot | undefined {
  return envelopesKey.get(form, getValueStore(form, path));
}

function sourceSlotAt(form: InternalFormStore, path: Path): SourceSlot {
  const slot = slotAt(form, path);
  if (slot?.family !== "source") {
    throw new Error(`Expected a source slot at ${JSON.stringify(path)}`);
  }
  return slot;
}

function hybridSlotAt(form: InternalFormStore, path: Path): HybridSlot {
  const slot = slotAt(form, path);
  if (slot?.family !== "hybrid") {
    throw new Error(`Expected a hybrid slot at ${JSON.stringify(path)}`);
  }
  return slot;
}

/** The mode-aware derived state of the field at `path`. */
function derivedAt(form: InternalFormStore, path: Path): DerivedState {
  const slot = derivationKey.get(form, getValueStore(form, path));
  if (!slot) {
    throw new Error(`No derivation slot at ${JSON.stringify(path)}`);
  }
  return slot.derived.value;
}

/** The always-computed formula candidate (ignores the estimate pin). */
function formulaValueAt(form: InternalFormStore, path: Path): DerivedState {
  const slot = derivationKey.get(form, getValueStore(form, path));
  if (!slot) {
    throw new Error(`No derivation slot at ${JSON.stringify(path)}`);
  }
  return slot.formulaValue.value;
}

const wire = [envelopesWire, derivationWire];

describe("meta channel", () => {
  describe("source envelope decode", () => {
    test("should reopen in formula mode from a calculated envelope even though a value is persisted", () => {
      // The v1c provisional gap: an accepted formula persists its
      // materialized result — value presence must not read as an estimate
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: {
            a: 10,
            fee: { value: 999, source: { mode: "calculated", manualValue: "999" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      expect(sourceSlotAt(store, ["fee"]).mode.value).toBe("formula");
      expect(derivedAt(store, ["fee"])).toStrictEqual({ value: 20, error: null });
    });

    test("should reopen in estimate mode from a manual envelope", () => {
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: {
            a: 10,
            fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      expect(sourceSlotAt(store, ["fee"]).mode.value).toBe("estimate");
      expect(derivedAt(store, ["fee"])).toStrictEqual({
        value: 1234,
        error: null,
      });
    });

    test("should treat a meta half without a mode as manual (janska default)", () => {
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: { a: 10, fee: { source: { manualValue: "5" } } },
          engine: makeEngine(doubleA()),
        },
      );
      expect(sourceSlotAt(store, ["fee"]).mode.value).toBe("estimate");
    });

    test("should default to estimate mode without an envelope (manual-first)", () => {
      // janska parity (LOS-461): a meta-less field is always typeable; the
      // empty-estimate fall-through in derivation keeps dependents on the
      // formula until a real estimate lands
      const schema = objectSchema({
        a: { type: "number" },
        fee: estimateField("double"),
      });
      const withValue = createTestStore(schema, {
        initialInput: { a: 10, fee: 7 },
        engine: makeEngine(doubleA()),
      });
      expect(sourceSlotAt(withValue, ["fee"]).mode.value).toBe("estimate");

      const empty = createTestStore(schema, {
        initialInput: { a: 10 },
        engine: makeEngine(doubleA()),
      });
      expect(sourceSlotAt(empty, ["fee"]).mode.value).toBe("estimate");
    });

    test("should create the mode signal even without a calc engine", () => {
      // envelopes is its own plugin — it does not need derivation
      const store = createTestStore(
        objectSchema({ fee: estimateField("double") }),
        {
          initialInput: { fee: { value: 7, source: { mode: "calculated" } } },
        },
      );
      expect(sourceSlotAt(store, ["fee"]).mode.value).toBe("formula");
      expect(
        derivationKey.get(store, getValueStore(store, ["fee"])),
      ).toBe(undefined);
    });
  });

  describe("hybrid envelope decode", () => {
    test("should decode entry mode and percent basis from the envelope", () => {
      const store = createTestStore(
        objectSchema({
          fee: hybridField({ "x-hybrid-default-denominator": "purchasePrice" }),
        }),
        {
          initialInput: {
            fee: {
              value: "5000",
              entry: { mode: "bps", denominator: "totalCommitment" },
            },
          },
        },
      );
      const slot = hybridSlotAt(store, ["fee"]);
      expect(slot.entryMode.value).toBe("percent");
      expect(slot.percentBasis.value).toBe("totalCommitment");
    });

    test("should default to amount mode and the schema's default basis without an envelope", () => {
      const store = createTestStore(
        objectSchema({
          fee: hybridField({ "x-hybrid-default-denominator": "purchasePrice" }),
        }),
      );
      const slot = hybridSlotAt(store, ["fee"]);
      expect(slot.entryMode.value).toBe("amount");
      expect(slot.percentBasis.value).toBe("purchasePrice");
      expect(slot.isDirty.value).toBe(false);
    });
  });

  describe("envelope decode boundary", () => {
    const schema = objectSchema({
      price: { type: "number" },
      fee: estimateField("double"),
      points: hybridField(),
    });

    test("should split one envelope into the value leaf and the plugin's meta half", () => {
      // Both halves ride ONE key and go through the same `unwrap`, so they
      // cannot disagree — there is no envelope side-channel to decode
      const store = createTestStore(schema, {
        initialInput: decodeRecord(
          schema,
          {
            id: "x",
            data: {
              price: 5,
              fee: { value: 5, source: { mode: "manual", manualValue: "5" } },
              points: {
                value: "100",
                entry: { mode: "bps", denominator: "price" },
              },
            },
          },
          { envelopes: envelopeContracts([envelopesWire]) },
        ),
      });

      // The value half unwrapped into form state — the envelope never leaks
      // into the input signals
      expect(getInput(store)).toStrictEqual({
        price: 5,
        fee: 5,
        points: "100",
      });
      // …and the meta half landed on the plugin's slots
      expect(sourceSlotAt(store, ["fee"]).startMeta).toStrictEqual({
        mode: "manual",
        manualValue: "5",
      });
      const points = hybridSlotAt(store, ["points"]);
      expect(points.entryMode.value).toBe("percent");
      expect(points.percentBasis.value).toBe("price");
    });

    test("should decode a bare (non-envelope) raw defensively", () => {
      const store = createTestStore(schema, { initialInput: { fee: 5 } });
      expect(getValueStore(store, ["fee"]).input.value).toBe(5);
      const slot = sourceSlotAt(store, ["fee"]);
      expect(slot.mode.value).toBe("estimate");
      expect(slot.startMeta).toStrictEqual({});
      expect(slot.manualValue.value).toBe(null);
    });

    test("should ignore stray meta-shaped sibling keys in the record", () => {
      // Nothing writes `<key>Source`/`<key>Hybrid` any more: such a key is
      // undeclared and dies on the schema allow-list
      const store = createTestStore(schema, {
        initialInput: decodeRecord(
          schema,
          {
            data: {
              fee: 5,
              feeSource: { mode: "calculated" },
              pointsHybrid: { mode: "bps", denominator: "price" },
              straySource: { mode: "manual" },
            },
          },
          { envelopes: envelopeContracts([envelopesWire]) },
        ),
      });
      expect(sourceSlotAt(store, ["fee"]).mode.value).toBe("estimate");
      expect(hybridSlotAt(store, ["points"]).entryMode.value).toBe("amount");
    });
  });

  describe("envelope encode into the dirty payload", () => {
    test("should wrap an edited estimate value in its complete envelope", () => {
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: {
            a: 10,
            fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      setInput(store, ["fee"], "1500");
      expect(getDirtyInput(store)).toStrictEqual({
        fee: { value: "1500", source: { mode: "manual", manualValue: "1500" } },
      });
    });

    test("should carry a decoded lastFlippedAt through a value-only edit", () => {
      const store = createTestStore(
        objectSchema({ fee: estimateField("double") }),
        {
          initialInput: {
            fee: {
              value: 1,
              source: {
                mode: "manual",
                manualValue: "1",
                lastFlippedAt: "2026-08-01T00:00:00.000Z",
              },
            },
          },
        },
      );
      setInput(store, ["fee"], "2");
      expect(getDirtyInput(store)).toStrictEqual({
        fee: {
          value: "2",
          source: {
            mode: "manual",
            manualValue: "2",
            lastFlippedAt: "2026-08-01T00:00:00.000Z",
          },
        },
      });
    });

    test("should produce a meta-only envelope for a flip with no other edit", () => {
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: {
            a: 10,
            fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      expect(getDirtyInput(store)).toBe(undefined);

      setMode(store, ["fee"], "formula", { now: "2026-08-04T12:00:00.000Z" });
      // The carried manual value is the DECODED one — the meta half mirrors
      // keystrokes, never the loaded column value — and the value half is
      // dropped entirely: the server recompute authors it (LOS-461)
      expect(getDirtyInput(store)).toStrictEqual({
        fee: {
          source: {
            mode: "calculated",
            manualValue: "1234",
            lastFlippedAt: "2026-08-04T12:00:00.000Z",
          },
        },
      });
    });

    test("should always emit an amount-or-percent envelope COMPLETE", () => {
      const store = createTestStore(
        objectSchema({
          points: hybridField({ "x-hybrid-default-denominator": "purchasePrice" }),
        }),
        { initialInput: { points: "5000" } },
      );
      // A value edit alone never dirties the meta half — but the envelope is
      // one bag key, so the entry state rides along or a partial write would
      // clobber it
      setInput(store, ["points"], "6000");
      expect(hybridSlotAt(store, ["points"]).isDirty.value).toBe(false);
      expect(getDirtyInput(store)).toStrictEqual({
        points: {
          value: "6000",
          entry: { mode: "fixed_amount", denominator: "purchasePrice" },
        },
      });

      setEntryMode(store, ["points"], "percent");
      setPercentBasis(store, ["points"], "totalCommitment");
      expect(getDirtyInput(store)).toStrictEqual({
        points: {
          value: "6000",
          entry: { mode: "bps", denominator: "totalCommitment" },
        },
      });
    });

    test("should wrap in pickDirty even though the supplied value carries no meta", () => {
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: {
            a: 10,
            fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      setMode(store, ["fee"], "formula", { now: "T1" });
      expect(pickDirty(store, { a: 10, fee: 1234 })).toStrictEqual({
        fee: {
          source: {
            mode: "calculated",
            manualValue: "1234",
            lastFlippedAt: "T1",
          },
        },
      });
    });

    test("should route a manual-pinned estimate envelope whole into data", () => {
      const schema = objectSchema({
        a: { type: "number" },
        fee: estimateField("double"),
      });
      const envelope = {
        value: "1500",
        source: { mode: "manual", manualValue: "1500" },
      };
      expect(encodeDirty(schema, { fee: envelope }, { wire })).toStrictEqual({
        columns: {},
        data: { fee: envelope },
      });
    });

    test("should strip the value half of a formula-accepted estimate envelope", () => {
      const schema = objectSchema({
        a: { type: "number" },
        fee: estimateField("double"),
      });
      expect(
        encodeDirty(
          schema,
          {
            fee: {
              value: 1234,
              source: {
                mode: "calculated",
                manualValue: "1234",
                lastFlippedAt: "T1",
              },
            },
          },
          { wire },
        ),
      ).toStrictEqual({
        columns: {},
        data: {
          fee: {
            source: {
              mode: "calculated",
              manualValue: "1234",
              lastFlippedAt: "T1",
            },
          },
        },
      });
    });
  });

  describe("setMode", () => {
    test("estimate→formula should recompute and preserve the manual value in the meta half", () => {
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: {
            a: 10,
            fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      const fee = getValueStore(store, ["fee"]);
      setMode(store, ["fee"], "formula", { now: "T1" });

      expect(derivedAt(store, ["fee"])).toStrictEqual({ value: 20, error: null });
      // The derived value is never written into the input
      expect(fee.input.value).toBe(1234);
      expect(fee.isDirty.value).toBe(false);
      expect(sourceSlotAt(store, ["fee"]).isDirty.value).toBe(true);
    });

    test("formula→estimate should seed the manual value from the last formula result", () => {
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: {
            a: 10,
            fee: { value: 999, source: { mode: "calculated" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      const fee = getValueStore(store, ["fee"]);
      setMode(store, ["fee"], "estimate", { now: "T1" });

      expect(sourceSlotAt(store, ["fee"]).mode.value).toBe("estimate");
      // Seeded like a real edit: value dirty, the envelope carries both halves
      expect(fee.input.value).toBe(20);
      expect(fee.isDirty.value).toBe(true);
      expect(getDirtyInput(store)).toStrictEqual({
        fee: {
          value: 20,
          source: { mode: "manual", manualValue: 20, lastFlippedAt: "T1" },
        },
      });
    });

    test("formula→estimate with an erroring formula should not seed", () => {
      const store = createTestStore(
        objectSchema({ fee: estimateField("broken") }),
        {
          initialInput: { fee: { value: 999, source: { mode: "calculated" } } },
          engine: makeEngine(doubleA()),
        },
      );
      const fee = getValueStore(store, ["fee"]);
      setMode(store, ["fee"], "estimate", { now: "T1" });
      expect(fee.input.value).toBe(999);
      expect(fee.isDirty.value).toBe(false);
    });

    test("should be a no-op for the current mode and throw on a non-estimate field", () => {
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: {
            a: 10,
            fee: { value: 1234, source: { mode: "manual" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      setMode(store, ["fee"], "estimate", { now: "T1" });
      expect(sourceSlotAt(store, ["fee"]).isDirty.value).toBe(false);
      expect(getDirtyInput(store)).toBe(undefined);

      expect(() => setMode(store, ["a"], "formula")).toThrow(/estimate field/);
    });

    test("the candidate keeps computing while pinned (the nudge's read)", () => {
      const store = createTestStore(
        objectSchema({ a: { type: "number" }, fee: estimateField("double") }),
        {
          initialInput: {
            a: 10,
            fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      setInput(store, ["a"], 50);
      expect(derivedAt(store, ["fee"]).value).toBe(1234);
      expect(formulaValueAt(store, ["fee"])).toStrictEqual({
        value: 100,
        error: null,
      });
    });
  });

  describe("row envelopes", () => {
    /**
     * A row's envelope rides the row object's own field key
     * (`{ fee: { value, source } }`) — the same convention as the root, one
     * scope down. There is no envelope bag at any depth.
     */
    const rowSchema = (extra: Record<string, JsonSchema> = {}) =>
      objectSchema({
        a: { type: "number" },
        rows: {
          type: "array",
          items: objectSchema({
            id: { type: "string" },
            a: { type: "number" },
            fee: estimateField("double"),
            ...extra,
          }),
        },
      });

    test("should seed a row estimate's mode from the row's own envelope", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            {
              id: "r1",
              a: 10,
              fee: {
                value: 999,
                source: { mode: "calculated", manualValue: "999" },
              },
            },
            {
              id: "r2",
              a: 3,
              fee: { value: 7, source: { mode: "manual", manualValue: "7" } },
            },
          ],
        },
        engine: makeEngine(doubleA()),
      });

      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("formula");
      // The meta half was built BEFORE the row's derivation graph, so the
      // pin holds
      expect(derivedAt(store, ["rows", 0, "fee"])).toStrictEqual({
        value: 20,
        error: null,
      });

      expect(sourceSlotAt(store, ["rows", 1, "fee"]).mode.value).toBe("estimate");
      expect(derivedAt(store, ["rows", 1, "fee"])).toStrictEqual({
        value: 7,
        error: null,
      });
    });

    test("should default an envelope-less row field to estimate, like root", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [{ id: "r1", a: 10, fee: 5 }, { id: "r2", a: 4 }],
        },
        engine: makeEngine(doubleA()),
      });
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("estimate");
      // An EMPTY estimate still falls through to the formula (LOS-515)
      expect(sourceSlotAt(store, ["rows", 1, "fee"]).mode.value).toBe("estimate");
      expect(derivedAt(store, ["rows", 1, "fee"])).toStrictEqual({
        value: 8,
        error: null,
      });
    });

    test("should decode a row amount-or-percent field's entry state", () => {
      const store = createTestStore(
        objectSchema({
          rows: {
            type: "array",
            items: objectSchema({
              id: { type: "string" },
              points: hybridField({
                "x-hybrid-default-denominator": "purchasePrice",
              }),
            }),
          },
        }),
        {
          initialInput: {
            rows: [
              {
                id: "r1",
                points: {
                  value: "5000",
                  entry: { mode: "bps", denominator: "rowBudget" },
                },
              },
            ],
          },
        },
      );
      const slot = hybridSlotAt(store, ["rows", 0, "points"]);
      expect(slot.entryMode.value).toBe("percent");
      expect(slot.percentBasis.value).toBe("rowBudget");
    });

    test("setMode should flip a row field and seed from its ROW's formula result", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: { value: 999, source: { mode: "calculated" } } },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      const fee = getValueStore(store, ["rows", 0, "fee"]);

      setMode(store, ["rows", 0, "fee"], "estimate", { now: "T1" });
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("estimate");
      // Seeded from the ROW's own `a` (10), not the document's (1)
      expect(fee.input.value).toBe(20);
      expect(fee.isDirty.value).toBe(true);

      setMode(store, ["rows", 0, "fee"], "formula", { now: "T2" });
      const slot = sourceSlotAt(store, ["rows", 0, "fee"]);
      expect(slot.mode.value).toBe("formula");
      // The estimate typed this session is preserved as the manual value
      expect(slot.manualValue.value).toBe(20);
    });

    test("setMode should still throw for a row field with no envelope slot", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: { a: 1, rows: [{ id: "r1", a: 10 }] },
        engine: makeEngine(doubleA()),
      });
      expect(() => setMode(store, ["rows", 0, "a"], "formula")).toThrow(
        /estimate field/,
      );
    });

    test("should serialize a row's meta half INSIDE its own row object", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            {
              id: "r1",
              a: 10,
              fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
            },
            {
              id: "r2",
              a: 3,
              fee: { value: 6, source: { mode: "manual", manualValue: "6" } },
            },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      expect(getDirtyInput(store)).toBe(undefined);

      setMode(store, ["rows", 0, "fee"], "formula", { now: "T1" });

      // The array is atomic — the whole array rides, and EVERY row's
      // envelope leaf is wrapped complete, dirty or not: rows persist
      // wholesale, so a bare value would clobber the stored meta half
      expect(getDirtyInput(store)).toStrictEqual({
        rows: [
          {
            id: "r1",
            a: 10,
            fee: {
              source: {
                mode: "calculated",
                manualValue: "1234",
                lastFlippedAt: "T1",
              },
            },
          },
          {
            id: "r2",
            a: 3,
            fee: { value: 6, source: { mode: "manual", manualValue: "6" } },
          },
        ],
      });
      // A row-only mode flip must enable Save
      expect(store.aggregates.isDirty.value).toBe(true);
    });

    test("should wrap row envelopes in pickDirty even though the value carries no meta", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: { value: 1234, source: { mode: "manual" } } },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      setMode(store, ["rows", 0, "fee"], "formula", { now: "T1" });
      expect(
        pickDirty(store, { a: 1, rows: [{ id: "r1", a: 10, fee: 1234 }] }),
      ).toStrictEqual({
        rows: [
          {
            id: "r1",
            a: 10,
            fee: {
              source: {
                mode: "calculated",
                manualValue: null,
                lastFlippedAt: "T1",
              },
            },
          },
        ],
      });
    });

    test("an estimate value edit inside a row should carry its meta half", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            {
              id: "r1",
              a: 10,
              fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
            },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      setInput(store, ["rows", 0, "fee"], "1500");
      expect(getDirtyInput(store)).toStrictEqual({
        rows: [
          {
            id: "r1",
            a: 10,
            fee: {
              value: "1500",
              source: { mode: "manual", manualValue: "1500" },
            },
          },
        ],
      });
    });

    test("reset should restore a row's mode to its decode baseline", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            {
              id: "r1",
              a: 10,
              fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
            },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      setMode(store, ["rows", 0, "fee"], "formula", { now: "T1" });
      expect(store.aggregates.isDirty.value).toBe(true);

      reset(store);

      const slot = sourceSlotAt(store, ["rows", 0, "fee"]);
      expect(slot.mode.value).toBe("estimate");
      expect(slot.isDirty.value).toBe(false);
      expect(getDirtyInput(store)).toBe(undefined);
    });

    test("applyBaseline should adopt a clean row's fresh meta and keep a flipped one", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: { value: 1, source: { mode: "manual" } } },
            { id: "r2", a: 20, fee: { value: 2, source: { mode: "manual" } } },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      // Row 2 has an in-session flip; row 1 is clean
      setMode(store, ["rows", 1, "fee"], "formula", { now: "T1" });

      applyBaseline(store, {
        data: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: { value: 5, source: { mode: "calculated" } } },
            { id: "r2", a: 20, fee: { value: 2, source: { mode: "manual" } } },
          ],
        },
      });

      // Clean row adopts the server's mode
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("formula");
      // Flipped row keeps the user's in-flight flip
      const flipped = sourceSlotAt(store, ["rows", 1, "fee"]);
      expect(flipped.mode.value).toBe("formula");
      expect(flipped.isDirty.value).toBe(true);

      // A later reset returns to the NEW baseline
      reset(store);
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("formula");
      expect(sourceSlotAt(store, ["rows", 1, "fee"]).mode.value).toBe("estimate");
    });

    test("a row inserted after store init should get its meta channel", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: { a: 1, rows: [] },
        engine: makeEngine(doubleA()),
      });
      insert(store, ["rows"], {
        initialInput: {
          id: "r2",
          a: 4,
          fee: { value: 9, source: { mode: "calculated" } },
        },
      });
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("formula");
      expect(derivedAt(store, ["rows", 0, "fee"])).toStrictEqual({
        value: 8,
        error: null,
      });
      expect(() =>
        setMode(store, ["rows", 0, "fee"], "estimate", { now: "T1" }),
      ).not.toThrow();
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("estimate");
    });

    test("a swapped pair should exchange their modes", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: { value: 1, source: { mode: "calculated" } } },
            { id: "r2", a: 20, fee: { value: 2, source: { mode: "manual" } } },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      swap(store, ["rows"], 0, 1);
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("estimate");
      expect(sourceSlotAt(store, ["rows", 1, "fee"]).mode.value).toBe("formula");

      // Swapping back returns every slot to its decode baseline — clean
      swap(store, ["rows"], 0, 1);
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("formula");
      expect(sourceSlotAt(store, ["rows", 1, "fee"]).isDirty.value).toBe(false);
    });

    test("a removed row should shift the surviving rows' modes down", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: { value: 1, source: { mode: "manual" } } },
            { id: "r2", a: 20, fee: { value: 2, source: { mode: "calculated" } } },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      remove(store, ["rows"], 0);
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("formula");
    });

    test("a stale child past an array shrink must not phantom-dirty the form", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: { value: 1, source: { mode: "manual" } } },
            { id: "r2", a: 20, fee: { value: 2, source: { mode: "manual" } } },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      // Flip the LAST row, then let the server hand back a shorter array:
      // membership was clean locally, so the shrink is adopted and the
      // flipped slot survives only on a store past the live end
      setMode(store, ["rows", 1, "fee"], "formula", { now: "T1" });
      applyBaseline(store, {
        data: {
          a: 1,
          rows: [{ id: "r1", a: 10, fee: { value: 1, source: { mode: "manual" } } }],
        },
      });

      expect(store.aggregates.isDirty.value).toBe(false);
      expect(getDirtyInput(store)).toBe(undefined);
    });

    test("a moved row should take its mode with it", () => {
      const store = createTestStore(rowSchema(), {
        initialInput: {
          a: 1,
          rows: [
            { id: "r1", a: 10, fee: { value: 1, source: { mode: "calculated" } } },
            { id: "r2", a: 20, fee: { value: 2, source: { mode: "manual" } } },
          ],
        },
        engine: makeEngine(doubleA()),
      });
      move(store, ["rows"], 0, 1);
      expect(sourceSlotAt(store, ["rows", 0, "fee"]).mode.value).toBe("estimate");
      expect(sourceSlotAt(store, ["rows", 1, "fee"]).mode.value).toBe("formula");
    });
  });

  describe("reset", () => {
    test("should restore mode, entry state and flip timestamp to the decode baseline", () => {
      const store = createTestStore(
        objectSchema({
          a: { type: "number" },
          fee: estimateField("double"),
          points: hybridField({ "x-hybrid-default-denominator": "purchasePrice" }),
        }),
        {
          initialInput: {
            a: 10,
            fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
            points: "5000",
          },
          engine: makeEngine(doubleA()),
        },
      );
      setMode(store, ["fee"], "formula", { now: "T1" });
      setEntryMode(store, ["points"], "percent");
      setPercentBasis(store, ["points"], "totalCommitment");

      reset(store);

      const fee = sourceSlotAt(store, ["fee"]);
      const points = hybridSlotAt(store, ["points"]);
      expect(fee.mode.value).toBe("estimate");
      expect(fee.isDirty.value).toBe(false);
      expect(fee.lastFlippedAt.value).toBe(undefined);
      expect(points.entryMode.value).toBe("amount");
      expect(points.percentBasis.value).toBe("purchasePrice");
      expect(getDirtyInput(store)).toBe(undefined);
    });

    test("a scoped reset restores only the targeted subtree's slots", () => {
      const store = createTestStore(
        objectSchema({
          a: { type: "number" },
          fee: estimateField("double"),
          other: estimateField("double"),
        }),
        {
          initialInput: {
            a: 10,
            fee: { value: 1234, source: { mode: "manual", manualValue: "1234" } },
            other: { value: 7, source: { mode: "manual", manualValue: "7" } },
          },
          engine: makeEngine(doubleA()),
        },
      );
      setMode(store, ["fee"], "formula", { now: "T1" });
      setMode(store, ["other"], "formula", { now: "T1" });

      // The plugin resets from INSIDE reset's own walk, so a scoped reset
      // stays scoped for free
      reset(store, { path: ["fee"] });

      expect(sourceSlotAt(store, ["fee"]).mode.value).toBe("estimate");
      expect(sourceSlotAt(store, ["fee"]).isDirty.value).toBe(false);
      expect(sourceSlotAt(store, ["other"]).mode.value).toBe("formula");
      expect(sourceSlotAt(store, ["other"]).isDirty.value).toBe(true);
    });
  });
});
