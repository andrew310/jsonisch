import { describe, expect, test } from "vitest";

import * as plugin from "../plugin";
import * as react from "../react";
import * as root from "../index";

/**
 * The public surface, pinned. Every runtime export is a semver contract:
 * a name that ships in 0.1.0 cannot be renamed without a breaking change,
 * so this test is where adding one is a deliberate act instead of a side
 * effect of an `export *`. Root is the app-facing form API; `jsonisch/
 * plugin` is machinery for plugin authors and host adapters; everything
 * else is internal and intentionally unreachable.
 *
 * Type-only exports don't exist at runtime, so this pins values — the
 * entry files pin the types by listing them explicitly (no `export *`).
 */

const ROOT_SURFACE = [
  // store
  "DEFAULT_EMPTY_INPUT",
  "DEFAULT_ROOT_RECORD_ALIAS",
  "createFormStore",
  // methods — the verb API
  "applyBaseline",
  "focus",
  "getDeepErrorEntries",
  "getDeepErrors",
  "getDirtyInput",
  "getDirtyPaths",
  "getErrors",
  "getInput",
  "handleSubmit",
  "insert",
  "move",
  "pickDirty",
  "remove",
  "reset",
  "setEntryMode",
  "setErrors",
  "setInput",
  "setMode",
  "setOffFormValues",
  "setPercentBasis",
  "swap",
  "validate",
  // codec — the save/load path
  "decodeRecord",
  "encodeDirty",
  "envelopeContracts",
  "mergeCollectionRows",
  // control + relation classification (widget-facing reads)
  "inferControl",
  "readRelationConfig",
  "relationParentFieldName",
  "relationRowIdentityProps",
  "targetToKind",
  "withRelationRowIdentity",
  // semantic-dirty predicates
  "isEmptyish",
  "isPresenceEqual",
  "isSemanticEqual",
  // scope reads for widgets
  "resolveScopeValue",
  "resolveScopeValueAt",
  // plugin factories + host-facing helpers
  "UNEVALUABLE_MESSAGE_ID",
  "bagger",
  "checks",
  "collectionKeys",
  "computeBag",
  "derivation",
  "derivationWire",
  "envelopes",
  "flattenSourceRow",
  "formulaCheck",
  "replaceCheckInstances",
  "visibility",
  // envelope wire helpers (persisted value shapes hosts handle)
  "envelopesWire",
  "isEnvelope",
  "wrapEstimate",
  "wrapHybrid",
].sort();

const PLUGIN_SURFACE = [
  // signal primitives
  "batch",
  "computed",
  "createSignal",
  "createTracker",
  "getListener",
  "untrack",
  "withListener",
  // plugin system
  "FieldSlotKey",
  "PluginKey",
  "encodeFieldValue",
  "fieldPluginDirty",
  "hasPluginDirtyField",
  "internalOf",
  "pluginsDirty",
  "unwrapLeafInput",
  // first-party plugin keys (slot access)
  "baggerKey",
  "checksKey",
  "derivationKey",
  "envelopesKey",
  "visibilityKey",
  // field-tree reads for adapters
  "focusFieldElement",
  "getFieldBool",
  "getFieldInput",
  "getFieldStore",
  "walkFieldStore",
  // field projection
  "encodeScopeValues",
  "getDirtyFieldInput",
  // row-scope resolution internals
  "canonicalRowOf",
  "findRowStore",
  "resolveRowFallback",
  "resolveRowScopeValue",
  // validation plumbing (methods/validate wraps this)
  "validateFormInput",
].sort();

const REACT_SURFACE = [
  "Field",
  "FieldArray",
  "Form",
  "createFormHook",
  "snapshotEqual",
  "useField",
  "useFieldArray",
  "useForm",
  "useSignalSnapshot",
].sort();

function runtimeNames(mod: Record<string, unknown>): string[] {
  return Object.keys(mod).sort();
}

describe("public surface tripwire", () => {
  test("root exports exactly the app-facing API", () => {
    expect(runtimeNames(root)).toEqual(ROOT_SURFACE);
  });

  test("jsonisch/plugin exports exactly the plugin-author machinery", () => {
    expect(runtimeNames(plugin)).toEqual(PLUGIN_SURFACE);
  });

  test("jsonisch/react surface is unchanged", () => {
    expect(runtimeNames(react)).toEqual(REACT_SURFACE);
  });
});
