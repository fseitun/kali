import {
  getForkKeywordsWithImplicitTargets,
  getNextTargets,
  getPrevForkKeywordsWithImplicitTargets,
  getPrevTargets,
  isNextFork,
  isPrevFork,
} from "./board-next";
import type { BoardConfig, DecisionPoint, GameState, SquareData } from "./types";

function buildSortedPositionOptions(targets: number[]): {
  sorted: number[];
  positionOptions: Record<string, number>;
} {
  const sorted = [...targets].sort((a, b) => a - b);
  const positionOptions: Record<string, number> = {};
  for (const n of sorted) {
    positionOptions[String(n)] = n;
  }
  return { sorted, positionOptions };
}

function forEachBoardSquare(
  board: BoardConfig | undefined,
  visitor: (position: number, sq: SquareData) => void,
): void {
  const squares = board?.squares;
  if (!squares) {
    return;
  }
  for (const [key, sq] of Object.entries(squares)) {
    const position = parseInt(key, 10);
    if (Number.isNaN(position)) {
      continue;
    }
    visitor(position, sq);
  }
}

/**
 * Returns decision points for the given state, derived from board.squares at runtime.
 * Squares are the single source of truth; decisionPoints are not persisted on state.
 * Includes forward (`next`) forks and backward (`prev`) forks; backward entries set `direction: "backward"`.
 *
 * @param state - Game state containing board
 * @returns Decision points inferred from board graph
 */
export function getDecisionPoints(state: GameState): DecisionPoint[] {
  const board = state.board;
  const forward = inferDecisionPoints(board);
  const backward = inferBackwardDecisionPoints(board);
  return [...forward, ...backward].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    const da = a.direction ?? "forward";
    const db = b.direction ?? "forward";
    if (da === db) {
      return 0;
    }
    return da === "forward" ? -1 : 1;
  });
}

/**
 * Infers decision points from the board graph.
 * Any square with more than one forward target is a fork; we build position, positionOptions,
 * optional choiceKeywords from object `next`, and a default prompt.
 */
export function inferDecisionPoints(board: BoardConfig | undefined): DecisionPoint[] {
  const result: DecisionPoint[] = [];
  forEachBoardSquare(board, (position, sq) => {
    if (!isNextFork(sq)) {
      return;
    }
    const { sorted, positionOptions } = buildSortedPositionOptions(getNextTargets(sq));
    const choiceKeywords = getForkKeywordsWithImplicitTargets(sq);
    const prompt =
      position === 0
        ? "¿Querés ir por la izquierda o por la derecha?"
        : `¿Querés ir al ${sorted.join(" o al ")}?`;

    const dp: DecisionPoint = { position, prompt, positionOptions };
    if (choiceKeywords) {
      dp.choiceKeywords = choiceKeywords;
    }
    result.push(dp);
  });

  result.sort((a, b) => a.position - b.position);
  return result;
}

/**
 * Squares with more than one backward (`prev`) target become decision points for directional / backward movement.
 */
export function inferBackwardDecisionPoints(board: BoardConfig | undefined): DecisionPoint[] {
  const result: DecisionPoint[] = [];
  forEachBoardSquare(board, (position, sq) => {
    if (!isPrevFork(sq, position)) {
      return;
    }
    const { sorted, positionOptions } = buildSortedPositionOptions(getPrevTargets(sq, position));
    const choiceKeywords = getPrevForkKeywordsWithImplicitTargets(sq);
    const prompt = `¿Hacia atrás, al ${sorted.join(" o al ")}?`;
    const dp: DecisionPoint = {
      position,
      prompt,
      positionOptions,
      direction: "backward",
    };
    if (choiceKeywords) {
      dp.choiceKeywords = choiceKeywords;
    }
    result.push(dp);
  });

  result.sort((a, b) => a.position - b.position);
  return result;
}
