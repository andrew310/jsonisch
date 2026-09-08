import type { CalcEngine, CalcParseResult } from "jsonisch";

// The DEMO's calc engine, not jsonisch's — jsonisch has no expression
// language. It takes whatever engine the host injects (parse / evaluate /
// extractDependencies) and owns only the scope construction and dependency
// wiring. This one does `a + b * c` arithmetic and nothing else.

type CalcNode =
  | { kind: "num"; value: number }
  | { kind: "ref"; name: string }
  | { kind: "neg"; operand: CalcNode }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: CalcNode; right: CalcNode };

const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([+\-*/()]))/y;

function tokenize(formula: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  let end = 0;
  while ((match = TOKEN.exec(formula))) {
    tokens.push(match[1] ?? match[2] ?? match[3]!);
    end = TOKEN.lastIndex;
  }
  if (end < formula.trimEnd().length) {
    throw new Error(`Unexpected character at position ${end}`);
  }
  return tokens;
}

function parseTokens(tokens: string[]): CalcNode {
  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];

  function factor(): CalcNode {
    const token = next();
    if (token === undefined) throw new Error("Unexpected end of formula");
    if (token === "-") return { kind: "neg", operand: factor() };
    if (token === "(") {
      const inner = expression();
      if (next() !== ")") throw new Error("Missing closing parenthesis");
      return inner;
    }
    if (/^\d/.test(token)) return { kind: "num", value: Number(token) };
    if (/^[A-Za-z_]/.test(token)) return { kind: "ref", name: token };
    throw new Error(`Unexpected token "${token}"`);
  }

  function term(): CalcNode {
    let node = factor();
    while (peek() === "*" || peek() === "/") {
      node = { kind: "bin", op: next() as "*" | "/", left: node, right: factor() };
    }
    return node;
  }

  function expression(): CalcNode {
    let node = term();
    while (peek() === "+" || peek() === "-") {
      node = { kind: "bin", op: next() as "+" | "-", left: node, right: term() };
    }
    return node;
  }

  const node = expression();
  if (index < tokens.length) throw new Error(`Unexpected token "${peek()}"`);
  return node;
}

function evaluateNode(node: CalcNode, scope: Record<string, unknown>): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "ref": {
      const raw = scope[node.name];
      const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`Waiting on ${node.name}`);
      }
      return value;
    }
    case "neg":
      return -evaluateNode(node.operand, scope);
    case "bin": {
      const left = evaluateNode(node.left, scope);
      const right = evaluateNode(node.right, scope);
      if (node.op === "+") return left + right;
      if (node.op === "-") return left - right;
      if (node.op === "*") return left * right;
      if (right === 0) throw new Error("Division by zero");
      return left / right;
    }
  }
}

function collectRefs(node: CalcNode, refs: Set<string>): void {
  if (node.kind === "ref") refs.add(node.name);
  else if (node.kind === "neg") collectRefs(node.operand, refs);
  else if (node.kind === "bin") {
    collectRefs(node.left, refs);
    collectRefs(node.right, refs);
  }
}

export const demoEngine: CalcEngine = {
  parse(formula: string): CalcParseResult {
    try {
      return { ok: true, node: parseTokens(tokenize(formula)) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  evaluate(node: unknown, scope: Record<string, unknown>): unknown {
    return evaluateNode(node as CalcNode, scope);
  },
  extractDependencies(node: unknown): string[] {
    const refs = new Set<string>();
    collectRefs(node as CalcNode, refs);
    return [...refs];
  },
};
