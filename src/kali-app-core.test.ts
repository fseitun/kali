import { describe, it, expect } from "vitest";
import { KaliAppCore } from "./kali-app-core";

describe("Product scenario: Kali App Core Architecture Pure Coordination", () => {
  describe("Product scenario: State Mutation Boundaries", () => {
    it("Expected outcome: State Manager set is never called directly from app layer for game state", () => {
      const code = KaliAppCore.toString();

      const hasGameStateSetCall =
        code.match(/stateManager\.set\(['"`]game\./g) ??
        code.match(/stateManager\.set\(['"`]players\./g);

      // Exception: stateDisplay is a UI metadata field, not game state
      const hasStateDisplaySet =
        code.includes("stateManager.set('stateDisplay'") ||
        code.includes('stateManager.set("stateDisplay"');

      expect(hasGameStateSetCall).toBeNull();
      expect(hasStateDisplaySet).toBe(true);
    });

    it("Expected outcome: Always delegates player setup to orchestrator.setup Players", () => {
      const code = KaliAppCore.toString();

      const hasOrchestratorSetupPlayers = code.includes("orchestrator.setupPlayers(");
      const hasDirectStateManagerSetForPlayers =
        code.match(/stateManager\.set\(['"`]players\./g) !== null;

      expect(hasOrchestratorSetupPlayers).toBe(true);
      expect(hasDirectStateManagerSetForPlayers).toBe(false);
    });

    it("Expected outcome: Always delegates phase transitions to orchestrator transition Phase", () => {
      const code = KaliAppCore.toString();

      const hasOrchestratorTransitionPhase = code.includes("orchestrator.transitionPhase(");
      const hasDirectPhaseSet = code.match(/stateManager\.set\(['"`]game\.phase/g) !== null;

      expect(hasOrchestratorTransitionPhase).toBe(true);
      expect(hasDirectPhaseSet).toBe(false);
    });

    it("Expected outcome: Always delegates turn advancement to orchestrator advance Turn", () => {
      const code = KaliAppCore.toString();

      const hasOrchestratorAdvanceTurn = code.includes("orchestrator.advanceTurn(");
      const hasDirectTurnSet = code.match(/stateManager\.set\(['"`]game\.turn/g) !== null;

      expect(hasOrchestratorAdvanceTurn).toBe(true);
      expect(hasDirectTurnSet).toBe(false);
    });
  });

  describe("Product scenario: Coordination Flow", () => {
    it("Expected outcome: Coordinates initialization orchestrator to wakeword to name collection", () => {
      const code = KaliAppCore.toString();

      const hasInitializeOrchestrator = code.includes("initializeOrchestrator");
      const hasInitializeWakeWord = code.includes("initializeWakeWord");
      const hasRunNameCollection = code.includes("runNameCollection");

      expect(hasInitializeOrchestrator).toBe(true);
      expect(hasInitializeWakeWord).toBe(true);
      expect(hasRunNameCollection).toBe(true);
    });

    it("Expected outcome: Coordinates turn flow handle Transcript to orchestrator to check And Advance Turn", () => {
      const code = KaliAppCore.toString();

      const hasHandleTranscript = code.includes("handleTranscript");
      const hasCheckAndAdvanceTurn = code.includes("checkAndAdvanceTurn");
      const callsOrchestratorHandleTranscript = code.includes("orchestrator.handleTranscript(");

      expect(hasHandleTranscript).toBe(true);
      expect(hasCheckAndAdvanceTurn).toBe(true);
      expect(callsOrchestratorHandleTranscript).toBe(true);
    });

    it("Expected outcome: Resets speech meter per gameplay turn and applies silent success voice policy", () => {
      const code = KaliAppCore.toString();

      expect(code).toContain("beginGameplayTurn");
      expect(code).toContain("maybeApplySilentGameplayVoice");
      expect(code).toContain("applySilentSuccessFallback");
    });

    it("Expected outcome: Only announces turn changes, does not compute them", () => {
      const code = KaliAppCore.toString();

      const hasAdvanceTurnCall = code.includes("orchestrator.advanceTurn()");
      const doesNotCalculateNextPlayer =
        !code.match(/playerOrder\[.*\+.*1.*\]/g) && !code.match(/nextPlayer\s*=\s*playerOrder/g);

      expect(hasAdvanceTurnCall).toBe(true);
      expect(doesNotCalculateNextPlayer).toBe(true);
    });
  });

  describe("Product scenario: No Game Logic", () => {
    it("Expected outcome: Does not implement game mechanics", () => {
      const code = KaliAppCore.toString();

      const hasNoPositionCalculation = !code.match(/position\s*[+\-*/]=\s*\d+/g);
      const hasNoBoardMoveLogic = !code.match(/board\.moves\[/g);
      const hasNoSquareEffectLogic = !code.match(/board\.squares\[/g);

      expect(hasNoPositionCalculation).toBe(true);
      expect(hasNoBoardMoveLogic).toBe(true);
      expect(hasNoSquareEffectLogic).toBe(true);
    });

    it("Expected outcome: Does not calculate positions or effects", () => {
      const code = KaliAppCore.toString();

      const hasNoDiceRollLogic = !code.match(/Math\.random\(\)\s*\*\s*\d+/g);
      const hasNoWinConditionLogic = !code.match(/position\s*>=\s*winPosition/g);

      expect(hasNoDiceRollLogic).toBe(true);
      expect(hasNoWinConditionLogic).toBe(true);
    });

    it("Expected outcome: Does not determine turn order or advancement logic", () => {
      const code = KaliAppCore.toString();

      const hasNoTurnCalculation =
        !code.match(/currentIndex\s*=\s*playerOrder\.indexOf/g) &&
        !code.match(/nextIndex\s*=\s*\(.*\+\s*1\)\s*%/g);

      expect(hasNoTurnCalculation).toBe(true);
    });

    it("Expected outcome: Does not manage phase transitions logic", () => {
      const code = KaliAppCore.toString();

      const hasNoPhaseConditions =
        !code.match(/if\s*\(.*phase\s*===\s*['"`]SETUP['"`]\)\s*{\s*phase\s*=/g) &&
        !code.match(/phase\s*=\s*GamePhase\./g) &&
        code.includes("orchestrator.transitionPhase(");

      expect(hasNoPhaseConditions).toBe(true);
    });
  });

  describe("Product scenario: Integration Name Collection Flow", () => {
    it("Expected outcome: Name collection returns data, orchestrator applies it", () => {
      const code = KaliAppCore.toString();

      const pattern = /(?:const\s+)?playerNames\s*=\s*await\s+nameCollector\.collectNames/;
      const hasNameCollectionReturn = pattern.test(code);

      const hasOrchestratorSetup =
        code.includes("orchestrator.setupPlayers(playerNames)") ||
        code.includes("orchestrator.setupPlayers(names)");

      expect(hasNameCollectionReturn).toBe(true);
      expect(hasOrchestratorSetup).toBe(true);
    });

    it("Expected outcome: Transitions to PLAYING phase via orchestrator after name collection", () => {
      const code = KaliAppCore.toString();

      const hasCollectNames = code.includes("collectNames");
      const hasTransitionPhase = code.includes("transitionPhase");
      const hasPLAYINGPhase = code.includes("PLAYING");

      // All should exist in the code
      expect(hasCollectNames).toBe(true);
      expect(hasTransitionPhase).toBe(true);
      expect(hasPLAYINGPhase).toBe(true);
    });
  });

  describe("Product scenario: Architectural Patterns", () => {
    it('Expected outcome: Follows "Collect to Return to game orchestrator Applies" pattern', () => {
      const code = KaliAppCore.toString();

      const followsPattern =
        code.includes("collectNames") &&
        code.includes("setupPlayers") &&
        !code.includes("nameCollector.setupPlayers");

      expect(followsPattern).toBe(true);
    });

    it("Expected outcome: Delegates all state mutations to orchestrator", () => {
      const code = KaliAppCore.toString();

      const allDelegated =
        !code.match(/stateManager\.set\(['"`]game\.turn/g) &&
        !code.match(/stateManager\.set\(['"`]game\.phase/g) &&
        !code.match(/stateManager\.set\(['"`]game\.winner/g) &&
        !code.match(/stateManager\.set\(['"`]players\./g);

      expect(allDelegated).toBe(true);
    });

    it("Expected outcome: App layer is pure coordination (no business logic)", () => {
      const code = KaliAppCore.toString();

      const isPureCoordination =
        !code.match(/if\s*\(position\s*>=\s*winPosition\)/g) &&
        !code.match(/if\s*\(board\.moves\[/g) &&
        !code.match(/if\s*\(hasPendingDecisions\(\)\)/g);

      expect(isPureCoordination).toBe(true);
    });
  });
});
