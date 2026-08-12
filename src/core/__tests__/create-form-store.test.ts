import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../vitest/mock"),
);
vi.mock("../framework", () => frameworkMocks);

import { getFieldInput } from "../field/get-field-input";
import { createFormStore } from "../form/create-form-store";
import { envelopes } from "../../plugins/envelopes/plugin";
import { envelopesKey } from "../../plugins/envelopes/key";
import { derivation } from "../../plugins/derivation/plugin";
import { visibility } from "../../plugins/visibility/plugin";
import type { CalcEngine } from "../types";
import { assetsSchema, workflowFormSchema } from "../vitest/fixtures";
import {
  createTestStore,
  getArrayStore,
  getObjectStore,
  getValueStore,
  objectSchema,
} from "../vitest/utils";

beforeEach(resetIdCounter);

describe("createFormStore", () => {
  describe("schema walk structure", () => {
    test("should build value nodes for a flat object schema", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" }, age: { type: "number" } }),
      );
      expect(store.kind).toBe("object");
      expect(store.children.name.kind).toBe("value");
      expect(store.children.age.kind).toBe("value");
    });

    test("should build nested object nodes with paths", () => {
      const store = createTestStore(
        objectSchema({
          user: objectSchema({ email: { type: "string" } }),
        }),
      );
      const user = getObjectStore(store, ["user"]);
      expect(user.path).toStrictEqual(["user"]);
      expect(user.children.email.path).toStrictEqual(["user", "email"]);
      expect(user.children.email.name).toBe("email");
    });

    test("should name the root store with an empty string", () => {
      const store = createTestStore(objectSchema({ name: { type: "string" } }));
      expect(store.name).toBe("");
      expect(store.path).toStrictEqual([]);
    });

    test("should build an array of objects with one child per initial item", () => {
      const store = createTestStore(assetsSchema, {
        initialInput: {
          assets: [
            { label: "123 Main St", purchasePrice: 250_000 },
            { label: "456 Oak Ave", purchasePrice: 410_000 },
          ],
        },
      });
      const assets = getArrayStore(store, ["assets"]);
      expect(assets.items.value).toHaveLength(2);
      expect(assets.children).toHaveLength(2);
      expect(assets.children[1].kind).toBe("object");
      expect(
        getValueStore(store, ["assets", 1, "purchasePrice"]).input.value,
      ).toBe(410_000);
      expect(assets.children[0].path).toStrictEqual(["assets", 0]);
    });

    test("should build an array of primitives", () => {
      const store = createTestStore(
        objectSchema({ tags: { type: "array", items: { type: "string" } } }),
        { initialInput: { tags: ["a", "b"] } },
      );
      const tags = getArrayStore(store, ["tags"]);
      expect(tags.items.value).toHaveLength(2);
      expect(getValueStore(store, ["tags", 0]).input.value).toBe("a");
    });

    test("should keep an items-less array-typed node as an atomic value leaf", () => {
      // Legacy relation arrays (e.g. loan.assignee) have no item schema —
      // the whole array is the value
      const store = createTestStore(
        objectSchema({
          assignee: { type: "array", "x-relation-target": "contact" },
        }),
        { initialInput: { assignee: ["ct_1", "ct_2"] } },
      );
      const assignee = getValueStore(store, ["assignee"]);
      expect(assignee.input.value).toStrictEqual(["ct_1", "ct_2"]);
    });

    test("should build a value leaf for a $ref relation node", () => {
      const store = createTestStore(
        objectSchema({ lendingBranch: { $ref: "schema://entity" } }),
        { initialInput: { lendingBranch: "en_1" } },
      );
      expect(getValueStore(store, ["lendingBranch"]).input.value).toBe("en_1");
    });

    test("should build a value leaf for an enum-only node", () => {
      const store = createTestStore(
        objectSchema({ status: { enum: ["draft", "final"] } }),
      );
      expect(store.children.status.kind).toBe("value");
    });
  });

  describe("empty-input defaulting", () => {
    test("should default a required string to empty string", () => {
      const store = createTestStore(objectSchema({ name: { type: "string" } }));
      expect(getValueStore(store, ["name"]).input.value).toBe("");
    });

    test("should default a required non-string to undefined", () => {
      const store = createTestStore(
        objectSchema({ age: { type: "number" }, done: { type: "boolean" } }),
      );
      expect(getValueStore(store, ["age"]).input.value).toBeUndefined();
      expect(getValueStore(store, ["done"]).input.value).toBeUndefined();
    });

    test("should keep an optional string undefined", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }, []),
      );
      expect(getValueStore(store, ["name"]).input.value).toBeUndefined();
    });

    test("should apply a custom per-type empty input", () => {
      const store = createTestStore(
        objectSchema({ age: { type: "number" } }),
        { emptyInput: { number: 0 } },
      );
      expect(getValueStore(store, ["age"]).input.value).toBe(0);
    });

    test("should allow opting a type out of the default empty input", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }),
        { emptyInput: { string: undefined } },
      );
      expect(getValueStore(store, ["name"]).input.value).toBeUndefined();
    });

    test("should prefer an explicit initial input over the empty input", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }),
        { initialInput: { name: "John" } },
      );
      expect(getValueStore(store, ["name"]).input.value).toBe("John");
    });

    test("should preserve null on a nullable field", () => {
      const store = createTestStore(
        objectSchema({ name: { type: ["string", "null"] } }),
        { initialInput: { name: null } },
      );
      expect(getValueStore(store, ["name"]).input.value).toBeNull();
    });

    test("should preserve null on an optional field", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }, []),
        { initialInput: { name: null } },
      );
      expect(getValueStore(store, ["name"]).input.value).toBeNull();
    });

    test("should set all three inputs to the same value and stay clean", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }),
        { initialInput: { name: "John" } },
      );
      const name = getValueStore(store, ["name"]);
      expect(name.initialInput.value).toBe("John");
      expect(name.startInput.value).toBe("John");
      expect(name.input.value).toBe("John");
      expect(name.isDirty.value).toBe(false);
      expect(name.isTouched.value).toBe(false);
      expect(name.isEdited.value).toBe(false);
      expect(name.errors.value).toBeNull();
    });
  });

  describe("container input sentinel", () => {
    test("should mark a present object container as true", () => {
      const store = createTestStore(
        objectSchema({ user: objectSchema({ name: { type: "string" } }) }),
        { initialInput: { user: { name: "John" } } },
      );
      expect(getObjectStore(store, ["user"]).input.value).toBe(true);
    });

    test("should mark a required container without input as present", () => {
      const store = createTestStore(
        objectSchema({ user: objectSchema({ name: { type: "string" } }) }),
      );
      expect(getObjectStore(store, ["user"]).input.value).toBe(true);
    });

    test("should keep null for a nullable object container", () => {
      const store = createTestStore(
        objectSchema({
          user: {
            ...objectSchema({ name: { type: "string" } }),
            type: ["object", "null"],
          },
        }),
        { initialInput: { user: null } },
      );
      expect(getObjectStore(store, ["user"]).input.value).toBeNull();
    });

    test("should keep undefined for an optional array container", () => {
      const store = createTestStore(
        objectSchema(
          { tags: { type: "array", items: { type: "string" } } },
          [],
        ),
      );
      const tags = getArrayStore(store, ["tags"]);
      expect(tags.input.value).toBeUndefined();
      expect(tags.items.value).toHaveLength(0);
    });
  });

  describe("unsupported schema shapes", () => {
    test("should throw when the root schema is not an object schema", () => {
      expect(() =>
        createFormStore({ schema: { type: "string" } }),
      ).toThrow('must be an "object" schema');
    });

    test("should walk a property-less object as an opaque value leaf", () => {
      // Structured whole-object values (interest-rate, ledger line, map
      // bags): no allow-list to walk into, the widget owns the object
      const store = createTestStore(
        objectSchema({
          lookup: { type: "object", additionalProperties: { type: "string" } },
        }),
        { initialInput: { lookup: { a: "1" } } },
      );
      const lookup = getValueStore(store, ["lookup"]);
      expect(lookup.kind).toBe("value");
      expect(lookup.input.value).toEqual({ a: "1" });
    });

    test("should walk an array of property-less objects as an opaque value leaf", () => {
      // Opaque row shapes (address entries, phone entries): the whole
      // array is the value
      const store = createTestStore(
        objectSchema({
          addresses: { type: "array", items: { type: "object" } },
        }),
        { initialInput: { addresses: [{ street: "1 Main" }] } },
      );
      const addresses = getValueStore(store, ["addresses"]);
      expect(addresses.kind).toBe("value");
      expect(addresses.input.value).toEqual([{ street: "1 Main" }]);
    });

    test("should throw on a schema with no type and no structure", () => {
      expect(() =>
        createTestStore(objectSchema({ mystery: {} })),
      ).toThrow("Unsupported schema");
    });

    test("should throw on tuple items", () => {
      expect(() =>
        createTestStore(
          objectSchema({
            pair: {
              type: "array",
              items: [{ type: "string" }, { type: "number" }] as never,
            },
          }),
        ),
      ).toThrow("Tuple");
    });
  });

  describe("allow-list invariant at init", () => {
    test("should not create nodes for undeclared initialInput keys", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }),
        { initialInput: { name: "John", rogue: "nope" } },
      );
      expect(store.children.rogue).toBeUndefined();
      expect(getFieldInput(store)).toStrictEqual({ name: "John" });
    });

    test("should filter undeclared nested keys from the tree", () => {
      const store = createTestStore(
        objectSchema({ user: objectSchema({ name: { type: "string" } }) }),
        { initialInput: { user: { name: "John", ssn: "123-45-6789" } } },
      );
      expect(getFieldInput(store)).toStrictEqual({ user: { name: "John" } });
    });

    test("should skip prototype-pollution keys declared in the schema", () => {
      const store = createTestStore(
        objectSchema({
          name: { type: "string" },
          ["__proto__"]: { type: "string" },
          constructor: { type: "string" },
        }),
        { initialInput: { name: "John" } },
      );
      expect(Object.keys(store.children)).toStrictEqual(["name"]);
      expect(getFieldInput(store)).toStrictEqual({ name: "John" });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    test("should not resolve declared prototype-named keys from the prototype chain", () => {
      // "toString" is a legal JSON-Schema property name; when the record
      // omits it, the field must default — never inherit the function
      const store = createTestStore(
        objectSchema({ toString: { type: "string" } }),
        { initialInput: {} },
      );
      expect(getFieldInput(store)).toStrictEqual({ toString: "" });
    });

    test("should ignore prototype-pollution keys in initialInput", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }),
        {
          initialInput: JSON.parse(
            '{"name":"John","__proto__":{"polluted":true}}',
          ),
        },
      );
      expect(getFieldInput(store)).toStrictEqual({ name: "John" });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe("settled vocabulary on the tree", () => {
    test("should resolve controls for the workflow form fixture", () => {
      const store = createTestStore(workflowFormSchema);
      expect(store.children.borrowerName.control).toBe("text");
      expect(store.children.loanPurpose.control).toBe("select");
      expect(store.children.creditScore.control).toBe("number");
      expect(store.children.isEntity.control).toBe("boolean");
      expect(store.children.closingDate.control).toBe("date");
      expect(store.children.notes.control).toBe("textarea");
    });

    test("should mark object-array controls on repeating sub-forms", () => {
      const store = createTestStore(assetsSchema, {
        initialInput: { assets: [{ label: "A" }] },
      });
      expect(store.children.assets.control).toBe("object-array");
      expect(getValueStore(store, ["assets", 0, "purchasePrice"]).control).toBe(
        "currency",
      );
    });

    test("should store form-level state signals", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }),
        { offFormValues: { appraisedAiv: 500_000 } },
      );
      expect(store.isSubmitting.value).toBe(false);
      expect(store.isSubmitted.value).toBe(false);
      expect(store.isValidating.value).toBe(false);
      expect(store.offFormValues.value).toStrictEqual({
        appraisedAiv: 500_000,
      });
    });
  });

  describe("plugin registration", () => {
    const estimateSchema = objectSchema({
      a: { type: "number" },
      fee: {
        type: "number",
        "x-field-type": "computed",
        "x-formula": "a * 2",
      },
    });

    const noopEngine: CalcEngine = {
      parse: () => ({ ok: true, node: null }),
      evaluate: () => 0,
      extractDependencies: () => [],
    };

    test("should throw when derivation is registered without envelopes", () => {
      // The D2 data-loss scenario: with no mode signal the estimate pin
      // silently never engages and the next recompute overwrites a manually
      // pinned value — so a missing dependency is a startup error naming
      // both plugins, not a formula bug months later
      expect(() =>
        createFormStore({
          schema: estimateSchema,
          plugins: [derivation(noopEngine)],
        }),
      ).toThrow(/"derivation" requires plugin "envelopes" earlier/);
    });

    test("should throw when envelopes is registered AFTER derivation", () => {
      expect(() =>
        createFormStore({
          schema: estimateSchema,
          plugins: [derivation(noopEngine), envelopes()],
        }),
      ).toThrow(/"derivation" requires plugin "envelopes" earlier/);
    });

    test("should throw on a duplicate plugin name", () => {
      expect(() =>
        createFormStore({
          schema: estimateSchema,
          plugins: [envelopes(), envelopes()],
        }),
      ).toThrow(/Duplicate jsonisch plugin name "envelopes"/);
    });

    test("should throw on a typo'd hook name", () => {
      // A hook that never runs is invisible; the driver refuses instead
      expect(() =>
        createFormStore({
          schema: estimateSchema,
          plugins: [{ ...envelopes(), rebaseField: () => {} } as never],
        }),
      ).toThrow(/Unknown member "rebaseField"/);
    });

    test("should flatten falsy entries and nested arrays", () => {
      const engine: CalcEngine | undefined = undefined;
      const store = createFormStore({
        schema: estimateSchema,
        plugins: [envelopes(), engine && derivation(engine), [visibility()]],
      });
      // envelopes built its slot; the conditional derivation simply is not
      // registered
      expect(
        envelopesKey.get(store, getValueStore(store, ["fee"]))?.family,
      ).toBe("source");
    });

    test("should build no plugin state at all without plugins", () => {
      const store = createFormStore({ schema: estimateSchema });
      expect(store.pluginDriver.plugins).toStrictEqual([]);
      expect(
        envelopesKey.get(store, getValueStore(store, ["fee"])),
      ).toBe(undefined);
    });
  });
});
