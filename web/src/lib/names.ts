import { getPref, setPref } from './prefs';

const NAME_KEY = 'itf-name';

/** Longest player name, in code points. Mirrors maxNameRunes in internal/game/lobby.go. */
export const MAX_NAME_LENGTH = 16;

// Generic heroic words only, no character names. The longest pair must fit in
// MAX_NAME_LENGTH, so adjectives have at most 7 letters and nouns at most 8.
export const ADJECTIVES: readonly string[] = [
  'Atomic',
  'Blazing',
  'Bold',
  'Brave',
  'Clever',
  'Cosmic',
  'Crimson',
  'Daring',
  'Emerald',
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
  'Steady',
  'Stellar',
  'Swift',
  'Thunder',
  'Valiant',
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

/**
 * Trims a player name and cuts it to MAX_NAME_LENGTH code points, as the server does,
 * so that a character outside the Basic Multilingual Plane is never split in half.
 */
export function cutName(name: string): string {
  return Array.from(name.trim()).slice(0, MAX_NAME_LENGTH).join('').trimEnd();
}

/** Stores the player name, trimmed and cut, for the next games. */
export function savePlayerName(name: string): void {
  setPref(NAME_KEY, cutName(name));
}

/**
 * Returns the stored player name. Without one, a random name is generated and stored,
 * so that the player keeps it next time and can change it in the options.
 */
export function playerName(): string {
  // A name stored under an older, longer limit is cut on read.
  const stored = cutName(getPref(NAME_KEY) ?? '');
  if (stored) {
    return stored;
  }
  const generated = randomName();
  savePlayerName(generated);
  return generated;
}
