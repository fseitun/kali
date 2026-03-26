/**
 * LLM-facing state-context strings (⚠️ blocks). Spanish (Argentina) is primary; English for en-US parity.
 * Primitive action names stay English; natural-language instructions follow locale.
 */
export type LlmStateContextBundle = {
  decisionBlock: string;
  decisionHintWithKeywords: string;
  decisionHintKeywordLine: string;
  decisionHintDefault: string;
  riddleAfterEncounter: string;
  riddleHabitatNote: string;
  riddleNarrationShape: string;
  riddleAntiLeak: string;
  riddleHelpRepeatStructured: string;
  riddleHelpRegenerate: string;
  riddlePhaseNoStructured: string;
  riddlePhaseStructuredPrefix: string;
  riddleCurrentOptions: string;
  powerCheckBlock: string;
  powerRollOneDie: string;
  powerRollSum: string;
  powerCheckHelpOneDie: string;
  powerCheckHelpManyDice: string;
  revengeBlock: string;
  directionalBlock: string;
  directionalMoveHintBackward: string;
  directionalMoveHintForwardRetreat: string;
  directionalRollOne: string;
  directionalRollSum: string;
  directionalHelpOneDie: string;
  directionalHelpManyDice: string;
  /** After a dice move paused on a fork mid-path (pending completeRollMovement). */
  completeRollMovementBlock: string;
};

