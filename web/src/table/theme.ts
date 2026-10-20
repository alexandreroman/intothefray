// What a theme changes on the table: card backs, the first player token
// image and the table colours. The theme key and applyTheme() live in
// lib/theme.ts, and tokens.css paints the colours under [data-theme]; this
// module only holds each theme's images.

import { storedTheme, type Theme } from '../lib/theme';
import type { Back } from '../lib/types';

/** The backs a theme may have an image for: a side deck's own back is always drawn. */
type ImagedBack = Exclude<Back, 'side'>;

interface ThemeAssets {
  /** Back image per back kind; null draws the backs instead. */
  backs: Record<ImagedBack, string> | null;
  /** First player token image; null draws a stand-in. */
  firstPlayer: string | null;
}

const CEREBRO = 'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/';

const OFFICIAL_BACKS: Record<ImagedBack, string> = {
  player: CEREBRO + 'HeroBack.jpg',
  encounter: CEREBRO + 'EncounterBack.jpg',
  villain: CEREBRO + 'VillainBack.jpg',
};

const FIRST_PLAYER_TOKEN =
  'https://card-table.app/images/table/first_player_token_marvelchampions.png';

const THEME_ASSETS: Record<Theme, ThemeAssets> = {
  official: { backs: OFFICIAL_BACKS, firstPlayer: FIRST_PLAYER_TOKEN },
  minimal: { backs: null, firstPlayer: null },
  felt: { backs: OFFICIAL_BACKS, firstPlayer: FIRST_PLAYER_TOKEN },
};

/**
 * The back image of a card, or null when the theme draws its backs. No image
 * exists for a side deck's own back: every theme draws it.
 */
export function backUrl(back: Back, theme: Theme = storedTheme()): string | null {
  if (back === 'side') {
    return null;
  }
  return THEME_ASSETS[theme].backs?.[back] ?? null;
}

/** The first player token image, or null when the theme draws it. */
export function firstPlayerUrl(theme: Theme = storedTheme()): string | null {
  return THEME_ASSETS[theme].firstPlayer;
}
