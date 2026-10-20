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

// The server's definition (dropEmoji in internal/game/lobby.go): other symbols, format
// characters such as the zero-width joiner, enclosing marks such as the keycap, variation
// selectors, and the skin tone modifiers.
const EMOJI = /[\p{So}\p{Cf}\p{Me}\p{Variation_Selector}\u{1F3FB}-\u{1F3FF}]/gu;

/** Removes the characters emojis are made of from a name, without trimming it. */
export function stripEmoji(name: string): string {
  return name.replace(EMOJI, '');
}

/**
 * Strips emojis from a player name, trims it and cuts it to MAX_NAME_LENGTH code points,
 * as cleanName does on the server, so that a character outside the Basic Multilingual Plane
 * is never split in half and emojis never count toward the limit.
 */
export function cleanName(name: string): string {
  return Array.from(stripEmoji(name).trim()).slice(0, MAX_NAME_LENGTH).join('').trimEnd();
}

/** Stores the player name, cleaned as the server does, for the next games. */
export function savePlayerName(name: string): void {
  setPref(NAME_KEY, cleanName(name));
}

/**
 * Returns the stored player name. Without one, a random name is generated and stored,
 * so that the player keeps it next time and can change it in the options.
 */
export function playerName(): string {
  // A name stored under older, looser rules (longer, with emojis) is cleaned on read.
  const stored = cleanName(getPref(NAME_KEY) ?? '');
  if (stored) {
    return stored;
  }
  const generated = randomName();
  savePlayerName(generated);
  return generated;
}