export const llmStateContextEsAR: LlmStateContextBundle = {
  decisionBlock:
    '⚠️ DECISION ({playerName}) bifurcación en casillero {position}. Preguntá: "{playerName}, {prompt}" Nombrá siempre al jugador al preguntar. Si pregunta qué hacer o pide ayuda → NARRATE las opciones de camino (como en el prompt); NO emitas PLAYER_ANSWERED.{hint} Si elige un camino, emití PLAYER_ANSWERED con el número de casilla destino correcto. [current]',
  decisionHintWithKeywords:
    " Pistas de la config (no exhaustivas): {branchLines}. Cuando elija un camino con claridad, devolvé PLAYER_ANSWERED solo con el número de casilla destino (uno de: {targets}); no repitas textualmente lo que dijo si podés resolverlo. Si no queda claro, NARRATE para volver a preguntar.",
  decisionHintKeywordLine: "objetivo {target}: {phraseList}",
  decisionHintDefault:
    " Cuando la intención es clara, devolvé PLAYER_ANSWERED con el número de casilla destino; si no, NARRATE para volver a preguntar.",
  riddleAfterEncounter:
    " Después de la adivinanza: si acerta, tira {correctDice}d6 (suma frente a fuerza del animal {power}); si falla, {wrongDice}d6. En NARRATE (español argentino, voseo), decilo simple para chicos — por ejemplo un dado extra o más dados para intentar superar al animal — no digas «prueba de poder» ni «power check».",
  riddleHabitatNote:
    " Abrí la escena en este hábitat (dato de casilla: {hab}) — usá un nombre natural en español, no la clave en inglés; no empieces con el número de casillero salvo que haga falta.",
  riddleNarrationShape:
    " Forma del NARRATE: nombre del jugador + animal en el hábitat; adivinanza + si acertás un dado extra (o más dados) para superar al animal; después «Escuchá con atención:»; la pregunta; después «Opciones:» con A) B) C) D) una por línea en el orden de options; cerrá preguntando cuál opción cree que es correcta (p. ej. «¿cuál opción creés que es la correcta?»).",
  riddleAntiLeak:
    " Al plantear la adivinanza: solo la pregunta y las cuatro opciones. NO incluyas la respuesta correcta en ese NARRATE.",
  riddleHelpRepeatStructured:
    " Si pregunta qué hacer, NARRATE repitiendo la misma adivinanza y las cuatro opciones.",
  riddleHelpRegenerate:
    " Si pregunta qué hacer o dice que no escuchó, DEBÉS devolver ASK_RIDDLE (text, options, correctOption, opcional correctOptionSynonyms) seguido de NARRATE con esa misma adivinanza y opciones. NO devuelvas solo un NARRATE que diga «elegí una opción» sin decir la adivinanza.",
  riddlePhaseNoStructured:
    '⚠️ RIDDLE ({playerName}) phase=riddle.{antiLeak}{encounterHints}{narrationShape} Pedí una adivinanza con exactamente CUATRO opciones. Tiene que ser del reino animal (animales, hábitats, comportamiento, alimentación, clasificación). Devolvé ASK_RIDDLE con "text", "options" (4 strings), "correctOption" (texto exacto de la opción correcta), opcional "correctOptionSynonyms". Después NARRATE con la adivinanza y opciones. Cuando responda el usuario, PLAYER_ANSWERED con lo que dijo; el orquestador resuelve acierto/error.{helpInst} [current]',
  riddlePhaseStructuredPrefix:
    "⚠️ RIDDLE ({playerName}) phase=riddle. El usuario debe elegir una de las cuatro opciones. PLAYER_ANSWERED con lo que dijo; el orquestador resuelve acierto/error (match estricto y después LLM).",
  riddleCurrentOptions:
    " Opciones actuales: {optionsList}. PLAYER_ANSWERED con la respuesta del usuario (texto de opción o lo que dijo).",
  powerCheckBlock:
    "⚠️ POWER CHECK ({playerName}) phase=powerCheck. Si REPORTA su tirada → {rollInstruction} NO preguntes «decime el resultado», «¿alcanza?», «¿sirve?» ni frases en inglés del estilo «is that enough?» — ya dio el número; procesalo al toque. NO NARRATES la tirada. Devolvé solo PLAYER_ANSWERED. El orquestador anuncia si pasó o no.{helpLine} [current]",
  powerCheckHelpOneDie: " Si pregunta qué hacer → NARRATE «Tirá un dado... decime el resultado.»",
  powerCheckHelpManyDice:
    " Si pregunta qué hacer → NARRATE «Tirá {n} dados... decime el resultado.»",
  powerRollOneDie:
    "PLAYER_ANSWERED con el número del dado (1–6). Ejemplos: «cuatro», «tiré un seis», «6».",
  powerRollSum:
    "PLAYER_ANSWERED con la suma ({min}–{max} de {label}). Ejemplos: «tiré un dos y un seis», «ocho», «quince».",
  revengeBlock:
    "⚠️ REVENGE ({playerName}) phase=revenge. Sigue el mismo jugador, no el siguiente. 1 dado, tirada ≥ {power} gana. Si reporta la tirada → PLAYER_ANSWERED con el número (1–6). NO preguntes si alcanza ni «is that enough?» — procesalo ya. NO NARRATES la tirada. Solo PLAYER_ANSWERED. El orquestador anuncia el resultado. Si pregunta qué hacer → NARRATE que tire un dado y diga el número (necesita {power} o más). Si indicás la acción, nombrá al jugador: «{playerName}, tirá el dado.» [current]",
  directionalMoveHintBackward: "Hay que retroceder.",
  directionalMoveHintForwardRetreat: "Tenés que avanzar.",
  directionalBlock:
    "⚠️ DIRECTIONAL ROLL ({playerName}) {moveHint} Tirá {label} y decí el resultado. Si REPORTA su tirada → {rollInstruction} NO NARRATES la tirada. Solo PLAYER_ANSWERED.{helpLine} [current]",
  directionalHelpOneDie: " Si pregunta qué hacer → NARRATE «Tirá un dado... decime el resultado.»",
  directionalHelpManyDice:
    " Si pregunta qué hacer → NARRATE «Tirá {n} dados... decime el resultado.»",
  directionalRollOne: "PLAYER_ANSWERED con el número del dado (1–6).",
  directionalRollSum:
    "PLAYER_ANSWERED con la suma ({min}–{max} de {label}). Ejemplos: «ocho», «quince».",
  completeRollMovementBlock:
    "⚠️ MOVIMIENTO A MEDIAS ({playerName}) El tiro de dados ya está contado: falta elegir el camino para terminar de moverse. NO pidas tirar de nuevo para avanzar. Seguí la línea ⚠️ DECISION (misma bifurcación); PLAYER_ANSWERED con el número de casilla destino. [current]",
};

