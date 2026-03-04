### The Macro Flow Mapping

#### 1. Setup & Initialization (Phase: `SETUP`)

_The system collects data before the deterministic engine takes over._

- **Kali (NameCollector):** "Welcome to the game. Who is playing today?"
- **Fico (p1):** "It'll be Fico, Ceci, Cami, and Feli."
- **Under the Hood:**
- LLM extracts the array of names.
- **Orchestrator Authority:** Executes `setupPlayers()`.
- **State Change:** `game.playerOrder` = `['p1', 'p2', 'p3', 'p4']`. `game.phase` transitions from `SETUP` to `PLAYING`. `game.turn` set to `p1`.

#### 2. The Clean Turn (Happy Path)

_The most basic loop: Prompt -> Action -> Math -> Next Turn._

- **Kali (TurnManager):** "Fico, it's your turn. Tell me what you rolled."
- **Fico (p1):** "I got a 4."
- **Under the Hood:**
- LLM Interpreter: Emits `[{ "action": "PLAYER_ROLLED", "value": 4 }]`
- **Orchestrator Authority:** Receives primitive, validates it is `p1`'s turn. Calculates `p1.position = current + 4`.
- **State Change:** TurnManager automatically advances `game.turn` to `p2`.

#### 3. The Ambiguous Turn (LLM Clarification)

_The user gives messy input. The LLM handles the mess without touching the game state._

- **Kali (TurnManager):** "Ceci, your turn."
- **Ceci (p2):** "I moved my piece to the red square."
- **Under the Hood:**
- LLM Interpreter recognizes it lacks the numerical value needed for the primitive.
- LLM Interpreter: Emits `[{ "action": "NARRATE", "text": "Wait, what number did you actually roll on the dice to get there?" }]`
- **Orchestrator Authority:** Executes the narration.
- **State Change:** None. TurnManager does **not** advance the turn because a valid action was never emitted.

#### 4. The Board Effect (Synthetic Transcript Injection)

_The deterministic engine forces the LLM to process a game rule._

- **Kali (TurnManager):** "Cami, your turn!"
- **Cami (p3):** "A six!"
- **Under the Hood:**
- LLM Interpreter: Emits `[{ "action": "PLAYER_ROLLED", "value": 6 }]`
- **Orchestrator Authority:** Moves Cami 6 spaces. Checks the `board.squares` config and sees a "Mystery Box" at this new position.
- **Orchestrator Authority:** Injects _Synthetic Transcript_ into LLM context: `[SYSTEM: Player landed on square 6: Mystery Box. Ask them if they want to open it or leave it.]`
- LLM Interpreter reads the system prompt and emits: `[{ "action": "NARRATE", "text": "Cami, you landed on a Mystery Box! Do you want to open it or leave it?" }]`
- **State Change:** `DecisionPointEnforcer` flags `p3` as having a pending decision. Turn is blocked from advancing.

#### 5. The Decision Point Resolution

_Resolving the block created in Step 4._

- **Cami (p3):** "Open it!"
- **Under the Hood:**
- LLM Interpreter: Emits `[{ "action": "PLAYER_ANSWERED", "answer": "open" }]`
- **Orchestrator Authority:** Reads `lastAnswer`, applies the resulting config logic (e.g., grants points or moves position). Clears the decision flag.
- **State Change:** TurnManager is unblocked and advances turn to `p4`.

#### 6. The Illegal Action (Validator Block)

_A player tries to do something against the rules._

- **Kali (TurnManager):** "Feli, your turn!"
- **Feli (p4):** "I want to move Cami back 2 spaces."
- **Under the Hood:**
- LLM Interpreter: Depending on prompt rules, it might emit `[{ "action": "SET_STATE", "path": "players.p3.position", "value": -2 }]` OR it might reject it natively.
- **Orchestrator Authority (Validator):** If the LLM emitted the action, `validator.ts` catches that `p4` is trying to alter `p3`'s state without a valid item/rule allowing it.
- **Validator Action:** Rejects the primitive array. Returns a hidden prompt error to the LLM.
- LLM Interpreter (Retry): Emits `[{ "action": "NARRATE", "text": "Nice try Feli, but you can only move your own piece!" }]`

#### 7. The Win Condition (Phase Transition)

_The engine detects game over._

- **Fico (p1):** "I rolled a 5."
- **Under the Hood:**
- LLM Interpreter: Emits `[{ "action": "PLAYER_ROLLED", "value": 5 }]`
- **Orchestrator Authority:** Calculates new position. Detects `position >= WIN_TARGET`.
- **State Change:** Orchestrator transitions `game.phase` from `PLAYING` to `FINISHED`. `game.winner` = `p1`. Triggers celebration narration.

---

### Audit: What Macro Steps are Missing?

By laying out this flow, three critical architectural gaps emerge that your current Primitive Box and Orchestrator do not cleanly handle yet:

**1. The "Undo / Correction" Macro**

- **Scenario:** Kali mishears. Fico says "I rolled a 2," but Vosk hears "I rolled a 12." Kali moves Fico 12 spaces. Fico says, "No, I said 2!"
- **The Gap:** The LLM interprets the correction, but how does it tell the Orchestrator to fix it? `SET_STATE` is too dangerous to let the LLM recalculate the math backwards.
- **Next Step:** You need an `UNDO_LAST_ACTION` primitive, or a dedicated `CORRECT_STATE` primitive that safely reverts the previous turn's delta.

**2. The "Out-of-Turn Interrupt" Macro**

- **Scenario:** It is Ceci's turn, but Feli has a "Trap Card" she wants to play right now.
- **The Gap:** Your `TurnManager` and `Validator` strictly enforce that only the active player can mutate state. If Feli speaks during Ceci's turn, the validator blocks it.
- **Next Step:** As you scale to more complex games, you will need a mechanism for "Interrupts" or asynchronous actions that bypass standard turn validation if the game config permits it.

**3. The "State Query" Macro**

- **Scenario:** Cami asks, "Kali, who is winning?" or "How many spaces am I from the finish line?"
- **Solution:** `handleTranscript` and `executePrimitiveActions` now return `{ success, shouldAdvanceTurn }`. The app layer only calls `checkAndAdvanceTurn()` when `shouldAdvanceTurn` is true. NARRATE-only action sequences set `shouldAdvanceTurn: false`, so answering a question no longer advances the turn.
