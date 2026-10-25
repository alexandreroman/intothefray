/** The CSS colour of a player colour index, one of the --p1 … --p4 tokens: colour 0 is var(--p1). */
export function playerColorVar(color: number): string {
  return `var(${playerColorToken(color)})`;
}

/** The name of a player colour's CSS token (styles/tokens.css): colour 0 is --p1. */
export function playerColorToken(color: number): string {
  return `--p${color + 1}`;
}
