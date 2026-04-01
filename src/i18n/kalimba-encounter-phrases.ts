/**
 * Possessive phrases for power-check TTS: insert after "puntaje" (es-AR) or as the beat-target (en-US).
 * Keys must match `name` on every Kalimba square that defines `power` in config.json.
 */
export const POSSESSIVE_SCORE_PHRASE_ES: Record<string, string> = {
  Falcon: "del halcón",
  Cobra: "de la cobra",
  Eagle: "del águila",
  Beetle: "del escarabajo",
  Camel: "del camello",
  Coyote: "del coyote",
  Scorpion: "del escorpión",
  Wolf: "del lobo",
  "Boa constrictor": "de la boa",
  "Poison frog": "de la rana venenosa",
  "Grizzly bear": "del oso grizzly",
  Squirrel: "de la ardilla",
  Deer: "del ciervo",
  "Tiger shark": "del tiburón tigre",
  "Octopus and starfish": "del pulpo y la estrella de mar",
  Clownfish: "del pez payaso",
  "Sea turtle": "de la tortuga marina",
  "Killer whale": "de la orca",
  Penguin: "del pingüino",
  Narwhal: "del narval",
  Walrus: "de la morsa",
  "Polar bear": "del oso polar",
  "Blue whale": "de la ballena azul",
  "Ghost of a baboon": "del espíritu del babuino",
  "Ghost of a black bear": "del espíritu del oso negro",
  Baboon: "del babuino",
  Caiman: "del caimán",
  "Black bear": "del oso negro",
  "Wild dogs": "de los perros salvajes",
  Ostrich: "de la avestruz",
  Crocodile: "del cocodrilo",
  Rhinoceros: "del rinoceronte",
  Giraffe: "de la jirafa",
  "Nile crocodile": "del cocodrilo del Nilo",
  "Lion Makulu": "del león Makulu",
  Cheetah: "del guepardo",
  "African Elephant Craig": "del elefante africano Craig",
  "Silverback gorilla": "del gorila de espalda plateada",
  Hippopotamus: "del hipopótamo",
  "White rhinoceros": "del rinoceronte blanco",
  Kangaroo: "del canguro",
  Lizard: "del lagarto",
  "Komodo dragon": "del dragón de Komodo",
  "Asian elephant": "del elefante asiático",
  "Tiger Shere Khan": "del tigre Shere Khan",
  "Tamil Nadu elephant": "del elefante de Tamil Nadu",
  Peacock: "del pavo real",
};

/** English: object of comparison after "exceed" / "beat". */
export const POSSESSIVE_SCORE_PHRASE_EN: Record<string, string> = {
  Falcon: "the falcon's power",
  Cobra: "the cobra's power",
  Eagle: "the eagle's power",
  Beetle: "the beetle's power",
  Camel: "the camel's power",
  Coyote: "the coyote's power",
  Scorpion: "the scorpion's power",
  Wolf: "the wolf's power",
  "Boa constrictor": "the boa constrictor's power",
  "Poison frog": "the poison frog's power",
  "Grizzly bear": "the grizzly bear's power",
  Squirrel: "the squirrel's power",
  Deer: "the deer's power",
  "Tiger shark": "the tiger shark's power",
  "Octopus and starfish": "the octopus and starfish's power",
  Clownfish: "the clownfish's power",
  "Sea turtle": "the sea turtle's power",
  "Killer whale": "the killer whale's power",
  Penguin: "the penguin's power",
  Narwhal: "the narwhal's power",
  Walrus: "the walrus's power",
  "Polar bear": "the polar bear's power",
  "Blue whale": "the blue whale's power",
  "Ghost of a baboon": "the ghost baboon's power",
  "Ghost of a black bear": "the ghost black bear's power",
  Baboon: "the baboon's power",
  Caiman: "the caiman's power",
  "Black bear": "the black bear's power",
  "Wild dogs": "the wild dogs' power",
  Ostrich: "the ostrich's power",
  Crocodile: "the crocodile's power",
  Rhinoceros: "the rhinoceros's power",
  Giraffe: "the giraffe's power",
  "Nile crocodile": "the Nile crocodile's power",
  "Lion Makulu": "Lion Makulu's power",
  Cheetah: "the cheetah's power",
  "African Elephant Craig": "African Elephant Craig's power",
  "Silverback gorilla": "the silverback gorilla's power",
  Hippopotamus: "the hippopotamus's power",
  "White rhinoceros": "the white rhinoceros's power",
  Kangaroo: "the kangaroo's power",
  Lizard: "the lizard's power",
  "Komodo dragon": "the Komodo dragon's power",
  "Asian elephant": "the Asian elephant's power",
  "Tiger Shere Khan": "Tiger Shere Khan's power",
  "Tamil Nadu elephant": "the Tamil Nadu elephant's power",
  Peacock: "the peacock's power",
};

const FALLBACK_ES = "del animal";
const FALLBACK_EN = "the animal's power";

export function possessiveScorePhraseEs(configName: string | undefined): string {
  if (!configName) {
    return FALLBACK_ES;
  }
  return POSSESSIVE_SCORE_PHRASE_ES[configName] ?? FALLBACK_ES;
}

export function possessiveScorePhraseEn(configName: string | undefined): string {
  if (!configName) {
    return FALLBACK_EN;
  }
  return POSSESSIVE_SCORE_PHRASE_EN[configName] ?? FALLBACK_EN;
}

/** Short noun phrase for TTS when naming a destination square (e.g. after a board shortcut). */
export function squareSpeechLabelEs(configName: string | undefined): string | undefined {
  if (!configName) {
    return undefined;
  }
  const p = POSSESSIVE_SCORE_PHRASE_ES[configName];
  if (!p) {
    return undefined;
  }
  if (p.startsWith("del ")) {
    return `el ${p.slice(4)}`;
  }
  if (p.startsWith("de la ")) {
    return `la ${p.slice(6)}`;
  }
  if (p.startsWith("de los ")) {
    return `los ${p.slice(7)}`;
  }
  return undefined;
}

export function squareSpeechLabelEn(configName: string | undefined): string | undefined {
  if (!configName) {
    return undefined;
  }
  const p = POSSESSIVE_SCORE_PHRASE_EN[configName];
  if (!p) {
    return configName;
  }
  if (p.endsWith("'s power")) {
    return p.slice(0, -"'s power".length);
  }
  if (p.endsWith(" power")) {
    return p.slice(0, -" power".length).trim();
  }
  return p;
}
