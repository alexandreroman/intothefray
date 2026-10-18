// What a theme changes on the table: card backs, the first player token
// image and the table colours. The theme key and applyTheme() live in
// lib/theme.ts; this module only holds each theme's assets.

import { storedTheme, type Theme } from '../lib/theme';
import type { Back } from '../lib/types';

export interface TableColors {
  tableBg: string;
  dot: string;
  line: string;
}

export interface ThemeAssets {
  /** Back image per back kind; null draws the backs instead. */
  backs: Record<Back, string> | null;
  /** First player token image; null draws a stand-in. */
  firstPlayer: string | null;
  /** Also set in tokens.css under [data-theme], which is what paints them. */
  colors: TableColors;
}

const CEREBRO = 'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/';

const OFFICIAL_BACKS: Record<Back, string> = {
  player: CEREBRO + 'HeroBack.jpg',
  encounter: CEREBRO + 'EncounterBack.jpg',
  villain: CEREBRO + 'VillainBack.jpg',
};

const FIRST_PLAYER_TOKEN =
  'https://card-table.app/images/table/first_player_token_marvelchampions.png';

const DEFAULT_COLORS: TableColors = { tableBg: '#0c111b', dot: '#161d2b', line: '#2c3654' };

export const THEME_ASSETS: Record<Theme, ThemeAssets> = {
  official: { backs: OFFICIAL_BACKS, firstPlayer: FIRST_PLAYER_TOKEN, colors: DEFAULT_COLORS },
  minimal: { backs: null, firstPlayer: null, colors: DEFAULT_COLORS },
  felt: {
    backs: OFFICIAL_BACKS,
    firstPlayer: FIRST_PLAYER_TOKEN,
    colors: { tableBg: '#0f2a1d', dot: '#1d3a2b', line: '#2d5a42' },
  },
};

/** The back image of a card, or null when the theme draws its backs. */
export function backUrl(back: Back, theme: Theme = storedTheme()): string | null {
  return THEME_ASSETS[theme].backs?.[back] ?? null;
}

/** The first player token image, or null when the theme draws it. */
export function firstPlayerUrl(theme: Theme = storedTheme()): string | null {
  return THEME_ASSETS[theme].firstPlayer;
}
