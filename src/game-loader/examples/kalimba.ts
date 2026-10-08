import type { PrimitiveAction } from "@/orchestrator/types";

/**
 * Typed example: user utterance and expected primitive actions.
 * Compile-time checked against PrimitiveAction.
 */
export interface GameExample {
  user: string;
  actions: PrimitiveAction[];
}

/** Kalimba LLM prompt examples; the app sends up to 6. */
export const KALIMBA_EXAMPLES: GameExample[] = [
  {
    user: "Quiero el más corto",
    actions: [
      { action: "PLAYER_ANSWERED", answer: "1" },
      { action: "NARRATE", text: "Elegiste la izquierda. Ahora tirá el dado." },
    ],
  },
  {
    user: "El más largo",
    actions: [
      { action: "PLAYER_ANSWERED", answer: "15" },
      { action: "NARRATE", text: "Elegiste la derecha. Tirá el dado." },
    ],
  },
  {
    user: "Tiré uno",
    actions: [{ action: "PLAYER_ROLLED", value: 1 }],
  },
  {
    user: "Tiré dos tres (ambiguous)",
    actions: [{ action: "NARRATE", text: "¿Tiraste un 2 o un 3?" }],
  },
  {
    user: "Ocho (during power check)",
    actions: [{ action: "PLAYER_ANSWERED", answer: "8" }],
  },
];
