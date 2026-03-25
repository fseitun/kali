import type { SquareData } from "./types";

/** `next` may be a linear edge list or a fork map (target index → phrases for that branch). */
export type NextField = SquareData["next"];

/**
 * True when `next` is the object (fork) form, not a number array.
 * @param next - Square's `next` field
 * @returns Whether next is a non-array object
 */
export function isNextRecord(next: NextField | undefined): next is Record<string, string[]> {
  return next !== undefined && next !== null && typeof next === "object" && !Array.isArray(next);
}

type SquareWithEdges = { next?: NextField; prev?: number[] } | undefined;

/**
 * Returns sorted unique target indices from a square's `next` or `prev` field.
 * @param sq - Square-like object with optional `next` and `prev`
 * @param current - Current position (used for linear default when edges are missing)
 * @param forward - If true, use `next`; if false, use `prev`
 * @returns Sorted list of reachable targets in the given direction
 */
function getForwardTargetsFromNext(
  next: NextField | undefined | null,
  current: number,
  winPosition: number,
): number[] {
  if (next === undefined || next === null) {
    return current < winPosition ? [current + 1] : [];
  }
  if (Array.isArray(next)) {
    return [...next];
  }
  const keys = Object.keys(next as Record<string, unknown>);
  const nums = keys.map((k) => parseInt(k, 10)).filter((n) => !Number.isNaN(n));
  return [...new Set(nums)].sort((a, b) => a - b);
}

function getBackwardTargetsFromPrev(prev: number[] | undefined | null, current: number): number[] {
  if (prev === undefined || prev === null) {
    return current > 0 ? [current - 1] : [];
  }
  if (Array.isArray(prev) && prev.length === 0) {
    return [];
  }
  return Array.isArray(prev) ? [...prev] : [];
}

/**
 * @param winPosition - Index of the win square (from `effect: "win"`); used when `next` is omitted.
 */
export function getTargets(
  sq: SquareWithEdges,
  current: number,
  forward: boolean,
  winPosition: number,
): number[] {
  return forward
    ? getForwardTargetsFromNext(sq?.next, current, winPosition)
    : getBackwardTargetsFromPrev(sq?.prev, current);
}

/**
 * Returns sorted unique target indices from a square's `next` field.
 * Arrays are returned as-is (copy); object form uses numeric keys only.
 * @param sq - Square-like object with optional `next`
 * @returns Sorted list of reachable forward targets
 */
export function getNextTargets(sq: { next?: NextField } | undefined): number[] {
  const next = sq?.next;
  if (next === undefined || next === null) {
    return [];
  }
  if (Array.isArray(next)) {
    return [...next];
  }
  const keys = Object.keys(next as Record<string, unknown>);
  const nums = keys.map((k) => parseInt(k, 10)).filter((n) => !Number.isNaN(n));
  return [...new Set(nums)].sort((a, b) => a - b);
}

/**
 * Returns target indices from a square's `prev` field (backward direction).
 * @param sq - Square-like object with optional `prev`
 * @param current - Current position (fallback when prev is missing)
 * @returns List of reachable backward targets
 */
export function getPrevTargets(sq: { prev?: number[] } | undefined, current: number): number[] {
  const prev = sq?.prev;
  if (prev === undefined || prev === null) {
    return current > 0 ? [current - 1] : [];
  }
  if (Array.isArray(prev) && prev.length === 0) {
    return [];
  }
  return [...prev];
}

/** True when the resolved edge list has more than one branch (fork). */
export function isMultiBranchTargets(targets: number[]): boolean {
  return targets.length > 1;
}

/**
 * True when moving backward from `current` on this square has more than one `prev` target.
 */
export function isPrevFork(sq: { prev?: number[] } | undefined, current: number): boolean {
  return isMultiBranchTargets(getPrevTargets(sq, current));
}

/**
 * True when the square has more than one forward target (fork).
 * @param sq - Square-like object with optional `next`
 */
export function isNextFork(sq: { next?: NextField } | undefined): boolean {
  return isMultiBranchTargets(getNextTargets(sq));
}

/**
 * For fork `next` objects, returns phrase lists per target key, with the numeric target string
 * appended to each list so PLAYER_ANSWERED with "15" matches without duplicating in JSON.
 * @param sq - Square with object `next`
 * @returns Map of target string → phrases including implicit target number, or undefined if not object next
 */
export function getForkKeywordsWithImplicitTargets(
  sq: { next?: NextField } | undefined,
): Record<string, string[]> | undefined {
  const next = sq?.next;
  if (!isNextRecord(next)) {
    return undefined;
  }
  const obj = next;
  const result: Record<string, string[]> = {};
  for (const [key, phrases] of Object.entries(obj)) {
    const n = parseInt(key, 10);
    if (Number.isNaN(n)) {
      continue;
    }
    const keyStr = String(n);
    const list = Array.isArray(phrases) ? [...phrases] : [];
    if (!list.includes(keyStr)) {
      list.push(keyStr);
    }
    result[keyStr] = list;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Resolves a user/LLM answer to a fork target using choice keyword lists.
 * Matches: exact phrase (case-insensitive), or extracted number matching a target key,
 * or substring when phrase length ≥ 3 (e.g. "derecha" in "por la derecha").
 * @param answer - Raw answer string
 * @param choiceKeywords - Per-target phrase lists (from decision point)
 * @returns Target position if matched, else null
 */
export function matchAnswerToChoiceKeywords(
  answer: string,
  choiceKeywords: Record<string, string[]>,
): number | null {
  const trimmed = answer.trim();
  const lower = trimmed.toLowerCase();
  const numMatch = trimmed.match(/\d+/);

  for (const [targetStr, phrases] of Object.entries(choiceKeywords)) {
    const targetNum = parseInt(targetStr, 10);
    if (Number.isNaN(targetNum)) {
      continue;
    }
    if (numMatch?.[0] === targetStr) {
      return targetNum;
    }

    for (const phrase of phrases) {
      const p = phrase.trim().toLowerCase();
      if (!p) {
        continue;
      }
      if (lower === p) {
        return targetNum;
      }
      if (p.length >= 3 && lower.includes(p)) {
        return targetNum;
      }
    }
  }
  return null;
}
