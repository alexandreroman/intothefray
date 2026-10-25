// What a theme changes on the table: card backs, the first player token
// image and the table colours. The theme key and applyTheme() live in
// lib/theme.ts, and tokens.css paints the colours under [data-theme]; this
// module only holds each theme's images.

import { storedTheme, type Theme } from '../lib/theme';
import type { Back } from '../lib/types';

interface ThemeAssets {
  /** Back image per back kind; null draws the backs instead. */
  backs: Record<Back, string> | null;
  /** First player token image; null draws a stand-in. */
  firstPlayer: string | null;
}

// Fixed keys on the image CDN: a changed asset gets a new name, so no manifest is read here.
const ASSETS = 'https://img.intothefray.xyz/assets/';

const OFFICIAL_BACKS: Record<Back, string> = {
  player: ASSETS + 'back-player.avif',
  encounter: ASSETS + 'back-encounter.avif',
  villain: ASSETS + 'back-villain.avif',
};

const FIRST_PLAYER_TOKEN = ASSETS + 'first-player-v2.avif';

const THEME_ASSETS: Record<Theme, ThemeAssets> = {
  official: { backs: OFFICIAL_BACKS, firstPlayer: FIRST_PLAYER_TOKEN },
  minimal: { backs: null, firstPlayer: null },
  felt: { backs: OFFICIAL_BACKS, firstPlayer: FIRST_PLAYER_TOKEN },
};

/** The back image of a card, or null when the theme draws its backs. */
export function backUrl(back: Back, theme: Theme = storedTheme()): string | null {
  return THEME_ASSETS[theme].backs?.[back] ?? null;
}

/** The first player token image, or null when the theme draws it. */
export function firstPlayerUrl(theme: Theme = storedTheme()): string | null {
  return THEME_ASSETS[theme].firstPlayer;
}