export const llmStateContextEnUS: LlmStateContextBundle = {
  decisionBlock:
    '⚠️ DECISION ({playerName}) fork choice at square {position}. Ask: "{playerName}, {prompt}" Always name the player when asking. If the user asks what to do or for help → NARRATE the path options (e.g. from the prompt); do NOT emit PLAYER_ANSWERED.{hint} If they state a choice, emit PLAYER_ANSWERED with the correct target square number. [current]',
  decisionHintWithKeywords:
    " Branch hints from config (not exhaustive): {branchLines}. When the user clearly chooses a path, return PLAYER_ANSWERED with only the target square number (one of: {targets}); do not pass through their exact words if you can resolve. If unclear, NARRATE to ask again.",
  decisionHintKeywordLine: "target {target}: {phraseList}",
  decisionHintDefault:
    " When intent is clear, return PLAYER_ANSWERED with the target square number; if unclear, NARRATE to ask again.",
  riddleAfterEncounter:
    ' After the riddle: if correct, player rolls {correctDice}d6 (sum vs animal strength {power}); if wrong, {wrongDice}d6. In NARRATE (US English), say it in plain kid-friendly terms — e.g. an extra die / more dice to try to beat the animal — never say "prueba de poder" or "power check".',
  riddleHabitatNote:
    " Open the scene in this habitat (square data: {hab}) — use a natural English place name, not the raw key; do not open with the square number unless necessary.",
  riddleNarrationShape:
    ' NARRATE shape: player name + animal in habitat; riddle + if you get it right an extra die (or more dice) to beat the animal; then "Listen carefully:"; then the riddle question; then "Options:" with A) B) C) D) one per line in options order; close asking which option they think is correct.',
  riddleAntiLeak:
    " When asking the riddle: ask only the riddle and the four options. Do NOT include the correct answer in that NARRATE.",
  riddleHelpRepeatStructured:
    " If the user asks what to do, NARRATE by repeating the same riddle and four options.",
  riddleHelpRegenerate:
    " If the user asks what to do or says they did not hear, you MUST return ASK_RIDDLE (text, options, correctOption, optional correctOptionSynonyms) followed by NARRATE speaking that same riddle and options. Do NOT return only a NARRATE saying to pick an option without speaking the actual riddle.",
  riddlePhaseNoStructured:
    '⚠️ RIDDLE ({playerName}) phase=riddle.{antiLeak}{encounterHints}{narrationShape} Ask a riddle with exactly FOUR options. The riddle MUST be about the animal kingdom (animals, habitats, behavior, diet, classification). Return ASK_RIDDLE with "text", "options" (array of 4 strings), "correctOption" (exact text of the correct option), optionally "correctOptionSynonyms". Then NARRATE the riddle and options. When the user answers, return PLAYER_ANSWERED with what they said; the orchestrator resolves correct/incorrect.{helpInst} [current]',
  riddlePhaseStructuredPrefix:
    "⚠️ RIDDLE ({playerName}) phase=riddle. The user must choose one of the four options. Return PLAYER_ANSWERED with what the user said; the orchestrator resolves correct/incorrect (strict match then LLM).",
  riddleCurrentOptions:
    " Current options: {optionsList}. Return PLAYER_ANSWERED with the user's answer (option text or what they said).",
  powerCheckBlock:
    '⚠️ POWER CHECK ({playerName}) phase=powerCheck. If the user REPORTS their roll → {rollInstruction} Do NOT ask "tell me the result", "does that count", "is that enough" — they gave the number; process it immediately. Do NOT NARRATE the roll. Return only PLAYER_ANSWERED. The orchestrator announces pass/fail.{helpLine} [current]',
  powerCheckHelpOneDie:
    ' If the user asks what to do → NARRATE "Roll one die and tell me what you rolled."',
  powerCheckHelpManyDice:
    ' If the user asks what to do → NARRATE "Roll {n} dice and tell me the total."',
  powerRollOneDie:
    'PLAYER_ANSWERED with the number on the die (1–6). Examples: "four", "I rolled a six", "6".',
  powerRollSum:
    'PLAYER_ANSWERED with the sum ({min}–{max} from {label}). Examples: "I rolled a two and a six", "eight", "fifteen".',
  revengeBlock:
    '⚠️ REVENGE ({playerName}) phase=revenge. Same player, not the next one. 1 die, roll ≥ {power} wins. User reports roll → PLAYER_ANSWERED with the number (1–6). Do NOT ask "does that count" or "is that enough" — process it immediately. Do NOT NARRATE the roll. Return only PLAYER_ANSWERED. The orchestrator announces pass/fail. If the user asks what to do → NARRATE that they should roll one die and report the number (need {power} or more). When prompting, name the player: "{playerName}, roll the die." [current]',
  directionalMoveHintBackward: "The player must move backward.",
  directionalMoveHintForwardRetreat: "The player must move forward.",
  directionalBlock:
    "⚠️ DIRECTIONAL ROLL ({playerName}) {moveHint} Roll {label} and report the result. If the user REPORTS their roll → {rollInstruction} Do NOT NARRATE the roll. Return only PLAYER_ANSWERED.{helpLine} [current]",
  directionalHelpOneDie:
    ' If the user asks what to do → NARRATE "Roll one die and tell me what you rolled."',
  directionalHelpManyDice:
    ' If the user asks what to do → NARRATE "Roll {n} dice and tell me the total."',
  directionalRollOne: "PLAYER_ANSWERED with the number on the die (1–6).",
  directionalRollSum:
    'PLAYER_ANSWERED with the sum ({min}–{max} from {label}). Examples: "eight", "fifteen".',
  completeRollMovementBlock:
    "⚠️ MOVE IN PROGRESS ({playerName}) The dice roll is already counted — they must pick a branch to finish moving. Do NOT ask them to roll again to move. Follow the ⚠️ DECISION line (same fork); PLAYER_ANSWERED with the target square number. [current]",
};
