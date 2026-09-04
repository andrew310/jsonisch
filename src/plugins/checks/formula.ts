import type { CalcEngine } from "../../core/types";
import type { CheckDefinition, CheckScope, FormulaOptions } from "./types";

/** Shared messageId for parse/eval failures (plugin catch + host mapping). */
export const UNEVALUABLE_MESSAGE_ID = "unevaluable";

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
        // Engine error rides in `data.error` so the Alert can show it.
        [UNEVALUABLE_MESSAGE_ID]: "{{error}}",
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
      const targets = context.options.targetFieldKeys ?? [];
      const targetPaths = targets.map((key) => [key]);
      const parsed = engine.parse(formula);
      const deps = parsed.ok ? engine.extractDependencies(parsed.node) : [];
      const pathRefs = parsed.ok
        ? (engine.extractPathRefs?.(parsed.node) ?? [])
        : [];
      const collections = new Set(pathRefs.map((ref) => ref.collection));

      return {
        evaluate() {
          if (!parsed.ok) {
            context.report({
              messageId: UNEVALUABLE_MESSAGE_ID,
              data: { error: parsed.error },
              paths: targetPaths,
            });
            return;
          }
          const scope = buildEvalScope(context.scope, deps, collections);
          let out: unknown;
          try {
            out = engine.evaluate(parsed.node, scope);
          } catch (err) {
            context.report({
              messageId: UNEVALUABLE_MESSAGE_ID,
              data: {
                error: err instanceof Error ? err.message : String(err),
              },
              paths: targetPaths,
            });
            return;
          }
          // Indeterminate (engine null/undefined) passes — incomplete data
          // is not a failed check. Only an explicit falsey value fails.
          if (out === null || out === undefined) return;
          if (out) return;
          context.report({
            messageId: "failed",
            data: { message: context.options.message ?? "Failed." },
            paths: targetPaths,
          });
        },
      };
    },
  };
}

/**
 * Eval bag for one formula run. Every dep goes through `scope.get` — pathRef
 * names are NOT forced through `rows()` (a `loan[…]` handle is a plain
 * object; rows would collapse it to `[]`). Collections absent from deps
 * still land via rows() for aggregate-only refs.
 */
function buildEvalScope(
  scope: CheckScope,
  deps: readonly string[],
  collections: ReadonlySet<string>,
): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  for (const dep of deps) {
    bag[dep] = scope.get(dep);
  }
  for (const collection of collections) {
    if (!(collection in bag)) bag[collection] = scope.rows(collection);
  }
  return bag;
}
