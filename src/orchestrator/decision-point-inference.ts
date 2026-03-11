import type { BoardConfig, DecisionPoint } from "./types";

/**
 * Infers decision points from the board graph.
 * Any square with next.length > 1 is a fork; we build position, positionOptions, and a default prompt.
 */
export function inferDecisionPoints(board: BoardConfig | undefined): DecisionPoint[] {
  const squares = board?.squares as Record<string, { next?: number[] }> | undefined;
  if (!squares) return [];

  const result: DecisionPoint[] = [];
  for (const [key, sq] of Object.entries(squares)) {
    const next = sq?.next;
    if (!next || next.length <= 1) continue;

    const position = parseInt(key, 10);
    if (Number.isNaN(position)) continue;

    const positionOptions: Record<string, number> = {};
    for (const n of next) positionOptions[String(n)] = n;

    const prompt =
      position === 0 ? "¿Querés ir por el A o por el B?" : `¿Querés ir al ${next.join(" o al ")}?`;

    result.push({ position, prompt, positionOptions });
  }

  result.sort((a, b) => a.position - b.position);
  return result;
}
