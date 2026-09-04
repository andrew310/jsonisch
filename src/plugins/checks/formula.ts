import type { CalcEngine } from "../../core/types";
import type { CheckDefinition, CheckScope, FormulaOptions } from "./types";

/**
 * The one built-in check definition: a `bespoke.check` row is an *instance*
 * of this, not a definition of its own (ANALYSIS-eslint.md §2.6).
 */
export function formulaCheck(engine: CalcEngine): CheckDefinition<FormulaOptions> {
  return {
    meta: {
      name: "formula",
      messages: {
        failed: "{{message}}",
        unevaluable: "could not be evaluated",
      },
      defaultOptions: {
        formula: "",
        message: "Failed.",
        targetFieldKeys: [],
      },
      optionsSchema: {
        type: "object",
        required: ["formula"],
        properties: {
          formula: { type: "string" },
          message: { type: "string" },
          name: { type: "string" },
          targetFieldKeys: { type: "array", items: { type: "string" } },
        },
      },
    },
    create(context) {
      const formula = context.options.formula;
      const parsed = engine.parse(formula);
      const deps = parsed.ok ? engine.extractDependencies(parsed.node) : [];
      const pathRefs = parsed.ok
        ? (engine.extractPathRefs?.(parsed.node) ?? [])
        : [];
      const collections = new Set(pathRefs.map((ref) => ref.collection));

      return {
        evaluate() {
          if (!parsed.ok) {
            context.report({ messageId: "unevaluable" });
            return;
          }
          const scope = buildEvalScope(context.scope, deps, collections);
          let out: unknown;
          try {
            out = engine.evaluate(parsed.node, scope);
          } catch {
            context.report({ messageId: "unevaluable" });
            return;
          }
          // Indeterminate (engine null/undefined) passes — incomplete data
          // is not a failed check. Only an explicit falsey value fails.
          if (out === null || out === undefined) return;
          if (out) return;
          const targets = context.options.targetFieldKeys ?? [];
          context.report({
            messageId: "failed",
            data: { message: context.options.message ?? "Failed." },
            paths: targets.map((key) => [key]),
          });
        },
      };
    },
  };
}

function buildEvalScope(
  scope: CheckScope,
  deps: readonly string[],
  collections: ReadonlySet<string>,
): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  for (const dep of deps) {
    bag[dep] = collections.has(dep) ? scope.rows(dep) : scope.get(dep);
  }
  for (const collection of collections) {
    if (!(collection in bag)) bag[collection] = scope.rows(collection);
  }
  return bag;
}
