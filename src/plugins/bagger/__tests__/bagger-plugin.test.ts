// bagger-plugin.test.ts — build stores with createFormStore directly so the
// plugin array is explicit; mirror core/vitest/utils.ts idiom.
import { describe, expect, test } from "vitest";
import { createFormStore } from "../../../core/form/create-form-store";
import { getFieldStore } from "../../../core/field/get-field-store";
import { insert, remove } from "../../../methods/array-ops";
import { reset } from "../../../methods/reset";
import { envelopes } from "../../envelopes/plugin";
import { envelopesKey } from "../../envelopes/key";
import { visibility } from "../../visibility/plugin";
import { bagger } from "../plugin";

const TRAY_SCHEMA = {
  type: "object",
  properties: {
    assets: {
      type: "array",
      "x-relation-target": "asset",
      items: {
        type: "object",
        properties: { id: { type: "string" }, arv: { type: "number" } },
        allOf: [
          {
            if: { properties: { transaction_type: { const: "purchase" } } },
            then: { properties: { arv: {} } },
          },
        ],
      },
    },
  },
} as never;

const RECORD = {
  assets: [
    { id: "a1", transaction_type: "purchase", data: { arv: 900 } },
    { id: "a2", transaction_type: "refinance", data: {} },
  ],
};

const ESTIMATE_SCHEMA = {
  type: "object",
  properties: {
    assets: {
      type: "array",
      "x-relation-target": "asset",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          arv: { type: "number", "x-ui": { control: "estimate" } },
        },
      },
    },
  },
} as never;

const ESTIMATE_RECORD = {
  assets: [
    {
      id: "a1",
      data: { arv: { kind: "estimate", value: 900, mode: "estimate" } },
    },
  ],
};

function makeForm() {
  return createFormStore({
    schema: TRAY_SCHEMA,
    initialInput: { assets: [{ id: "a1" }, { id: "a2" }] },
    plugins: [envelopes(), bagger(RECORD), visibility()],
  });
}

