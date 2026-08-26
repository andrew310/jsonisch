import { isSafeKey, readOwn } from "../schema-utils";
import type { JsonSchema } from "../types/schema";
import type { VisibleWhen } from "../types/visibility";

/**
 * Resolves the root schema's `allOf` `if/then/else` blocks into one
 * `VisibleWhen` per gated field key (ported from janska-resolver
 * `resolveConditionals`, first-match-wins per key).
 *
 * Supported condition shapes (the only ones in seed + prod schemas):
 *   - `{ const: x }`             → equals x
 *   - `{ enum: [x, y] }`         → one-of [x, y] (LOS-822 multi-value)
 *   - `{ contains: { const: x } }` → contains x (array-valued watchers)
 *
 * A `then` branch keeps the positive op; an `else` branch flips it
 * (`equals` → `not-equals`, `contains` → `not-contains`). Compound
 * conditions (AND across watched fields) are out of scope — the first
 * watched property of an `if` block decides.
 *
 * @param schema The root form schema.
 *
 * @returns The gated field keys mapped to their visibility rule.
 */
export function resolveConditionals(
  schema: JsonSchema,
): Record<string, VisibleWhen> {
  const out: Record<string, VisibleWhen> = {};
  const allOf = (schema as Record<string, unknown>).allOf;
  if (!Array.isArray(allOf)) return out;

  for (const blockRaw of allOf) {
    if (!blockRaw || typeof blockRaw !== "object") continue;
    const block = blockRaw as Record<string, unknown>;
    const condition = parseIfCondition(block.if);
    if (!condition) continue;
    collectBranch(out, block.then, condition.positive);
    collectBranch(out, block.else, condition.negative);
  }

  return out;
}

/**
 * The positive (`then`) and negative (`else`) rule of one `if` condition.
 */
interface Condition {
  positive: VisibleWhen;
  negative: VisibleWhen;
}

/**
 * Parses an `if` block's first watched property into the branch rules.
 */
function parseIfCondition(ifBlock: unknown): Condition | null {
  if (!ifBlock || typeof ifBlock !== "object") return null;
  const props = (ifBlock as Record<string, unknown>).properties;
  if (!props || typeof props !== "object") return null;

  const entries = Object.entries(props as Record<string, unknown>);
  if (entries.length === 0) return null;

  const [field, condRaw] = entries[0]!;
  if (!condRaw || typeof condRaw !== "object") return null;
  const cond = condRaw as Record<string, unknown>;

  if ("const" in cond) {
    return {
      positive: { field, op: "equals", value: cond.const },
      negative: { field, op: "not-equals", value: cond.const },
    };
  }

  if (Array.isArray(cond.enum)) {
    return {
      positive: { field, op: "one-of", value: cond.enum },
      negative: { field, op: "not-one-of", value: cond.enum },
    };
  }

  if ("contains" in cond && cond.contains && typeof cond.contains === "object") {
    const containsConst = (cond.contains as Record<string, unknown>).const;
    if (containsConst !== undefined) {
      return {
        positive: { field, op: "contains", value: containsConst },
        negative: { field, op: "not-contains", value: containsConst },
      };
    }
  }

  return null;
}

/**
 * Records the branch's gated property keys under the given rule.
 */
function collectBranch(
  out: Record<string, VisibleWhen>,
  branch: unknown,
  visibleWhen: VisibleWhen,
): void {
  if (!branch || typeof branch !== "object") return;
  const props = (branch as Record<string, unknown>).properties;
  if (!props || typeof props !== "object") return;
  for (const key of Object.keys(props)) {
    if (!isSafeKey(key) || readOwn(out, key) !== undefined) continue;
    out[key] = visibleWhen;
  }
}
