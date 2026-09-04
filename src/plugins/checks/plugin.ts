import { computed, createSignal } from "../../core/framework";
import type { JsonischPlugin } from "../../core/plugin/types";
import { mergeCollectionRows } from "../../core/derivation/merge-collection-rows";
import { getFieldInput } from "../../core/field/get-field-input";
import { readOwn } from "../../core/schema-utils";
import type {
  InternalFieldStore,
  InternalFormStore,
  Path,
} from "../../core/types";
import type { ReadonlySignal, Signal } from "../../core/signal";
import { derivationKey } from "../derivation/key";
import { internalOf, type FormRef } from "../../methods/form-ref";
import { interpolate } from "./interpolate";
import { checksKey, type ChecksState } from "./key";
import { UNEVALUABLE_MESSAGE_ID } from "./formula";
import type {
  CheckContext,
  CheckDefinition,
  CheckInstanceConfig,
  CheckScope,
  ChecksConfig,
  Finding,
  FindingDescriptor,
  Severity,
} from "./types";

export { checksKey } from "./key";
export type { ChecksState } from "./key";
export type {
  CheckContext,
  CheckDefinition,
  CheckInstanceConfig,
  CheckScope,
  ChecksConfig,
  Finding,
  FormulaOptions,
  Severity,
  SeverityConfig,
} from "./types";
export { formulaCheck, UNEVALUABLE_MESSAGE_ID } from "./formula";

const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

type CollectionsBag = Readonly<
  Record<string, ReadonlyArray<Record<string, unknown>>>
>;

/**
 * Checks plugin (LOS-605 / spec D8): eslint's contract on a form store.
 * Findings are a parallel channel — they never merge into `errors`.
 *
 * Register after derivation so a check that reads a formula field resolves
 * through its derived slot. Array order, not a hard `dependsOn` — a form
 * without a calc engine legitimately omits derivation.
 *
 * Always register (even with zero instances). Live instance edits go through
 * `replaceCheckInstances` so the host does not remount the form.
 */
export function checks(config: ChecksConfig): JsonischPlugin<ChecksState> {
  return {
    name: "checks",
    key: checksKey,

    build(form) {
      const collections: Signal<CollectionsBag> = createSignal(
        config.collections ?? Object.freeze({}),
      );
      const scope = freezeScope(form, collections);
      const instances: Signal<readonly ReadonlySignal<Finding[]>[]> =
        createSignal(instanceComputeds(config, scope));

      const findings = computed(() => {
        const all: Finding[] = [];
        for (const slot of instances.value) {
          all.push(...slot.value);
        }
        return [...all].sort(
          (a, b) =>
            SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
            a.id.localeCompare(b.id),
        );
      });

      const hasBlockingFinding = computed(() =>
        findings.value.some((finding) => finding.severity === "error"),
      );

      return { findings, hasBlockingFinding, instances, collections };
    },
  };
}

/**
 * Re-registers check instances on a live form store (admin edits, late
 * prop arrival) without remounting. Swaps the per-instance computeds the
 * `findings` signal already reads.
 */
export function replaceCheckInstances(
  form: FormRef,
  config: ChecksConfig,
): void {
  const internal = internalOf(form);
  const state = checksKey.getState(internal);
  if (!state) {
    throw new Error("replaceCheckInstances: checks plugin is not registered");
  }
  state.collections.value = config.collections ?? Object.freeze({});
  const scope = freezeScope(internal, state.collections);
  state.instances.value = instanceComputeds(config, scope);
}

function instanceComputeds(
  config: ChecksConfig,
  scope: CheckScope,
): readonly ReadonlySignal<Finding[]>[] {
  return registerInstances(config, scope).map((runtime) =>
    computed(() => evaluateInstance(runtime)),
  );
}

interface InstanceRuntime {
  readonly id: string;
  readonly checkId: string;
  readonly severity: Severity;
  readonly definition: CheckDefinition<unknown>;
  readonly options: unknown;
  readonly evaluate: () => void;
  readonly takeReports: () => FindingDescriptor[];
}

function registerInstances(
  config: ChecksConfig,
  scope: CheckScope,
): InstanceRuntime[] {
  const runtimes: InstanceRuntime[] = [];
  for (const instance of config.instances) {
    if (instance.severity === "off") continue;
    const definition = config.definitions[instance.check];
    if (!definition) {
      throw new Error(
        `Check instance "${instance.id}" (${instance.check}): unknown definition`,
      );
    }
    const options = mergeAndValidateOptions(instance, definition);
    const reports: FindingDescriptor[] = [];
    const context: CheckContext<unknown> = {
      id: instance.id,
      checkId: instance.check,
      options,
      scope,
      report(finding) {
        reports.push(finding);
      },
    };
    const handlers = definition.create(context);
    runtimes.push({
      id: instance.id,
      checkId: instance.check,
      severity: instance.severity,
      definition,
      options,
      evaluate: () => handlers.evaluate(),
      takeReports: () => {
        const batch = reports.slice();
        reports.length = 0;
        return batch;
      },
    });
  }
  return runtimes;
}

