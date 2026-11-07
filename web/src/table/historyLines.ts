// The history lines, worded once for the side column (SidePanel.svelte) and the history sheet
// (HistorySheet.svelte), so that both read the same; HistoryText.svelte draws their words.

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

/** A line of the history, as both lists draw it. */
export interface HistoryLine {
  /** The line's position from the oldest, which does not move when lines are added. */
  key: number;
  entry: LogView;
  parts: LinePart[];
  /** hh:mm in local time. */
  time: string;
}

/** The lines of a log sent oldest first, newest first, keyed by their position from the oldest. */
export function historyLines(log: LogView[], nameOf?: NameOf): HistoryLine[] {
  return log
    .map((entry, index) => ({
      key: index,
      entry,
      parts: partsOf(entry, nameOf),
      time: timeOf(entry.at),
    }))
    .reverse();
}

/** Splits a line into its card names and its bracketed details. */
function partsOf(entry: LogView, nameOf?: NameOf): LinePart[] {
  const pieces = entry.parts ?? [{ text: entry.text }];
  return pieces.flatMap((piece) => splitAsides(textOf(piece, nameOf), piece.card === true));
}

/** The time of a line, hh:mm in local time. */
function timeOf(at: string): string {
  return new Date(at).toTimeString().slice(0, 5);
}
