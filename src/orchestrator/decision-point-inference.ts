import { getForkKeywordsWithImplicitTargets, getNextTargets, isNextFork } from "./board-next";
import type { BoardConfig, DecisionPoint } from "./types";

/**
 * Infers decision points from the board graph.
 * Any square with more than one forward target is a fork; we build position, positionOptions,
 * optional choiceKeywords from object `next`, and a default prompt.
 */
export function inferDecisionPoints(board: BoardConfig | undefined): DecisionPoint[] {
  const squares = board?.squares;
  if (!squares) return [];

  const result: DecisionPoint[] = [];
  for (const [key, sq] of Object.entries(squares)) {
    if (!isNextFork(sq)) continue;

    const position = parseInt(key, 10);
    if (Number.isNaN(position)) continue;

    const sortedNext = [...getNextTargets(sq)].sort((a, b) => a - b);
    const positionOptions: Record<string, number> = {};
    for (const n of sortedNext) positionOptions[String(n)] = n;

    const choiceKeywords = getForkKeywordsWithImplicitTargets(sq);

    const prompt =
      position === 0
        ? "¿Querés ir por la izquierda o por la derecha?"
        : `¿Querés ir al ${sortedNext.join(" o al ")}?`;

    const dp: DecisionPoint = { position, prompt, positionOptions };
    if (choiceKeywords) dp.choiceKeywords = choiceKeywords;
    result.push(dp);
  }

  result.sort((a, b) => a.position - b.position);
  return result;
}
