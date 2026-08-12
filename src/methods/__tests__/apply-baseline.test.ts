import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../../core/vitest/mock"),
);
vi.mock("../../core/framework", () => frameworkMocks);

import {
  createTestStore,
  getArrayStore,
  getValueStore,
  issue,
  objectSchema,
  staticValidator,
} from "../../core/vitest/utils";
import { envelopesKey } from "../../plugins/envelopes/key";
import type { HybridSlot, SourceSlot } from "../../plugins/envelopes/types";
import type { InternalFormStore, Path } from "../../core/types";
import { applyBaseline } from "../apply-baseline";
import { insert, remove } from "../array-ops";
import { getInput } from "../get-input";
import { reset } from "../reset";
import { setEntryMode } from "../set-entry";
import { setInput } from "../set-input";
import { setMode } from "../set-mode";

beforeEach(resetIdCounter);

const flatSchema = objectSchema({
  name: { type: "string" },
  age: { type: "number" },
});

const rowsSchema = objectSchema({
  rows: {
    type: "array",
    items: objectSchema({ label: { type: "string" } }),
  },
});

const idRowsSchema = objectSchema({
  rows: {
    type: "array",
    items: objectSchema({
      id: { type: "string" },
      label: { type: "string" },
    }),
  },
});

describe("applyBaseline", () => {
  describe("value fields", () => {
    test("should adopt the fresh server value on clean fields", () => {
      const store = createTestStore(flatSchema, {
        initialInput: { name: "John", age: 5 },
      });

      applyBaseline(store, { data: { name: "Jane", age: 6 } });

      const name = getValueStore(store, ["name"]);
      expect(name.input.value).toBe("Jane");
      expect(name.startInput.value).toBe("Jane");
      expect(name.initialInput.value).toBe("Jane");
      expect(name.isDirty.value).toBe(false);
      expect(getValueStore(store, ["age"]).input.value).toBe(6);
    });

    test("should keep an in-flight edit and re-diff it against the new baseline", () => {
      const store = createTestStore(flatSchema, {
        initialInput: { name: "John", age: 5 },
      });
      setInput(store, ["name"], "Draft");

      applyBaseline(store, { data: { name: "Jane", age: 6 } });

      const name = getValueStore(store, ["name"]);
      expect(name.input.value).toBe("Draft");
      expect(name.startInput.value).toBe("Jane");
      expect(name.initialInput.value).toBe("Jane");
      expect(name.isDirty.value).toBe(true);
      // The untouched sibling still adopts
      const age = getValueStore(store, ["age"]);
      expect(age.input.value).toBe(6);
      expect(age.isDirty.value).toBe(false);
    });

    test("should turn an edit equal to the fresh server value clean", () => {
      const store = createTestStore(flatSchema, {
        initialInput: { name: "John", age: 5 },
      });
      setInput(store, ["name"], "Jane");
      expect(getValueStore(store, ["name"]).isDirty.value).toBe(true);

      applyBaseline(store, { data: { name: "Jane", age: 5 } });

      const name = getValueStore(store, ["name"]);
      expect(name.input.value).toBe("Jane");
      expect(name.isDirty.value).toBe(false);
      // Edited stays sticky — the user DID change the value this session
      expect(name.isEdited.value).toBe(true);
    });

    test("should route x-column fields through record columns and the rest through the data bag", () => {
      const store = createTestStore(
        objectSchema({
          loanAmount: { type: "number", "x-column": true },
          note: { type: "string" },
        }),
        { initialInput: { loanAmount: 100, note: "old" } },
      );

      applyBaseline(store, { loanAmount: 250, data: { note: "new" } });

      expect(getValueStore(store, ["loanAmount"]).input.value).toBe(250);
      expect(getValueStore(store, ["note"]).input.value).toBe("new");
    });

    test("should be a no-op for a nullish record", () => {
      const store = createTestStore(flatSchema, {
        initialInput: { name: "John", age: 5 },
      });
      setInput(store, ["name"], "Draft");

      applyBaseline(store, null);

      const name = getValueStore(store, ["name"]);
      expect(name.input.value).toBe("Draft");
      expect(name.startInput.value).toBe("John");
      expect(name.isDirty.value).toBe(true);
    });
  });

  describe("array fields", () => {
    test("should adopt server rows on clean membership, keeping surviving row identity", () => {
      const store = createTestStore(rowsSchema, {
        initialInput: { rows: [{ label: "a" }, { label: "b" }] },
      });
      const rows = getArrayStore(store, ["rows"]);
      const liveIds = rows.items.value;

      applyBaseline(store, {
        data: { rows: [{ label: "x" }, { label: "y" }, { label: "z" }] },
      });

      expect(getInput(store, ["rows"])).toStrictEqual([
        { label: "x" },
        { label: "y" },
        { label: "z" },
      ]);
      // Surviving rows keep their IDs (mounted row components keep their
      // identity); only the grown row gets a fresh one
      expect(rows.items.value.slice(0, 2)).toStrictEqual(liveIds);
      expect(rows.items.value).toHaveLength(3);
      expect(rows.startItems.value).toStrictEqual(rows.items.value);
      expect(rows.isDirty.value).toBe(false);
    });

    test("should keep a row's in-flight edit through a clean-membership rebase", () => {
      const store = createTestStore(rowsSchema, {
        initialInput: { rows: [{ label: "a" }, { label: "b" }] },
      });
      setInput(store, ["rows", 0, "label"], "mine");

      applyBaseline(store, {
        data: { rows: [{ label: "x" }, { label: "y" }] },
      });

      const first = getValueStore(store, ["rows", 0, "label"]);
      expect(first.input.value).toBe("mine");
      expect(first.startInput.value).toBe("x");
      expect(first.isDirty.value).toBe(true);
      expect(getValueStore(store, ["rows", 1, "label"]).input.value).toBe("y");
    });

    test("should let locally changed membership win and stay dirty", () => {
      const store = createTestStore(rowsSchema, {
        initialInput: { rows: [{ label: "a" }, { label: "b" }] },
      });
      remove(store, ["rows"], 1);

      applyBaseline(store, {
        data: { rows: [{ label: "x" }, { label: "y" }] },
      });

      expect(getInput(store, ["rows"])).toStrictEqual([
        { label: "a" },
      ]);
      expect(getArrayStore(store, ["rows"]).isDirty.value).toBe(true);
    });

    test("should rebase row content by server id inside changed membership", () => {
      const store = createTestStore(idRowsSchema, {
        initialInput: {
          rows: [
            { id: "r1", label: "a" },
            { id: "r2", label: "b" },
          ],
        },
      });
      insert(store, ["rows"], { initialInput: { id: "", label: "added" } });

      applyBaseline(store, {
        data: {
          rows: [
            { id: "r1", label: "a2" },
            { id: "r2", label: "b2" },
          ],
        },
      });

      // Matched rows adopt the fresh server content; the locally added row
      // is untouched and the membership change survives
      expect(getValueStore(store, ["rows", 0, "label"]).input.value).toBe("a2");
      expect(getValueStore(store, ["rows", 1, "label"]).input.value).toBe("b2");
      expect(getValueStore(store, ["rows", 2, "label"]).input.value).toBe(
        "added",
      );
      expect(getArrayStore(store, ["rows"]).isDirty.value).toBe(true);
    });
  });

  describe("meta channel (the envelopes plugin's envelope half)", () => {
    const estimateSchema = objectSchema({
      price: { type: "number", "x-field-type": "computed" },
    });

    /**
     * The envelopes slot of the field at `path` — the meta half lives in
     * plugin state now, keyed by store identity.
     */
    function slotAt(form: InternalFormStore, path: Path) {
      return envelopesKey.get(form, getValueStore(form, path));
    }

    function sourceSlotAt(form: InternalFormStore, path: Path): SourceSlot {
      const slot = slotAt(form, path);
      if (slot?.family !== "source") throw new Error("Expected a source slot");
      return slot;
    }

    function hybridSlotAt(form: InternalFormStore, path: Path): HybridSlot {
      const slot = slotAt(form, path);
      if (slot?.family !== "hybrid") throw new Error("Expected a hybrid slot");
      return slot;
    }

    test("should adopt the fresh envelope mode on a clean mode", () => {
      const store = createTestStore(estimateSchema, {
        initialInput: {
          price: { value: 10, source: { mode: "manual", manualValue: 10 } },
        },
      });
      expect(sourceSlotAt(store, ["price"]).mode.value).toBe("estimate");

      applyBaseline(store, {
        data: { price: { value: 42, source: { mode: "calculated" } } },
      });

      const price = sourceSlotAt(store, ["price"]);
      expect(price.mode.value).toBe("formula");
      expect(price.startMode.value).toBe("formula");
      // The value half of the same envelope rebased the field's input
      expect(getValueStore(store, ["price"]).input.value).toBe(42);
    });

    test("should keep a user mode flip and turn it clean when it matches the fresh envelope", () => {
      const store = createTestStore(estimateSchema, {
        initialInput: {
          price: { value: 10, source: { mode: "manual", manualValue: 10 } },
        },
      });
      setMode(store, ["price"], "formula", { now: "2026-08-04T00:00:00Z" });
      expect(sourceSlotAt(store, ["price"]).isDirty.value).toBe(true);

      // The post-save echo persisted the flip
      applyBaseline(store, {
        data: { price: { value: 42, source: { mode: "calculated" } } },
      });

      const price = sourceSlotAt(store, ["price"]);
      expect(price.mode.value).toBe("formula");
      expect(price.isDirty.value).toBe(false);
    });

    test("should keep a user mode flip that differs from the fresh envelope", () => {
      const store = createTestStore(estimateSchema, {
        initialInput: {
          price: { value: 10, source: { mode: "manual", manualValue: 10 } },
        },
      });
      setMode(store, ["price"], "formula", { now: "2026-08-04T00:00:00Z" });

      applyBaseline(store, {
        data: {
          price: { value: 42, source: { mode: "manual", manualValue: 42 } },
        },
      });

      const price = sourceSlotAt(store, ["price"]);
      expect(price.mode.value).toBe("formula");
      expect(price.startMode.value).toBe("estimate");
      expect(price.isDirty.value).toBe(true);
    });

    test("should rebase hybrid entry state per signal", () => {
      const store = createTestStore(
        objectSchema({
          fee: { type: "number", "x-field-type": "hybrid" },
        }),
        {
          initialInput: {
            fee: { value: 100, entry: { mode: "fixed_amount", denominator: "" } },
          },
        },
      );
      setEntryMode(store, ["fee"], "percent");

      applyBaseline(store, {
        data: {
          fee: { value: 100, entry: { mode: "bps", denominator: "loanAmount" } },
        },
      });

      const fee = hybridSlotAt(store, ["fee"]);
      // The user's entry-mode flip matches the fresh envelope → clean
      expect(fee.entryMode.value).toBe("percent");
      expect(fee.startEntryMode.value).toBe("percent");
      // The untouched basis adopts the fresh envelope
      expect(fee.percentBasis.value).toBe("loanAmount");
      expect(fee.isDirty.value).toBe(false);
    });
  });

  describe("reset interplay", () => {
    test("should reset to the NEW baseline after applyBaseline", () => {
      const store = createTestStore(flatSchema, {
        initialInput: { name: "John", age: 5 },
      });
      setInput(store, ["name"], "Draft");

      applyBaseline(store, { data: { name: "Jane", age: 6 } });
      reset(store);

      expect(getValueStore(store, ["name"]).input.value).toBe("Jane");
      expect(getValueStore(store, ["age"]).input.value).toBe(6);
      expect(getValueStore(store, ["name"]).isDirty.value).toBe(false);
    });

    test("should reset changed membership to the NEW server rows", () => {
      const store = createTestStore(rowsSchema, {
        initialInput: { rows: [{ label: "a" }] },
      });
      insert(store, ["rows"], { initialInput: { label: "added" } });

      applyBaseline(store, {
        data: { rows: [{ label: "x" }, { label: "y" }, { label: "z" }] },
      });
      reset(store);

      expect(getInput(store, ["rows"])).toStrictEqual([
        { label: "x" },
        { label: "y" },
        { label: "z" },
      ]);
      expect(getArrayStore(store, ["rows"]).isDirty.value).toBe(false);
    });
  });

  describe("form-level state", () => {
    test("should refresh offFormValues in the same call", () => {
      const store = createTestStore(flatSchema, {
        initialInput: { name: "John", age: 5 },
        offFormValues: { external: 1 },
      });

      applyBaseline(
        store,
        { data: { name: "Jane" } },
        { offFormValues: { external: 2 } },
      );

      expect(store.offFormValues.value).toStrictEqual({ external: 2 });
    });

    test("should revalidate against the new baseline in initial mode", () => {
      const store = createTestStore(flatSchema, {
        initialInput: { name: "John", age: 5 },
        validate: "initial",
        validator: staticValidator([issue("/name", "Bad name")]),
      });

      applyBaseline(store, { data: { name: "Jane", age: 6 } });

      expect(getValueStore(store, ["name"]).errors.value).toStrictEqual([
        "Bad name",
      ]);
    });
  });
});
