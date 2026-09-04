import { computed } from "../../core/framework";
import type { JsonischPlugin } from "../../core/plugin/types";
import { mergeCollectionRows } from "../../core/derivation/merge-collection-rows";
import { readOwn } from "../../core/schema-utils";
import type { InternalFormStore, Path } from "../../core/types";
import { resolveScopeValue } from "../derivation/resolve-scope-value";
import { interpolate } from "./interpolate";
import { checksKey, type ChecksState } from "./key";
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
export { formulaCheck } from "./formula";

const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * Checks plugin (LOS-605 / spec D8): eslint's contract on a form store.
 * Findings are a parallel channel — they never merge into `errors`.
 *
 * Register after derivation so a check that reads a formula field resolves
 * through its derived slot. Array order, not a hard `dependsOn` — a form
 * without a calc engine legitimately omits derivation.
 */
export function checks(config: ChecksConfig): JsonischPlugin<ChecksState> {
  return {
    name: "checks",
    key: checksKey,

    build(form) {
      const scope = freezeScope(form);
      const runtimes = registerInstances(config, scope);

      const perInstance = runtimes.map((runtime) =>
        computed(() => evaluateInstance(runtime)),
      );

      const findings = computed(() => {
        const all: Finding[] = [];
        for (const slot of perInstance) {
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

      return { findings, hasBlockingFinding };
    },
  };
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
  const merged = { ...defaults, ...provided };
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
    const value = (merged as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === "") {
      throw new Error(
        `Check instance "${instance.id}" (${instance.check}): missing option "${key}"`,
      );
    }
  }
  return Object.freeze(merged);
}

function freezeScope(form: InternalFormStore): CheckScope {
  const scope: CheckScope = {
    get(key) {
      return resolveScopeValue(form, key);
    },
    rows(collection) {
      const live = resolveScopeValue(form, collection);
      const canonical = readOwn(form.offFormValues.value, collection);
      if (Array.isArray(canonical)) {
        return mergeCollectionRows(
          canonical as Array<Record<string, unknown>>,
          live,
        );
      }
      return Array.isArray(live)
        ? (live as Array<Record<string, unknown>>)
        : [];
    },
    values() {
      const bag: Record<string, unknown> = {
        ...form.offFormValues.value,
      };
      for (const key of Object.keys(form.children)) {
        bag[key] = scope.get(key);
      }
      return bag;
    },
  };
  return Object.freeze(scope);
}

function evaluateInstance(runtime: InstanceRuntime): Finding[] {
  try {
    runtime.evaluate();
  } catch {
    runtime.takeReports();
    return [
      findingOf(runtime, {
        messageId: "unevaluable",
        message: "could not be evaluated",
      }),
    ];
  }

  const reported = runtime.takeReports();
  const findings: Finding[] = [];
  for (const descriptor of reported) {
    const message = resolveMessage(runtime, descriptor);
    const paths = descriptor.paths;
    if (!paths || paths.length === 0) {
      findings.push(findingOf(runtime, { ...descriptor, message, path: [] }));
      continue;
    }
    for (const path of paths) {
      findings.push(findingOf(runtime, { ...descriptor, message, path }));
    }
  }
  return findings;
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
