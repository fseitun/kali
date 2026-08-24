export const esAR = {
  setup: {
    welcome: "¡Bienvenidos a {game}! Arranquemos.",
    playerCount: "¿Cuántos jugadores? El máximo es {max}.",
    playerCountInvalid: "Por favor, decí un número del {min} al {max}.",
    playerName: "Jugador {number}, ¿cómo te llamás?",
    nameConfirmYes: "¡Bárbaro, {name}!",
    nameConflict: "Ya hay un {name}. ¿Qué tal si te llamamos {suggestion}?",
    nameConflictPerfect: "¡Listo!",
    nameConflictAlternative: "¿Cómo preferís que te llamara?",
    nameConflictFallback: "Bueno, seguimos con {name}.",
    allNamesReady: "¡Genial! Ya estamos: {names}. ¡Arrancamos!",
    nameListLastJoiner: " y ",
    ready: "¡Perfecto! Arranquemos. {name}, vos empezás.",
    extractionFailed: "No te escuché bien.",
  },
  game: {
    proactiveStart: "Empezamos. Te explico la situación.",
    restarted: "Listo, empezamos de nuevo. Todos vuelven a la salida.",
    turnAnnouncement:
      "{name}, te toca. Estás en el casillero {position}. Tira el dado y decime qué sacaste.",
    turnAnnouncementMagicDoor:
      "{name}, te toca. Estás en el casillero {position}, la puerta mágica. Tenés {heartsPhrase}. Tirá un dado solo para intentar abrirla: pensalo así, dado que necesitás = {target} menos tus corazones. Con lo que tenés ahora, necesitás al menos un {minDie} en el dado. Decime qué sacaste.",
    turnAnnouncementWithDecision: "{name}, te toca. Estás en el casillero {position}. {prompt}",
    turnAnnouncementRevenge:
      "{name}, te toca la revancha en el casillero {position}. Tirá un dado: con {power} o más superás el puntaje {animalScorePhrase} y avanzás. Decime qué sacaste.",
    skipTurnAnnouncement: "{name}, saltás este turno.",
    winner: "¡{name} ganó! ¡Felicitaciones!",
    powerCheckPass: "Pasaste.",
    powerCheckPassForkPrompt:
      "{name}, te quedan {remainingSteps} casilleros por mover. Estás en la bifurcación del {forkSquare}: decime si vas al {options}.",
    powerCheckPassLandedAt: "{name}, caíste en el casillero {position}.",
    afterEncounterRollPrompt:
      "{name}, seguís en el casillero {position}. Tirá el dado y decime qué sacaste.",
    powerCheckFail: "No alcanzó.",
    riddlePowerExtraDieOne: "Tenés un dado extra. ",
    riddlePowerExtraDiceMany: "Tenés {count} dados extra. ",
    riddleCorrectPowerRoll:
      "¡Correcto! {extraDicePhrase}Ahora tirá {diceCount} dados: necesitás superar el puntaje {animalScorePhrase} para avanzar.",
    riddlePowerRollOneDie: "Tirá 1 dado: ",
    riddlePowerRollManyDice: "Tirá {count} dados: ",
    riddleIncorrectPowerRoll:
      "No acertaste. {diceRollPhrase}Necesitás superar el puntaje {animalScorePhrase} para avanzar.",
    riddleHeartIfWin:
      " Si superás al animal con la tirada, ganás un corazón mágico para la puerta final.",
    forkChoiceResolvedRoll: "{name}, listo. Tirá el dado.",
    goldenFoxJump:
      "{name}, el Zorro Dorado te lleva al primer puesto. Estás en el casillero {square}.",
    rollMovementLanded: "{name}, sacaste un {roll}. Estás en el casillero {square}.",
    skullReturnToSnakeHead:
      "{name}, caíste en una calavera en el casillero {from}. En este camino de la serpiente, volvés a la cabeza: casillero {to}.",
    magicDoorOpenSuccess:
      "{name}, abriste la puerta mágica: la cuenta era dado necesario = {target} - {bonus}, y sacaste {roll}. Con eso llegás a {total} y abrís. Cuando vuelva a tocarte, tirá el dado para avanzar.",
    magicDoorOpenFail:
      "{name}, no alcanzó para abrir la puerta: la cuenta era dado necesario = {target} - {bonus}, y sacaste {roll}. Te quedaste en {total}, y necesitás {target} o más. Le toca al siguiente jugador.",
    magicDoorBounce:
      "{name}, con la puerta mágica tenés que caer justo en el casillero {door}: te pasaste hasta la {overshot}, rebotás y volvés a la {final}.",
    forkChoiceAsk: "{name}, {prompt}",
    forkOptionSeparator: " o al ",
    forkPromptLeftRight: "¿Querés ir por la izquierda o por la derecha?",
    forkPromptTargets: "¿Querés ir al {options}?",
    forkPromptBackward: "¿Hacia atrás, al {options}?",
    helpGameplay:
      "Escuchá lo que acabo de decir y hacé eso. Si tenés que tirar el dado, decime el número. Si tenés que elegir camino, decime el número de casillero o izquierda o derecha.",
  },
  squares: {
    oceanForestRepeat:
      "{name}, seguís en el casillero {position} ({squareName}). El cruce bosque–océano ya pasó — te quedás acá.",
    directionalIntro:
      "{name}, caíste en el casillero {position}: {squareName}. Tirá {dice} dados de seis, sumalos y decime el total. Te movés {movementPhrase}. Cuando estés listo, decime la suma como respuesta.",
    directionalMovementBackward: "hacia atrás por el camino esa cantidad de casilleros",
    directionalMovementForwardRetreat:
      "hacia adelante por el camino esa cantidad de casilleros (los casilleros de retirada están invertidos para vos después del portal bosque–océano)",
    encounterOptionsPrompt:
      "{name}, {kaliLine} {question} Opciones: A) {a}. B) {b}. C) {c}. D) {d}. Decime cuál opción es correcta.",
    landedBase: "{name}, estás en el casillero {position}: {squareName}.",
    landedWithApplied: "{base} {applied}",
    appliedHeart: "Ganás un corazón.",
    appliedInstrument: "Agarrás un instrumento: {instrument}.",
    appliedItem: "Agarrás: {item}.",
    appliedSkipTurn: "Saltás el próximo turno.",
    appliedTorchUsed: "La antorcha te ayuda — no saltás turno.",
    appliedSkipNoTorch: "Sin antorcha — saltás el próximo turno.",
    appliedAntiWaspUsed: "El traje anti-avispas te ayuda — no saltás turno.",
    appliedSkipNoAntiWasp: "Sin traje anti-avispas — saltás el próximo turno.",
    landedPortalNoChoice:
      " Llegaste por el portal desde el casillero {fromSquare}. Te quedás acá — no hay elección.",
    landedTeleportHint: " Decí el número de casillero donde estás para que todos sepan.",
    goldenFoxAlreadyLeader:
      "{name}, caíste en el casillero {position}: {squareName}. ¡Pero ya vas primero! El zorro dorado no tiene a nadie a quien llevarte, así que te quedás acá.",
    magicDoorHeartsOne: "un corazón",
    magicDoorHeartsMany: "{hearts} corazones",
    magicDoorLanding:
      "{name}, caíste justo en la Puerta Mágica, casillero {position}. Muy bien. Ahora te quedás ahí: en tu próximo turno vas a tirar para intentar abrirla. Para abrir la puerta necesitás llegar a {target} entre el dado y tus ayudas. Si tenés corazones, cada corazón le baja 1 punto a la puerta y cambia el número que necesitás. Ahora tenés {heartsPhrase}: cuando intentes abrir, vas a necesitar sacar al menos un {minDie} en el dado.",
  },
  ui: {
    startKali: "Iniciar Kali",
    iosInstallHint:
      "Instalá esta app en tu iPhone: tocá el ícono Compartir abajo y elegí 'Agregar a la pantalla de inicio'.",
    initializationFailed: "Error al inicializar",
    wakeWordInstruction: 'Decí "{wakeWord}" antes de hablar',
    wakeWordReady: 'Decí "{wakeWord}" para despertarme',
    savedGameDetected: 'Partida guardada. Decí "{wakeWord}, seguir" o "{wakeWord}, juego nuevo"',
    exportLogs: "📁 Exportar",
    versionNoticeMessage: "Hay una nueva versión.",
    versionRefreshButton: "Actualizar",
    buildLabel: "Versión: ",
    status: {
      initializing: "Iniciando...",
      ready: "Listo",
    },
  },
  errors: {
    validationFailed: "Disculpá, no te entendí.",
    invalidDiceRoll: "Ese número no se puede sacar con el dado. Tirá de nuevo.",
    chooseForkFirst: "Primero tenés que elegir el camino en la bifurcación, después tirás el dado.",
    answerRiddleFirst: "Primero respondé la pregunta del animal. Después tirás para moverte.",
    sayEncounterRollAsAnswer:
      "Ahora decime en voz alta el número que te salió, como respuesta. Todavía no es la tirada de movimiento.",
    sayRollNumber: "No te entendí el número. Decime solo el número que sacaste en el dado.",
    finishForkMoveFirst:
      "Primero elegí el camino en la bifurcación (decime el número de casilla). Esa tirada de dados ya contó para moverte.",
    wrongPhaseForRoll:
      'La partida ya terminó. Si querés jugar otra vez, decime "juego nuevo" y arrancamos.',
    setupNotFinished:
      "Todavía estamos armando la partida. Contestame lo que te acabo de preguntar.",
    invalidAnswer: "No me quedó claro. Intentá de nuevo con una respuesta clara.",
    wrongTurn: "No es tu turno para cambiar eso.",
    setStateForbidden: "No puedo cambiar eso por vos.",
    pathNotAllowed: "Ese movimiento no está permitido ahora.",
    microphoneAccess: "No puedo acceder al micrófono.",
    ttsNotSupported: "El sistema de voz no es compatible.",
    somethingWentWrong: "Algo salió mal. Por favor intentá de nuevo.",
    sttOnlineTimeout: "No te escuché bien por ruido. Repetí, por favor.",
    sttOnlineFailed: "Falló la transcripción online. Probemos de nuevo.",
  },
  llm: {
    retrying: "Dejame intentar de nuevo...",
    allRetriesFailed: "No pude conectar con el asistente. Probá de nuevo en un momento.",
  },
  items: {
    torch: "Antorcha",
    "anti-wasp": "Traje anti-avispas",
  },
  nicknames: [
    "el Grande",
    "el Sabio",
    "el Valiente",
    "el Amable",
    "el Veloz",
    "el Astuto",
    "el Audaz",
    "el Poderoso",
    "el Brillante",
    "el Genial",
    "el Copado",
    "el Increíble",
    "Junior",
    "Senior",
    "Grande",
    "Chico",
  ],
  numberWords: [
    "cero",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
    "diez",
  ],
  confirmationWords: {
    yes: ["sí", "si", "correcto", "bueno", "dale", "seguro", "okay", "ok"],
    no: ["no", "nope"],
  },
};
