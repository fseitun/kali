import type { PrimitiveAction } from "@/orchestrator/types";

/**
 * Typed example: user utterance and expected primitive actions.
 * Compile-time checked against PrimitiveAction.
 */
export interface GameExample {
  user: string;
  actions: PrimitiveAction[];
}

/** Kalimba LLM prompt examples. First 6 are sent to the LLM (includes animal riddle flow). */
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
  {
    user: "(landed on animal square)",
    actions: [
      {
        action: "ASK_RIDDLE",
        text: "¿Dónde vive el pingüino?",
        options: ["Desierto", "Océano", "Ártico", "Bosque"],
        correctOption: "Ártico",
      },
      {
        action: "NARRATE",
        text: "Sofi, te encontraste con un pingüino en la costa. Para seguir tu viaje, primero tenés una adivinanza. Si la acertás, ganás un dado extra para intentar superar al pingüino.\n\nEscuchá con atención:\n\n¿Dónde vive el pingüino?\n\nOpciones:\nA) Desierto\nB) Océano\nC) Ártico\nD) Bosque\n\nDecime cuál opción creés que es la correcta.",
      },
    ],
  },
];