describe("bagger()", () => {
  test("owns offFormValues: the shelf equals computeBag output", () => {
    const form = makeForm();
    const shelf = form.offFormValues.value as Record<string, unknown>;
    expect(Array.isArray(shelf.assets)).toBe(true);
    expect((shelf.record as Record<string, unknown>).assets).toBeDefined();
  });

  test("the shelf's alias entry follows the form's rootRecordAlias", () => {
    const form = createFormStore({
      schema: TRAY_SCHEMA,
      rootRecordAlias: "invoice",
      initialInput: { assets: [{ id: "a1" }] },
      plugins: [envelopes(), bagger(RECORD), visibility()],
    });
    const shelf = form.offFormValues.value as Record<string, unknown>;
    expect((shelf.invoice as Record<string, unknown>).assets).toBeDefined();
    expect(shelf.record).toBeUndefined();
  });

  test("visibility resolves an unrendered trigger through canon's shelf", () => {
    const form = makeForm();
    expect(getFieldStore(form, ["assets", 0, "arv"]).visible?.value).toBe(true);
    expect(getFieldStore(form, ["assets", 1, "arv"]).visible?.value).toBe(false);
  });

  test("row seeding: declared key gets its canonical value as BASELINE", () => {
    const form = makeForm();
    const arv = getFieldStore(form, ["assets", 0, "arv"]);
    expect(arv.kind === "value" && arv.input.value).toBe(900);
    expect(arv.isDirty.value).toBe(false);
  });

  test("a value the row already holds is never overwritten", () => {
    const form = createFormStore({
      schema: TRAY_SCHEMA,
      initialInput: { assets: [{ id: "a1", arv: 111 }] },
      plugins: [envelopes(), bagger(RECORD), visibility()],
    });
    const arv = getFieldStore(form, ["assets", 0, "arv"]);
    expect(arv.kind === "value" && arv.input.value).toBe(111);
  });

  test("row with no canonical match seeds nothing and does not throw", () => {
    const form = createFormStore({
      schema: TRAY_SCHEMA,
      initialInput: { assets: [{ id: "ghost" }] },
      plugins: [envelopes(), bagger(RECORD), visibility()],
    });
    const arv = getFieldStore(form, ["assets", 0, "arv"]);
    expect(arv.kind === "value" && arv.input.value).toBeUndefined();
  });

  test("estimate-leaf seeding: value half seeds input, meta half seeds the envelope slot, and reset restores both", () => {
    const form = createFormStore({
      schema: ESTIMATE_SCHEMA,
      initialInput: { assets: [{ id: "a1" }] },
      plugins: [envelopes(), bagger(ESTIMATE_RECORD), visibility()],
    });

    const arv = getFieldStore(form, ["assets", 0, "arv"]);
    expect(arv.kind === "value" && arv.input.value).toBe(900);
    expect(arv.isDirty.value).toBe(false);

    const slot = envelopesKey.get(form, arv);
    expect(slot?.family === "estimate" && slot.mode.value).toBe("estimate");

    reset(form);

    expect(arv.kind === "value" && arv.input.value).toBe(900);
    expect(slot?.family === "estimate" && slot.mode.value).toBe("estimate");
  });

  // Classification is stage-independent: the host passes the DATASET
  // schema as `collectionsSchema`, and BOTH the shelf and the row-seeding
  // index read the union. Here the walked schema calls `assets` a plain
  // object array (no relation markers), so only the dataset schema
  // classifies it as a collection.
  test("collectionsSchema classifies a collection the walked schema does not", () => {
    const PLAIN_ARRAY_SCHEMA = {
      type: "object",
      properties: {
        assets: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, arv: { type: "number" } },
          },
        },
      },
    } as never;

    const form = createFormStore({
      schema: PLAIN_ARRAY_SCHEMA,
      initialInput: { assets: [{ id: "a1" }] },
      plugins: [
        envelopes(),
        bagger(RECORD, { collectionsSchema: TRAY_SCHEMA }),
        visibility(),
      ],
    });

    // Shelf: rows flattened — the bag-resident `arv` reads at row level,
    // which is what `SUM(assets[arv])` addresses. Raw loader rows leave it
    // reachable only under `data`.
    const rows = (form.offFormValues.value as Record<string, unknown>)
      .assets as Array<Record<string, unknown>>;
    expect(rows[0]!.arv).toBe(900);

    // Row index: the declared leaf still seeds from its canonical row.
    const arv = getFieldStore(form, ["assets", 0, "arv"]);
    expect(arv.kind === "value" && arv.input.value).toBe(900);
    expect(arv.isDirty.value).toBe(false);
  });

  test("reseedScope: an array row regrown into a reused store re-seeds from its OWN canonical row", () => {
    const form = createFormStore({
      schema: TRAY_SCHEMA,
      // Row 0 ("a2") has no canonical arv; row 1 ("ghost") has no
      // canonical match at all — neither seeds, so a later match at
      // index 1 can only come from a genuine reseed, not leftover state.
      initialInput: { assets: [{ id: "a2" }, { id: "ghost" }] },
      plugins: [envelopes(), bagger(RECORD), visibility()],
    });

    // Shrink: `remove` drops row 1 from `items` but leaves its field store
    // in `children[1]`, stale (core/field/reset-item-state.ts's reuse
    // path addresses it on regrow).
    remove(form, ["assets"], 1);

    // Regrow: `insert` at the freed index reuses that stale store for a
    // DIFFERENT row (`methods/array-ops.ts`'s `resetItemState` branch),
    // which dispatches `reseedScope` — bagger must re-seed the reused
    // store from row "a1"'s canonical data, not row "ghost"'s (which had
    // none) or row 0's.
    insert(form, ["assets"], { at: 1, initialInput: { id: "a1" } });

    const arv = getFieldStore(form, ["assets", 1, "arv"]);
    expect(arv.kind === "value" && arv.input.value).toBe(900);
    expect(arv.isDirty.value).toBe(false);
  });
});
