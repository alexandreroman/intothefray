import { getPref, setPref } from './prefs';

const NAME_KEY = 'itf-name';

// Generic heroic words only, no character names. The longest pair must fit in the
// 24 runes the server keeps from a player name (maxNameRunes in internal/game/lobby.go).
export const ADJECTIVES: readonly string[] = [
  'Atomic',
  'Blazing',
  'Bold',
  'Brave',
  'Clever',
  'Cosmic',
  'Crimson',
  'Daring',
  'Electric',
  'Emerald',
  'Fearless',
  'Fierce',
  'Gallant',
  'Gentle',
  'Golden',
  'Iron',
  'Loyal',
  'Lucky',
  'Mighty',
  'Mystic',
  'Noble',
  'Quiet',
  'Radiant',
  'Rapid',
  'Scarlet',
  'Shadow',
  'Silent',
  'Silver',
  'Stalwart',
  'Steady',
  'Stellar',
  'Swift',
  'Thunder',
  'Valiant',
  'Vigilant',
  'Wild',
];

export const NOUNS: readonly string[] = [
  'Arrow',
  'Beacon',
  'Bear',
  'Champion',
  'Comet',
  'Crusader',
  'Defender',
  'Eagle',
  'Falcon',
  'Guardian',
  'Hawk',
  'Hunter',
  'Knight',
  'Lancer',
  'Lion',
  'Lynx',
  'Meteor',
  'Paladin',
  'Panther',
  'Protector',
  'Ranger',
  'Raven',
  'Rider',
  'Sentinel',
  'Shield',
  'Spark',
  'Storm',
  'Striker',
  'Tempest',
  'Tiger',
  'Titan',
  'Vanguard',
  'Voyager',
  'Wanderer',
  'Warden',
  'Wolf',
];

function pick(words: readonly string[], random: () => number): string {
  const word = words[Math.floor(random() * words.length)];
  if (word === undefined) {
    throw new RangeError('random() must return a number in [0, 1)');
  }
  return word;
}

/** Returns a random "Adjective Noun" name, such as "Brave Falcon". */
export function randomName(random: () => number = Math.random): string {
  return `${pick(ADJECTIVES, random)} ${pick(NOUNS, random)}`;
}

/** Stores the player name, trimmed, for the next games. */
export function savePlayerName(name: string): void {
  setPref(NAME_KEY, name.trim());
}

/**
 * Returns the stored player name. Without one, a random name is generated and stored,
 * so that the player keeps it next time and can change it in the options.
 */
export function playerName(): string {
  const stored = getPref(NAME_KEY)?.trim();
  if (stored) {
    return stored;
  }
  const generated = randomName();
  savePlayerName(generated);
  return generated;
}
