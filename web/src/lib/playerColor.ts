/** The CSS colour of a player colour index, one of the --p1 … --p4 tokens: colour 0 is var(--p1). */
export function playerColorVar(color: number): string {
  return `var(--p${color + 1})`;
}