function mergeAndValidateOptions(
  instance: CheckInstanceConfig,
  definition: CheckDefinition<unknown>,
): unknown {
  const defaults =
    definition.meta.defaultOptions &&
    typeof definition.meta.defaultOptions === "object"
      ? definition.meta.defaultOptions
      : {};
  const provided =
    instance.options && typeof instance.options === "object"
      ? instance.options
      : {};
  const merged = { ...defaults, ...provided } as Record<string, unknown>;
  const schema = definition.meta.optionsSchema;
  if (schema === false) return Object.freeze(merged);
  if (schema === undefined) {
    if (Object.keys(provided).length > 0) {
      throw new Error(
        `Check instance "${instance.id}" (${instance.check}): this check takes no options`,
      );
    }
    return Object.freeze(merged);
  }
  const required = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];
  for (const key of required) {
    const value = merged[key];
    // Blank string is a tenant-authored empty formula → unevaluable finding,
    // not a registration throw (admin allows saving blank).
    if (value === undefined || value === null) {
      throw new Error(
        `Check instance "${instance.id}" (${instance.check}): missing option "${key}"`,
      );
    }
  }
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};
  for (const [key, propSchema] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) continue;
    const value = merged[key];
    if (value === undefined) continue;
    validateOptionType(instance, key, value, propSchema);
  }
  return Object.freeze(merged);
}

function validateOptionType(
  instance: CheckInstanceConfig,
  key: string,
  value: unknown,
  propSchema: Record<string, unknown>,
): void {
  const named = `Check instance "${instance.id}" (${instance.check})`;
  if (propSchema.type === "string") {
    if (typeof value !== "string") {
      throw new Error(`${named}: option "${key}" must be a string`);
    }
    return;
  }
  if (propSchema.type === "array") {
    if (!Array.isArray(value)) {
      throw new Error(`${named}: option "${key}" must be an array`);
    }
    const items = propSchema.items as Record<string, unknown> | undefined;
    if (items?.type === "string") {
      for (const entry of value) {
        if (typeof entry !== "string") {
          throw new Error(
            `${named}: option "${key}" must be an array of strings`,
          );
        }
      }
    }
  }
}

/**
 * Live form / derived value only — offForm fill belongs to the derivation
 * closure in `get`, not here.
 */
function resolveLiveFormValue(
  form: InternalFormStore,
  key: string,
): unknown {
  const child = readOwn(form.children, key) as InternalFieldStore | undefined;
  if (!child) return undefined;
  const slot =
    child.kind === "value" ? derivationKey.get(form, child) : undefined;
  if (slot) {
    const state = slot.derived.value;
    return state.error === null ? state.value : undefined;
  }
  return getFieldInput(child);
}

function freezeScope(
  form: InternalFormStore,
  collections: ReadonlySignal<CollectionsBag>,
): CheckScope {
  const get = (key: string): unknown => {
    const formValue = resolveLiveFormValue(form, key);
    const offValue = readOwn(form.offFormValues.value, key);
    const fromCollections = readOwn(collections.value, key);
    const live = formValue === undefined ? offValue : formValue;

    // Plugin canonical collections overlay the live shelf when both are rows.
    if (Array.isArray(fromCollections) && Array.isArray(live)) {
      return mergeCollectionRows(
        fromCollections as Array<Record<string, unknown>>,
        live,
      );
    }
    // Same merge-both-arrays rule as derivation's LOS-514 closure.
    if (Array.isArray(offValue) && Array.isArray(formValue)) {
      return mergeCollectionRows(
        offValue as Array<Record<string, unknown>>,
        formValue,
      );
    }
    return live;
  };

  const scope: CheckScope = {
    get,
    rows(collection) {
      const value = get(collection);
      return Array.isArray(value)
        ? (value as Array<Record<string, unknown>>)
        : [];
    },
    values() {
      const bag: Record<string, unknown> = {
        ...form.offFormValues.value,
      };
      for (const key of Object.keys(form.children)) {
        bag[key] = get(key);
      }
      for (const key of Object.keys(collections.value)) {
        if (!(key in bag)) bag[key] = get(key);
      }
      return bag;
    },
  };
  return Object.freeze(scope);
}

function evaluateInstance(runtime: InstanceRuntime): Finding[] {
  try {
    runtime.evaluate();
  } catch (err) {
    runtime.takeReports();
    const options = runtime.options as {
      targetFieldKeys?: readonly string[];
    };
    const targets = options.targetFieldKeys ?? [];
    const descriptor: FindingDescriptor = {
      messageId: UNEVALUABLE_MESSAGE_ID,
      data: {
        error: err instanceof Error ? err.message : String(err),
      },
      paths: targets.map((key) => [key]),
    };
    return findingsFromDescriptor(runtime, descriptor);
  }

  const reported = runtime.takeReports();
  const findings: Finding[] = [];
  for (const descriptor of reported) {
    findings.push(...findingsFromDescriptor(runtime, descriptor));
  }
  return findings;
}

function findingsFromDescriptor(
  runtime: InstanceRuntime,
  descriptor: FindingDescriptor,
): Finding[] {
  const message = resolveMessage(runtime, descriptor);
  const paths = descriptor.paths;
  if (!paths || paths.length === 0) {
    return [findingOf(runtime, { ...descriptor, message, path: [] })];
  }
  return paths.map((path) =>
    findingOf(runtime, { ...descriptor, message, path }),
  );
}

function resolveMessage(
  runtime: InstanceRuntime,
  descriptor: FindingDescriptor,
): string {
  if (descriptor.message) return descriptor.message;
  if (descriptor.messageId) {
    const template = runtime.definition.meta.messages[descriptor.messageId];
    if (template) return interpolate(template, descriptor.data);
  }
  return "Failed.";
}

function findingOf(
  runtime: InstanceRuntime,
  parts: {
    message: string;
    messageId?: string;
    path?: Path;
  },
): Finding {
  const options = runtime.options as { name?: unknown };
  const name =
    typeof options.name === "string" && options.name.length > 0
      ? options.name
      : runtime.checkId;
  return {
    id: runtime.id,
    checkId: runtime.checkId,
    name,
    messageId: parts.messageId,
    message: parts.message,
    severity: runtime.severity,
    path: parts.path ?? [],
  };
}
