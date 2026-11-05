/** A card face's width over its height: portrait, 5:7. */
export const CARD_ASPECT = 5 / 7;

/*
 * The illustration of a hero or villain face, as fractions of the card's width from its left edge
 * and of its height from its top edge: right of the stat column (THW, ATK, DEF or SCH, ATK), just
 * inside the right edge, under the title bar (and a villain's "Villain" banner), above the text
 * box (and a hero's "Hero" or "Alter-Ego" tag). Read on Spider-Man (01001A), Scott Summers,
 * Rhino (01094) and Apocalypse, with a little slack on every side.
 */
export const ART_LEFT = 0.22;
export const ART_RIGHT = 0.97;
export const ART_TOP = 0.13;
export const ART_BOTTOM = 0.54;

/**
 * Where the illustration lies on a portrait face, its edges as fractions of the card's width
 * (left, right) and height (top, bottom), from its top left corner.
 */
export interface ArtWindow {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * A face with a stat column on the left: hero, alter ego, ally, villain, minion, leader. Also read
 * on Amadeus Cho, Beta Ray Bill, Moon Knight, M.O.R.B.I.U.S., She-Hulk and Captain America
 * (leader): over the cost circle of an ally and the text box of a leader by a hair at its bottom,
 * which an art tile's name strip covers.
 */
export const CHARACTER_ART: ArtWindow = {
  left: ART_LEFT,
  right: ART_RIGHT,
  top: ART_TOP,
  bottom: ART_BOTTOM,
};

/*
 * The windows below were read on real cards, with slack so that neither a title, a type tag, a
 * cost, nor a text box shows.
 */

/**
 * An upgrade: its title runs up the left edge, its "Upgrade" tag under the cost. Read on Organic
 * Webbing, Magik's Crown, Expert Marksman, Intangible and Aerial Recon.
 */
const UPGRADE_ART: ArtWindow = { left: 0.14, right: 0.96, top: 0.16, bottom: 0.55 };

/**
 * A support or an event: the title across the top, the type tag under it on the left. Read on
 * Fury's Flying Car, Med Team, Team Training, Banner's Laboratory, Joining Forces, What Doesn't
 * Kill Me, Raising Hell and Know Your Enemy.
 */
const TITLE_TOP_ART: ArtWindow = { left: 0.04, right: 0.96, top: 0.17, bottom: 0.55 };

/**
 * A resource: the art from the top edge down to the title, halfway down the card. Read on Band
 * Together, Self Preservation, Passion for Justice, Avian Anatomy and Jackpot!.
 */
const RESOURCE_ART: ArtWindow = { left: 0.04, right: 0.96, top: 0.03, bottom: 0.5 };

/**
 * An attachment: the art from the top edge, its title and "Attachment" tag running up the left
 * edge below a third of the card, its text box from under half of it. Read on Temporal Shield,
 * Favored Weapon, Paladin's Pistol, Fallen Warrior and Solid-Sound Body.
 */
const ATTACHMENT_ART: ArtWindow = { left: 0.26, right: 0.96, top: 0.03, bottom: 0.42 };

/**
 * An encounter card with its title across the top: treachery, obligation, environment, evidence.
 * Read on Land Out of Time, Android Efficiency, Heroic Strike, Home by Dawn, Weakened, Stop The
 * Presses!, Back-Alley Enclave, Wiretap and Ideology.
 */
const ENCOUNTER_ART: ArtWindow = { left: 0.04, right: 0.96, top: 0.15, bottom: 0.54 };

const ART_WINDOWS: Record<string, ArtWindow> = {
  hero: CHARACTER_ART,
  alter_ego: CHARACTER_ART,
  ally: CHARACTER_ART,
  villain: CHARACTER_ART,
  minion: CHARACTER_ART,
  leader: CHARACTER_ART,
  upgrade: UPGRADE_ART,
  support: TITLE_TOP_ART,
  event: TITLE_TOP_ART,
  resource: RESOURCE_ART,
  attachment: ATTACHMENT_ART,
  treachery: ENCOUNTER_ART,
  obligation: ENCOUNTER_ART,
  environment: ENCOUNTER_ART,
  evidence_means: ENCOUNTER_ART,
  evidence_motive: ENCOUNTER_ART,
  evidence_opportunity: ENCOUNTER_ART,
};

/**
 * The art window of a portrait face of that type (PackFace.type), or null for a face drawn whole:
 * a scheme, whose threat values are what the table needs to read, or a type with no known layout.
 */
export function artWindowFor(type: string): ArtWindow | null {
  return ART_WINDOWS[type] ?? null;
}

/** Where the card image lies in its box, each value a fraction of the box's width or height. */
export interface ArtFrame {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Places a card image in a box of the given aspect (width over height) so that only its
 * illustration shows: as small as it can be while the art window fills the box, and centred on
 * it. Nothing outside the window (by default a character's: neither the stat column, nor the
 * title, nor the text box) ever shows.
 */
export function artFrame(boxAspect: number, art: ArtWindow = CHARACTER_ART): ArtFrame {
  const artWidth = art.right - art.left;
  const artHeight = art.bottom - art.top;
  // The card's width, in box widths: its art at least as wide as the box, and as tall.
  const width = Math.max(1 / artWidth, CARD_ASPECT / (boxAspect * artHeight));
  const height = (width * boxAspect) / CARD_ASPECT;
  return {
    width,
    height,
    left: 0.5 - ((art.left + art.right) / 2) * width,
    top: 0.5 - ((art.top + art.bottom) / 2) * height,
  };
}
