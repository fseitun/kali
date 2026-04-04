export const esAR = {
  setup: {
    welcome: "¡Bienvenidos a {game}! Arranquemos.",
    playerCount: "¿Cuántos jugadores? El máximo es {max}.",
    playerCountInvalid: "Por favor, decí un número del {min} al {max}.",
    playerName: "Jugador {number}, ¿cómo te llamás?",
    nameInvalid: "Perdón, no te escuché bien. ¿Cómo te llamás?",
    nameConfirm: "{name}, ¿está bien?",
    nameConfirmYes: "¡Bárbaro, {name}!",
    nameConfirmRetry: "Está bien. ¿Cómo querías que te llamara?",
    nameConflict: "Ya hay un {name}. ¿Qué tal si te llamamos {suggestion}?",
    nameConflictPerfect: "¡Listo!",
    nameConflictAlternative: "¿Cómo preferís que te llamara?",
    nameConflictFallback: "Bueno, seguimos con {name}.",
    allNamesReady: "¡Genial! Ya estamos: {names}. ¡Arrancamos!",
    ready: "¡Perfecto! Arranquemos. {name}, vos empezás.",
    extractionFailed: "No te escuché bien.",
  },
  game: {
    proactiveStart: "Empezamos. Te explico la situación.",
    turnAnnouncement:
      "{name}, te toca. Estás en el casillero {position}. Tira el dado y decime qué sacaste.",
    turnAnnouncementMagicDoor:
      "{name}, te toca. Estás en el casillero {position}, la puerta mágica. Tenés {heartsPhrase}. Tirá un dado solo para intentar abrirla: pensalo así, dado que necesitás = {target} menos tus corazones. Con lo que tenés ahora, necesitás al menos un {minDie} en el dado. Decime qué sacaste.",
    turnAnnouncementMagicDoorWithScimitar:
      "{name}, te toca. Estás en el casillero {position}, la puerta mágica. Tenés {heartsPhrase} y la cimitarra, que suma un punto más para abrirla. Tirá un dado solo para intentar abrirla: pensalo así, dado que necesitás = {target} menos tus corazones y menos 1 por la cimitarra. Con lo que tenés ahora, necesitás al menos un {minDie} en el dado. Decime qué sacaste.",
    turnHandoff: "Ahora le toca a {name}.",
    turnAnnouncementWithDecision: "{name}, te toca. Estás en el casillero {position}. {prompt}",
    skipTurnAnnouncement: "{name}, saltás este turno.",
    readyToPlay: "¡Listos para jugar!",
    yourTurn: "Te toca, {name}.",
    moved: "{name} avanzó al casillero {position}.",
    winner: "¡{name} ganó! ¡Felicitaciones!",
    position: "Estás en el casillero {position}.",
    powerCheckPass: "Pasaste.",
    powerCheckPassForkPrompt:
      "{name}, te quedan {remainingSteps} casilleros por mover. Estás en la bifurcación del {forkSquare}: decime si vas al {options}.",
    powerCheckPassLandedAt: "{name}, caíste en el casillero {position}.",
    powerCheckPassBoardJump:
      "{name}, caíste en el casillero {fromSquare} y un atajo del tablero te lleva al casillero {toSquare}{suffix}.",
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
    magicDoorOpenSuccess:
      "{name}, abriste la puerta mágica: la cuenta era dado necesario = {target} - {bonus}, y sacaste {roll}. Con eso llegás a {total} y abrís. Cuando vuelva a tocarte, tirá el dado para avanzar.",
    magicDoorOpenFail:
      "{name}, no alcanzó para abrir la puerta: la cuenta era dado necesario = {target} - {bonus}, y sacaste {roll}. Te quedaste en {total}, y necesitás {target} o más. Le toca al siguiente jugador.",
    magicDoorBounce:
      "{name}, con la puerta mágica tenés que caer justo en el casillero {door}: te pasaste hasta la {overshot}, rebotás y volvés a la {final}.",
    forkChoiceAsk: "{name}, {prompt}",
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
    magicDoorHeartsOne: "un corazón",
    magicDoorHeartsMany: "{hearts} corazones",
    magicDoorLanding:
      "{name}, caíste justo en la Puerta Mágica, casillero {position}. Muy bien. Ahora te quedás ahí: en tu próximo turno vas a tirar para intentar abrirla. Para abrir la puerta necesitás llegar a {target} entre el dado y tus ayudas. Si tenés corazones, cada corazón le baja 1 punto a la puerta y cambia el número que necesitás. Ahora tenés {heartsPhrase}: cuando intentes abrir, vas a necesitar sacar al menos un {minDie} en el dado.",
    magicDoorLandingWithScimitar:
      "{name}, caíste justo en la Puerta Mágica, casillero {position}. Muy bien. Ahora te quedás ahí: en tu próximo turno vas a tirar para intentar abrirla. Para abrir la puerta necesitás llegar a {target} entre el dado y tus ayudas. Si tenés corazones, cada corazón le baja 1 punto a la puerta y cambia el número que necesitás; además, la cimitarra suma 1 punto más. Ahora tenés {heartsPhrase} y la cimitarra: cuando intentes abrir, vas a necesitar sacar al menos un {minDie} en el dado.",
    scimitarDoorHint:
      "La cimitarra te resta 1 al dado que necesitás para abrir la puerta mágica: pensalo como dado necesario = {target} - corazones - 1.",
  },
  ui: {
    startButton: "Jugar",
    stopButton: "Parar",
    startKali: "Iniciar Kali",
    iosInstallHint:
      "Instalá esta app en tu iPhone: tocá el ícono Compartir abajo y elegí 'Agregar a la pantalla de inicio'.",
    initializationFailed: "Error al inicializar",
    listeningForCommand: "Esperando comando...",
    wakeWordInstruction: 'Decí "{wakeWord}" antes de hablar',
    wakeWordReady: 'Decí "{wakeWord}" para despertarme',
    savedGameDetected: 'Partida guardada. Decí "{wakeWord}, seguir" o "{wakeWord}, juego nuevo"',
    exportLogs: "📁 Exportar",
    versionNoticeMessage: "Hay una nueva versión.",
    versionRefreshButton: "Actualizar",
    buildLabel: "Versión: ",
    upToDate: "Al día",
    status: {
      initializing: "Iniciando...",
      loading: "Cargando modelo...",
      ready: "Listo",
      listening: "Escuchando...",
      processing: "Procesando...",
      speaking: "Hablando...",
      error: "Error",
    },
  },
  errors: {
    validationFailed: "Disculpá, no te entendí.",
    invalidDiceRoll: "Ese número no se puede sacar con el dado. Tirá de nuevo.",
    chooseForkFirst: "Primero tenés que elegir el camino en la bifurcación, después tirás el dado.",
    resolveSquareEffectFirst: "Primero terminá lo de esta casilla, después seguimos.",
    answerRiddleFirst: "Primero respondé la pregunta del animal. Después tirás para moverte.",
    sayEncounterRollAsAnswer:
      "Ahora decime en voz alta el número que te salió, como respuesta. Todavía no es la tirada de movimiento.",
    finishForkMoveFirst:
      "Primero elegí el camino en la bifurcación (decime el número de casilla). Esa tirada de dados ya contó para moverte.",
    wrongPhaseForRoll: "Ese número no es lo que necesito ahora.",
    invalidAnswer: "No me quedó claro. Intentá de nuevo con una respuesta clara.",
    wrongTurn: "No es tu turno para cambiar eso.",
    setStateForbidden: "No puedo cambiar eso por vos.",
    pathNotAllowed: "Ese movimiento no está permitido ahora.",
    microphoneAccess: "No puedo acceder al micrófono.",
    modelDownload: "Error al descargar el modelo.",
    ttsNotSupported: "El sistema de voz no es compatible.",
    somethingWentWrong: "Algo salió mal. Por favor intentá de nuevo.",
  },
  llm: {
    retrying: "Dejame intentar de nuevo...",
    allRetriesFailed: "No pude conectar con el asistente. Probá de nuevo en un momento.",
    networkError: "Tengo problemas de conexión. Intentalo de nuevo.",
  },
  items: {
    torch: "Antorcha",
    "anti-wasp": "Traje anti-avispas",
    scimitar: "Cimitarra",
  },
  narration: {
    stateSquareNumber:
      "Always state the destination square number explicitly in your narration (e.g. 'Llegaste al casillero 145' or 'Estás en el 82'). Do not say 'mirá dónde aterrizaste' — say the number directly so kids know where they are.",
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
