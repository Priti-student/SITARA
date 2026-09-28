// ───────────────────────────────────────────────────────────────
// Condition evaluator — pure functions, no I/O.
// Semantics:
//   { "anyOf": [c1, c2] }        → OR of nested condition objects
//   { "allOf": [c1, c2] }        → AND of nested condition objects
//   { "field_gte": 10 }          → numeric >= (also _gt, _lte, _lt)
//   { "field": true }            → strict boolean equality
//   { "field": [a, b] }          → context value is in list (or lists intersect)
//   { "field": 5 }               → numeric equality
//   { "field": "x" }             → string equality
//   { "in": ["a","b"] }          → context["in"]?? reserved; use field_in instead
// ───────────────────────────────────────────────────────────────
import type { Condition, EvaluationContext } from "./types.js";

const NUMERIC_OPS: Record<string, (a: number, b: number) => boolean> = {
  _gte: (a, b) => a >= b,
  _gt: (a, b) => a > b,
  _lte: (a, b) => a <= b,
  _lt: (a, b) => a < b,
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function arraysIntersect(a: unknown[], b: unknown[]): boolean {
  return a.some((x) => b.includes(x));
}

function toCamel(snake: string): string {
  return snake.replace(/_([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
}

function toSnake(camel: string): string {
  return camel.replace(/[A-Z]/g, (c: string) => `_${c.toLowerCase()}`);
}

/** Context lookup tolerant of snake_case / camelCase key conventions. */
function lookup(ctx: EvaluationContext, key: string): unknown {
  if (key in ctx) return ctx[key];
  const camel = toCamel(key);
  if (camel in ctx) return ctx[camel];
  const snake = toSnake(key);
  if (snake in ctx) return ctx[snake];
  return ctx[key];
}

/** Evaluates a single `key: value` condition entry against the context. */
export function evaluateCondition(
  key: string,
  expected: unknown,
  ctx: EvaluationContext
): boolean {
  // Nested combinators
  if (key === "anyOf" && Array.isArray(expected)) {
    return expected.some((c) => typeof c === "object" && c !== null && evaluateConditions(c as Condition, ctx));
  }
  if (key === "allOf" && Array.isArray(expected)) {
    return expected.every((c) => typeof c === "object" && c !== null && evaluateConditions(c as Condition, ctx));
  }

  // Numeric comparison operators via key suffix
  for (const [suffix, op] of Object.entries(NUMERIC_OPS)) {
    if (key.endsWith(suffix)) {
      const base = key.slice(0, -suffix.length);
      const actual = toNumber(lookup(ctx, base));
      const wanted = toNumber(expected);
      if (actual === null || wanted === null) return false;
      return op(actual, wanted);
    }
  }

  const actual = lookup(ctx, key);

  // Boolean flag
  if (typeof expected === "boolean") {
    return actual === expected;
  }

  // List membership
  if (Array.isArray(expected)) {
    if (Array.isArray(actual)) return arraysIntersect(actual, expected);
    return expected.includes(actual);
  }

  // Numeric equality
  if (typeof expected === "number") {
    const a = toNumber(actual);
    return a !== null && a === expected;
  }

  // String / other equality
  return actual === expected;
}

/** ANDs every entry in a condition object. An empty object matches everything. */
export function evaluateConditions(
  conditions: Condition,
  ctx: EvaluationContext
): boolean {
  return Object.entries(conditions).every(([key, value]) =>
    evaluateCondition(key, value, ctx)
  );
}