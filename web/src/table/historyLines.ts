// The wording of a history line, shared by the side column (SidePanel.svelte) and the history sheet
// (HistorySheet.svelte), so that both read the same.

import type { FaceRef, LogPart, LogView } from '../lib/types';

/** The name of a face in the viewer's language, or undefined when unknown. */
export type NameOf = (ref: FaceRef) => string | undefined;

export interface LinePart {
  text: string;
  /** Bracketed details, dimmed. */
  aside: boolean;
  /** A card name, in bold. Only the server flags one: no text a player typed can. */
  card: boolean;
}

/** Splits a piece of a line around its bracketed details. */
function splitAsides(text: string, card: boolean): LinePart[] {
  const parts: LinePart[] = [];
  let start = 0;
  for (const match of text.matchAll(/\([^()]*\)/g)) {
    parts.push({ text: text.slice(start, match.index), aside: false, card });
    parts.push({ text: match[0], aside: true, card });
    start = match.index + match[0].length;
  }
  parts.push({ text: text.slice(start), aside: false, card });
  return parts.filter((part) => part.text !== '');
}

/** The text of a piece: a card name it refers to is shown in the viewer's language, when known. */
function textOf(piece: LogPart, nameOf: NameOf | undefined): string {
  if (piece.card !== true || piece.ref === undefined) {
    return piece.text;
  }
  return nameOf?.(piece.ref) ?? piece.text;
}

/** Splits a line into its card names and its bracketed details. */
export function partsOf(entry: LogView, nameOf?: NameOf): LinePart[] {
  const pieces = entry.parts ?? [{ text: entry.text }];
  return pieces.flatMap((piece) => splitAsides(textOf(piece, nameOf), piece.card === true));
}

/** The time of a line, hh:mm in local time. */
export function timeOf(at: string): string {
  return new Date(at).toTimeString().slice(0, 5);
}
